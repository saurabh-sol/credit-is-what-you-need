import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, transaction } from "./db.ts";
import { GAS_BACK_PERCENT } from "./gasback.ts";
import type { NetworkId } from "./networks.ts";
import { planRoyalties, ROYALTY_PERCENT, type ContractCall } from "./royalties.ts";
import { planClaim, type ClaimState, type ScoredTask } from "./scoring.ts";

import { MAX_ACTIVE_KEYS } from "./limits.ts";

export { MAX_ACTIVE_KEYS };
const KEY_PREFIX = "kredit_sk_";
// Keys made before the rename. Only their hash is stored, so accepting the old prefix keeps them working.
const LEGACY_KEY_PREFIX = "fuel_sk_";

const lower = (address: string) => address.toLowerCase();
const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function getBalance(address: string) {
  const row = db()
    .prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger WHERE address = ?")
    .get(lower(address)) as { balance: number };
  return row.balance;
}

// Everything that ever came in, and everything that went out, as positive numbers.
export function getTotals(address: string) {
  const row = db()
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS earned, COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS spent FROM ledger WHERE address = ?",
    )
    .get(lower(address)) as { earned: number; spent: number };
  return { earned: row.earned, spent: row.spent };
}

export type LedgerEntry = { id: number; amount: number; kind: string; memo: string; createdAt: string };

export function listLedger(address: string, limit = 20) {
  return db()
    .prepare(
      "SELECT id, amount, kind, memo, created_at AS createdAt FROM ledger WHERE address = ? ORDER BY id DESC LIMIT ?",
    )
    .all(lower(address), limit) as LedgerEntry[];
}

// --- Claims ----------------------------------------------------------------

export function getClaimState(address: string, network: NetworkId, hashes: string[]): ClaimState {
  const database = db();
  // A transaction already claimed by anyone is off the table. Look the
  // scanned hashes up in chunks to stay under SQLite's parameter limit.
  const claimedHashes = new Set<string>();
  const gasBackPaidHashes = new Set<string>();
  for (let i = 0; i < hashes.length; i += 500) {
    const chunk = hashes.slice(i, i + 500);
    const rows = database
      .prepare(
        `SELECT hash, gas_back_paid AS paid FROM claimed_txs WHERE network = ? AND hash IN (${chunk.map(() => "?").join(",")})`,
      )
      .all(network, ...chunk) as { hash: string; paid: number }[];
    for (const row of rows) {
      claimedHashes.add(row.hash);
      if (row.paid) gasBackPaidHashes.add(row.hash);
    }
  }

  const days = database
    .prepare(
      "SELECT day, SUM(granted) AS granted FROM claimed_txs WHERE address = ? AND network = ? GROUP BY day",
    )
    .all(lower(address), network) as { day: string; granted: number }[];
  const milestones = database
    .prepare("SELECT txs FROM claimed_milestones WHERE address = ? AND network = ?")
    .all(lower(address), network) as { txs: number }[];

  const carry = database
    .prepare("SELECT micro FROM gas_back_carry WHERE address = ? AND network = ?")
    .get(lower(address), network) as { micro: number } | undefined;

  return {
    claimedHashes,
    gasBackPaidHashes,
    gasBackCarryMicro: carry?.micro ?? 0,
    grantedPerDay: new Map(days.map((row) => [row.day, row.granted])),
    claimedMilestones: new Set(milestones.map((row) => row.txs)),
  };
}

export function previewClaim(
  address: string,
  network: NetworkId,
  tasks: ScoredTask[],
  ethUsdCents?: bigint | null,
) {
  const state = getClaimState(address, network, tasks.map((task) => task.hash));
  return planClaim(tasks, state, ethUsdCents);
}

