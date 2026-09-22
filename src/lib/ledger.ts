import { createHash, randomBytes, randomUUID } from "node:crypto";
import { all, NOW, one, run, transaction } from "./db.ts";
import type { NetworkId } from "./networks.ts";
import { payReferral } from "./referrals.ts";
import { planClaim, type ClaimPlan, type ClaimState, type ScoredTask } from "./scoring.ts";

import { MAX_ACTIVE_KEYS } from "./limits.ts";

export { MAX_ACTIVE_KEYS };
const KEY_PREFIX = "kredit_sk_";

const lower = (address: string) => address.toLowerCase();
const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export async function getBalance(address: string) {
  const row = await one<{ balance: number }>("SELECT COALESCE(SUM(amount), 0)::int AS balance FROM ledger WHERE address = ?", [
    lower(address),
  ]);
  return row?.balance ?? 0;
}

// Everything that ever came in, and everything that went out, as positive numbers.
export async function getTotals(address: string) {
  const row = await one<{ earned: number; spent: number }>(
    "SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::int AS earned, COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0)::int AS spent FROM ledger WHERE address = ?",
    [lower(address)],
  );
  return { earned: row?.earned ?? 0, spent: row?.spent ?? 0 };
}

export type LedgerEntry = {
  id: number;
  amount: number;
  kind: string;
  memo: string;
  createdAt: string;
  network: NetworkId | null;
  txHash: string | null; // the on-chain receipt this row came from, if any
};

export function listLedger(address: string, limit = 20) {
  return all<LedgerEntry>(
    `SELECT id, amount, kind, memo, created_at AS "createdAt", network, tx_hash AS "txHash" FROM ledger WHERE address = ? ORDER BY id DESC LIMIT ?`,
    [lower(address), limit],
  );
}

// --- Claims ----------------------------------------------------------------

export async function getClaimState(address: string, network: NetworkId, hashes: string[]): Promise<ClaimState> {
  const owner = lower(address);
  // A transaction already claimed by anyone is off the table.
  const claimed = await all<{ hash: string }>("SELECT hash FROM claimed_txs WHERE network = ? AND hash = ANY(?::text[])", [
    network,
    hashes,
  ]);
  const days = await all<{ day: string; granted: number }>(
    "SELECT day, SUM(granted)::int AS granted FROM claimed_txs WHERE address = ? AND network = ? GROUP BY day",
    [owner, network],
  );
  const milestones = await all<{ txs: number }>("SELECT txs FROM claimed_milestones WHERE address = ? AND network = ?", [
    owner,
    network,
  ]);
  const streakDays = await all<{ day: string }>("SELECT day FROM claimed_streak_days WHERE address = ? AND network = ?", [
    owner,
    network,
  ]);

  return {
    claimedHashes: new Set(claimed.map((row) => row.hash)),
    grantedPerDay: new Map(days.map((row) => [row.day, row.granted])),
    claimedMilestones: new Set(milestones.map((row) => row.txs)),
    claimedStreakDays: new Set(streakDays.map((row) => row.day)),
  };
}

export async function previewClaim(address: string, network: NetworkId, tasks: ScoredTask[]) {
  const state = await getClaimState(address, network, tasks.map((task) => task.hash));
  return planClaim(tasks, state);
}

// Plans and writes in one transaction, serialised per wallet, so two claims
// racing each other can't both be paid for the same work.
export function claim(address: string, network: NetworkId, tasks: ScoredTask[]) {
  const owner = lower(address);
  return transaction(async () => applyPlan(owner, network, await previewClaim(owner, network, tasks), { network }), owner);
}

export type ClaimSource = { network: NetworkId; txHash?: string };

// Writes a plan into the ledger. Every transaction, milestone and streak day
// pays once: anything already in the tables is skipped, not paid again. Call
// it inside a transaction.
export async function applyPlan(address: string, network: NetworkId, plan: ClaimPlan, source: ClaimSource) {
  const owner = lower(address);
  const txHash = source.txHash ? lower(source.txHash) : null;

  let taskCredits = 0;
  let taskCount = 0;
  for (const grant of plan.txGrants) {
    const written = await run(
      "INSERT INTO claimed_txs (network, hash, address, day, earned, granted) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
      [network, grant.hash, owner, grant.day, grant.earned, grant.granted],
    );
    if (written === 0) continue;
    taskCount += 1;
    taskCredits += grant.granted;
  }
  const insertLedger = (amount: number, kind: string, memo: string) =>
    run("INSERT INTO ledger (address, amount, kind, memo, network, tx_hash) VALUES (?, ?, ?, ?, ?, ?)", [
      owner,
      amount,
      kind,
      memo,
      network,
      txHash,
    ]);
  if (taskCredits > 0) {
    await insertLedger(taskCredits, "claim", `${taskCount} ${taskCount === 1 ? "task" : "tasks"} on ${network}`);
  }

  let milestoneCount = 0;
  let milestoneCredits = 0;
  for (const milestone of plan.milestones) {
    const written = await run(
      "INSERT INTO claimed_milestones (address, network, txs) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
      [owner, network, milestone.txs],
    );
    if (written === 0) continue;
    milestoneCount += 1;
    milestoneCredits += milestone.credits;
    await insertLedger(milestone.credits, "milestone", `Reached ${milestone.txs} transactions on ${network}`);
  }

  let streakCredits = 0;
  let streakCount = 0;
  for (const bonus of plan.streakDays) {
    const written = await run(
      "INSERT INTO claimed_streak_days (address, network, day) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
      [owner, network, bonus.day],
    );
    if (written === 0) continue;
    streakCount += 1;
    streakCredits += bonus.credits;
  }
  if (streakCount > 0) {
    await insertLedger(streakCredits, "streak", `${streakCount} streak ${streakCount === 1 ? "day" : "days"} on ${network}`);
  }

  const total = taskCredits + milestoneCredits + streakCredits;
  // The wallet that invited this one gets its share of the same claim.
  const referral = await payReferral(owner, total, network);

  return {
    granted: total,
    total,
    tasks: taskCount,
    milestones: milestoneCount,
    streak: streakCredits,
    referral,
    txHash,
    balance: await getBalance(owner),
  };
}

// --- API keys --------------------------------------------------------------

export type ApiKeyInfo = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function listKeys(address: string) {
  return all<ApiKeyInfo>(
    `SELECT id, name, prefix, created_at AS "createdAt", last_used_at AS "lastUsedAt" FROM api_keys WHERE address = ? AND revoked_at IS NULL ORDER BY created_at DESC, id`,
    [lower(address)],
  );
}

export class KeyLimitError extends Error {}

export function createKey(address: string, name: string) {
  const owner = lower(address);
  return transaction(async () => {
    if ((await listKeys(owner)).length >= MAX_ACTIVE_KEYS) {
      throw new KeyLimitError(`You can have at most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
    }
    const key = KEY_PREFIX + randomBytes(24).toString("base64url");
    const id = randomUUID();
    const prefix = `${key.slice(0, KEY_PREFIX.length + 4)}…${key.slice(-4)}`;
    await run("INSERT INTO api_keys (id, address, key_hash, prefix, name) VALUES (?, ?, ?, ?, ?)", [id, owner, hashKey(key), prefix, name]);
    return { id, key, prefix, name }; // the only time the full key exists outside the user's hands
  }, owner);
}

export async function revokeKey(address: string, id: string) {
  const changed = await run(`UPDATE api_keys SET revoked_at = ${NOW} WHERE id = ? AND address = ? AND revoked_at IS NULL`, [
    id,
    lower(address),
  ]);
  return changed > 0;
}

export async function findKey(key: string) {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const row = await one<{ id: string; address: string; name: string; prefix: string }>(
    "SELECT id, address, name, prefix FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
    [hashKey(key)],
  );
  return row ?? null;
}

// --- Spending ----------------------------------------------------------------

export function recordUsage(entry: {
  keyId: string;
  address: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  credits: number;
}) {
  return transaction(async () => {
    await run("INSERT INTO usage (key_id, address, model, input_tokens, output_tokens, credits) VALUES (?, ?, ?, ?, ?, ?)", [
      entry.keyId,
      lower(entry.address),
      entry.model,
      entry.inputTokens,
      entry.outputTokens,
      entry.credits,
    ]);
    await run("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, 'spend', ?)", [
      lower(entry.address),
      -entry.credits,
      entry.model,
    ]);
    await run(`UPDATE api_keys SET last_used_at = ${NOW} WHERE id = ?`, [entry.keyId]);
    return getBalance(entry.address);
  });
}

export type UsageRow = {
  id: number;
  keyId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  credits: number;
  createdAt: string;
};

// A page of a wallet's calls, newest first. `before` is the id to continue from.
export async function listUsage(address: string, filter: { from?: string; to?: string; before?: number; limit?: number } = {}) {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const rows = await all<UsageRow>(
    `SELECT id, key_id AS "keyId", model, input_tokens AS "inputTokens", output_tokens AS "outputTokens", credits, created_at AS "createdAt"
     FROM usage WHERE address = ? AND (?::text IS NULL OR created_at >= ?) AND (?::text IS NULL OR created_at < ?) AND (?::int IS NULL OR id < ?)
     ORDER BY id DESC LIMIT ?`,
    [
      lower(address),
      filter.from ?? null, filter.from ?? null,
      filter.to ?? null, filter.to ?? null,
      filter.before ?? null, filter.before ?? null,
      limit + 1,
    ],
  );
  const page = rows.slice(0, limit);
  return { rows: page, next: rows.length > limit ? page[page.length - 1].id : null };
}

// Spend per model over a period.
export function usageByModel(address: string, filter: { from?: string; to?: string } = {}) {
  return all<{ model: string; calls: number; inputTokens: number; outputTokens: number; credits: number }>(
    `SELECT model, COUNT(*)::int AS calls, SUM(input_tokens)::int AS "inputTokens", SUM(output_tokens)::int AS "outputTokens", SUM(credits)::int AS credits
     FROM usage WHERE address = ? AND (?::text IS NULL OR created_at >= ?) AND (?::text IS NULL OR created_at < ?)
     GROUP BY model ORDER BY credits DESC, model`,
    [lower(address), filter.from ?? null, filter.from ?? null, filter.to ?? null, filter.to ?? null],
  );
}

// --- Buying credits with USDG or ETH -----------------------------------------

export class TopUpUsedError extends Error {}

// A payment transaction turns into credits exactly once.
export function recordTopUp(entry: {
  network: NetworkId;
  hash: string;
  address: string;
  token: string;
  symbol: string;
  decimals: number;
  amount: bigint; // base units
  credits: number;
}) {
  return transaction(async () => {
    const written = await run(
      "INSERT INTO topups (network, hash, address, token, symbol, decimals, amount, credits) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
      [
        entry.network,
        lower(entry.hash),
        lower(entry.address),
        lower(entry.token),
        entry.symbol,
        entry.decimals,
        entry.amount.toString(),
        entry.credits,
      ],
    );
    if (written === 0) throw new TopUpUsedError("This payment has already been turned into credits.");
    await run("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, 'topup', ?)", [
      lower(entry.address),
      entry.credits,
      `Paid in ${entry.symbol} on ${entry.network}`,
    ]);
    return getBalance(entry.address);
  });
}