// Plans and writes in one transaction, so two claims racing each other can't
// both be paid for the same work.
export function claim(
  address: string,
  network: NetworkId,
  tasks: ScoredTask[],
  ethUsdCents?: bigint | null,
) {
  const owner = lower(address);
  return transaction(() => {
    const plan = previewClaim(owner, network, tasks, ethUsdCents);
    const database = db();

    const insertTx = database.prepare(
      "INSERT INTO claimed_txs (network, hash, address, day, earned, granted) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const grant of plan.txGrants) {
      insertTx.run(network, grant.hash, owner, grant.day, grant.earned, grant.granted);
    }
    const taskCredits = plan.txGrants.reduce((sum, grant) => sum + grant.granted, 0);
    const insertLedger = database.prepare(
      "INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, ?, ?)",
    );
    if (taskCredits > 0) {
      const count = plan.txGrants.length;
      insertLedger.run(owner, taskCredits, "claim", `${count} ${count === 1 ? "task" : "tasks"} on ${network}`);
    }
    for (const milestone of plan.milestones) {
      database
        .prepare("INSERT INTO claimed_milestones (address, network, txs) VALUES (?, ?, ?)")
        .run(owner, network, milestone.txs);
      insertLedger.run(owner, milestone.credits, "milestone", `Reached ${milestone.txs} transactions on ${network}`);
    }

    if (plan.gasBack) {
      const markPaid = database.prepare(
        "UPDATE claimed_txs SET gas_back_paid = 1 WHERE network = ? AND hash = ? AND address = ?",
      );
      for (const hash of plan.gasBack.hashes) markPaid.run(network, hash, owner);
      database
        .prepare(
          "INSERT INTO gas_back_carry (address, network, micro) VALUES (?, ?, ?) ON CONFLICT (address, network) DO UPDATE SET micro = excluded.micro",
        )
        .run(owner, network, plan.gasBack.carryMicro);
      if (plan.gasBack.credits > 0) {
        insertLedger.run(owner, plan.gasBack.credits, "gasback", `${GAS_BACK_PERCENT}% of gas spent on ${network}`);
      }
    }

    return {
      granted: plan.total,
      tasks: plan.txGrants.length,
      milestones: plan.milestones.length,
      gasBack: plan.gasBack?.credits ?? 0,
      balance: getBalance(owner),
    };
  });
}

// --- Builder Royalties -----------------------------------------------------

export type BuilderContract = { address: string; deployedAt: string; paidCalls: number };

export function rememberContracts(builder: string, network: NetworkId, tasks: ScoredTask[]) {
  const insert = db().prepare(
    "INSERT OR IGNORE INTO contracts (network, address, builder, deployed_at) VALUES (?, ?, ?, ?)",
  );
  for (const task of tasks) {
    if (task.contract) insert.run(network, task.contract.toLowerCase(), lower(builder), task.timestamp);
  }
}

export function addContract(builder: string, network: NetworkId, contract: string, deployedAt: string) {
  db()
    .prepare("INSERT OR IGNORE INTO contracts (network, address, builder, deployed_at) VALUES (?, ?, ?, ?)")
    .run(network, contract.toLowerCase(), lower(builder), deployedAt);
}

export function listContracts(builder: string, network: NetworkId) {
  return db()
    .prepare(
      `SELECT c.address, c.deployed_at AS deployedAt,
              (SELECT COUNT(*) FROM royalty_txs r WHERE r.network = c.network AND r.contract = c.address) AS paidCalls
       FROM contracts c WHERE c.builder = ? AND c.network = ?
       ORDER BY c.last_checked_at IS NOT NULL, c.last_checked_at, c.deployed_at DESC`,
    )
    .all(lower(builder), network) as BuilderContract[];
}

// Contracts are checked least-recently-checked first, so a builder with more
// contracts than one scan covers still gets every one of them checked in turn.
export function markChecked(network: NetworkId, contracts: string[]) {
  const update = db().prepare(
    "UPDATE contracts SET last_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE network = ? AND address = ?",
  );
  for (const contract of contracts) update.run(network, contract);
}

export function paidRoyaltyHashes(network: NetworkId, hashes: string[]) {
  const paid = new Set<string>();
  for (let i = 0; i < hashes.length; i += 500) {
    const chunk = hashes.slice(i, i + 500);
    const rows = db()
      .prepare(`SELECT hash FROM royalty_txs WHERE network = ? AND hash IN (${chunk.map(() => "?").join(",")})`)
      .all(network, ...chunk) as { hash: string }[];
    for (const row of rows) paid.add(row.hash);
  }
  return paid;
}

export type ContractUsage = { contract: string; calls: ContractCall[] };

export function previewRoyalties(builder: string, network: NetworkId, usage: ContractUsage[], ethUsdCents: bigint) {
  const hashes = usage.flatMap((entry) => entry.calls.map((call) => call.hash));
  const carry = db()
    .prepare("SELECT micro FROM royalty_carry WHERE address = ? AND network = ?")
    .get(lower(builder), network) as { micro: number } | undefined;
  return planRoyalties(builder, usage, paidRoyaltyHashes(network, hashes), carry?.micro ?? 0, ethUsdCents);
}

export function claimRoyalties(builder: string, network: NetworkId, usage: ContractUsage[], ethUsdCents: bigint) {
  const owner = lower(builder);
  return transaction(() => {
    const plan = previewRoyalties(owner, network, usage, ethUsdCents);
    const database = db();
    const insert = database.prepare(
      "INSERT INTO royalty_txs (network, hash, contract, builder) VALUES (?, ?, ?, ?)",
    );
    for (const item of plan.payable) insert.run(network, item.hash, item.contract.toLowerCase(), owner);
    database
      .prepare(
        "INSERT INTO royalty_carry (address, network, micro) VALUES (?, ?, ?) ON CONFLICT (address, network) DO UPDATE SET micro = excluded.micro",
      )
      .run(owner, network, plan.carryMicro);
    if (plan.credits > 0) {
      const count = plan.payable.length;
      database
        .prepare("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, 'royalty', ?)")
        .run(owner, plan.credits, `${ROYALTY_PERCENT}% of gas from ${count} ${count === 1 ? "call" : "calls"} to your contracts on ${network}`);
    }
    return { granted: plan.credits, calls: plan.payable.length, balance: getBalance(owner) };
  });
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
  return db()
    .prepare(
      "SELECT id, name, prefix, created_at AS createdAt, last_used_at AS lastUsedAt FROM api_keys WHERE address = ? AND revoked_at IS NULL ORDER BY created_at DESC",
    )
    .all(lower(address)) as ApiKeyInfo[];
}

export class KeyLimitError extends Error {}

export function createKey(address: string, name: string) {
  return transaction(() => {
    if (listKeys(address).length >= MAX_ACTIVE_KEYS) {
      throw new KeyLimitError(`You can have at most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
    }
    const key = KEY_PREFIX + randomBytes(24).toString("base64url");
    const id = randomUUID();
    const prefix = `${key.slice(0, KEY_PREFIX.length + 4)}…${key.slice(-4)}`;
    db()
      .prepare("INSERT INTO api_keys (id, address, key_hash, prefix, name) VALUES (?, ?, ?, ?, ?)")
      .run(id, lower(address), hashKey(key), prefix, name);
    return { id, key, prefix, name }; // the only time the full key exists outside the user's hands
  });
}

export function revokeKey(address: string, id: string) {
  const result = db()
    .prepare(
      "UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND address = ? AND revoked_at IS NULL",
    )
    .run(id, lower(address));
  return result.changes > 0;
}

export function findKey(key: string) {
  if (!key.startsWith(KEY_PREFIX) && !key.startsWith(LEGACY_KEY_PREFIX)) return null;
  const row = db()
    .prepare("SELECT id, address, name, prefix FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
    .get(hashKey(key)) as { id: string; address: string; name: string; prefix: string } | undefined;
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
  return transaction(() => {
    const database = db();
    database
      .prepare(
        "INSERT INTO usage (key_id, address, model, input_tokens, output_tokens, credits) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(entry.keyId, lower(entry.address), entry.model, entry.inputTokens, entry.outputTokens, entry.credits);
    database
      .prepare("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, 'spend', ?)")
      .run(lower(entry.address), -entry.credits, entry.model);
    database
      .prepare("UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
      .run(entry.keyId);
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
export function listUsage(address: string, filter: { from?: string; to?: string; before?: number; limit?: number } = {}) {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const rows = db()
    .prepare(
      `SELECT id, key_id AS keyId, model, input_tokens AS inputTokens, output_tokens AS outputTokens, credits, created_at AS createdAt
       FROM usage WHERE address = ? AND (? IS NULL OR created_at >= ?) AND (? IS NULL OR created_at < ?) AND (? IS NULL OR id < ?)
       ORDER BY id DESC LIMIT ?`,
    )
    .all(
      lower(address),
      filter.from ?? null, filter.from ?? null,
      filter.to ?? null, filter.to ?? null,
      filter.before ?? null, filter.before ?? null,
      limit + 1,
    ) as UsageRow[];
  const page = rows.slice(0, limit);
  return { rows: page, next: rows.length > limit ? page[page.length - 1].id : null };
}

// Spend per model over a period.
export function usageByModel(address: string, filter: { from?: string; to?: string } = {}) {
  return db()
    .prepare(
      `SELECT model, COUNT(*) AS calls, SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens, SUM(credits) AS credits
       FROM usage WHERE address = ? AND (? IS NULL OR created_at >= ?) AND (? IS NULL OR created_at < ?)
       GROUP BY model ORDER BY credits DESC`,
    )
    .all(lower(address), filter.from ?? null, filter.from ?? null, filter.to ?? null, filter.to ?? null) as {
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    credits: number;
  }[];
}

// --- Buying credits with the project token -----------------------------------

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
  return transaction(() => {
    const database = db();
    const used = database
      .prepare("SELECT 1 FROM topups WHERE network = ? AND hash = ?")
      .get(entry.network, lower(entry.hash));
    if (used) throw new TopUpUsedError("This payment has already been turned into credits.");
    database
      .prepare(
        "INSERT INTO topups (network, hash, address, token, symbol, decimals, amount, credits) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        entry.network,
        lower(entry.hash),
        lower(entry.address),
        lower(entry.token),
        entry.symbol,
        entry.decimals,
        entry.amount.toString(),
        entry.credits,
      );
    database
      .prepare("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, 'topup', ?)")
      .run(lower(entry.address), entry.credits, `Paid in ${entry.symbol} on ${entry.network}`);
    return getBalance(entry.address);
  });
}
