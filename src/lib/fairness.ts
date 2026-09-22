// Fair play: the rules that keep earned credits for people who use the chain,
// not for scripts that farm it. Every rule here is pure, unit-tested, and
// listed on /docs/legal/fairness with the same numbers. The scorer applies
// the per-transaction rules; the ledger applies the ones that need history.

import type { ScoredTask } from "./scoring.ts";

// 1. A wallet earns only once its first transaction is this old. A wallet
//    made this morning to farm one day of rewards has to wait.
export const WALLET_MIN_AGE_DAYS = 3;

// 2. Dust: a plain transfer pays only if it moved at least this much. Sending
//    nothing to yourself is not work.
export const MIN_TRANSFER_WEI = BigInt(10) ** BigInt(14); // 0.0001 ETH

// 3. Diversity: on one UTC day, calls to the same target pay in full for the
//    first FULL, half for the next HALF, then nothing. Deploys are paid up to
//    DEPLOYS_PAID_PER_DAY a day.
export const CALLS_FULL_PER_TARGET_PER_DAY = 5;
export const CALLS_HALF_PER_TARGET_PER_DAY = 5;
export const DEPLOYS_PAID_PER_DAY = 2;

// 4. Referrals: the inviter earns only once the invited wallet has been active
//    on this many UTC days and only on claims of at least MIN_CLAIM credits,
//    and never more than DAILY_CAP a day from all invitees together.
export const REFERRAL_MIN_ACTIVE_DAYS = 3;
export const REFERRAL_MIN_CLAIM = 100;
export const REFERRAL_DAILY_CAP = 2_000;

// 5. Emissions: task credits paid to everyone on one UTC day are capped. When
//    the day's budget is spent, the transactions stay unclaimed and are paid
//    from the next day's budget. Milestones and streaks are outside it.
export const DAILY_EMISSIONS_BUDGET = 250_000;

// 6. Hold: a large claim from a young wallet, or from one whose activity is
//    almost all against one target, waits a day before it is paid.
export const HOLD_THRESHOLD = 2_000;
export const HOLD_WALLET_AGE_DAYS = 7;
export const HOLD_CONCENTRATION = 0.9;
export const HOLD_HOURS = 24;

// 7. The scan and claim endpoints have their own, tighter rate limits.
export const SCANS_PER_MINUTE = 6;
export const CLAIMS_PER_MINUTE = 3;

const DAY_MS = 86_400_000;
const dayOf = (timestamp: string) => timestamp.slice(0, 10);

// How old the wallet's record is, in days, from its oldest transaction. A
// truncated scan only read the newest 1,000, so the wallet is older than that.
export function walletAgeDays(txs: { timestamp: string }[], truncated: boolean, now = Date.now()) {
  if (truncated) return Infinity;
  let oldest = Infinity;
  for (const tx of txs) {
    const at = Date.parse(tx.timestamp);
    if (Number.isFinite(at) && at < oldest) oldest = at;
  }
  return oldest === Infinity ? 0 : (now - oldest) / DAY_MS;
}

export type Gate = { code: "wallet_age"; message: string; until: string };

// Null when the wallet may claim; otherwise why not, and when it can.
export function claimGate(txs: { timestamp: string }[], truncated: boolean, now = Date.now()): Gate | null {
  const age = walletAgeDays(txs, truncated, now);
  if (age >= WALLET_MIN_AGE_DAYS) return null;
  const oldest = txs.reduce((min, tx) => Math.min(min, Date.parse(tx.timestamp) || Infinity), Infinity);
  const until = new Date((oldest === Infinity ? now : oldest) + WALLET_MIN_AGE_DAYS * DAY_MS).toISOString();
  return {
    code: "wallet_age",
    message: `A wallet can claim once its first transaction is ${WALLET_MIN_AGE_DAYS} days old.`,
    until,
  };
}

// Applies the diversity rule to scored tasks. Returns new task objects; a task
// that is reduced keeps its label and gets `credits` lowered, so the receipt,
// the plan and the on-chain record all agree. Deterministic over the whole
// record, so a later claim prices a transaction the same way an earlier one did.
export function applyDiversity(tasks: ScoredTask[]): ScoredTask[] {
  const ordered = [...tasks].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.hash.localeCompare(b.hash));
  const seen = new Map<string, number>(); // "day|target" or "day|deploy" -> count so far
  const priced = new Map<string, number>();
  for (const task of ordered) {
    const day = dayOf(task.timestamp);
    if (task.kind === "deploy") {
      const key = `${day}|deploy`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      priced.set(task.hash, n < DEPLOYS_PAID_PER_DAY ? task.credits : 0);
      continue;
    }
    if (task.kind === "partner") {
      priced.set(task.hash, task.credits);
      continue;
    }
    const key = `${day}|${task.target ?? "?"}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const factor = n < CALLS_FULL_PER_TARGET_PER_DAY ? 1 : n < CALLS_FULL_PER_TARGET_PER_DAY + CALLS_HALF_PER_TARGET_PER_DAY ? 0.5 : 0;
    priced.set(task.hash, Math.floor(task.credits * factor));
  }
  return tasks.map((task) => ({ ...task, credits: priced.get(task.hash) ?? task.credits }));
}

// The share of a wallet's paid tasks that went to its most common target.
export function concentration(tasks: ScoredTask[]) {
  const paid = tasks.filter((task) => task.credits > 0 && task.kind !== "deploy");
  if (paid.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const task of paid) counts.set(task.target ?? "?", (counts.get(task.target ?? "?") ?? 0) + 1);
  return Math.max(...counts.values()) / paid.length;
}

export type Risk = { reason: string };

// Whether a claim of `credits` from this record should wait HOLD_HOURS first.
export function riskOf(credits: number, tasks: ScoredTask[], ageDays: number): Risk | null {
  if (credits <= HOLD_THRESHOLD) return null;
  if (ageDays < HOLD_WALLET_AGE_DAYS) {
    return { reason: `a claim over ${HOLD_THRESHOLD.toLocaleString("en-US")} credits from a wallet under ${HOLD_WALLET_AGE_DAYS} days old` };
  }
  if (concentration(tasks) >= HOLD_CONCENTRATION) {
    return { reason: `a claim over ${HOLD_THRESHOLD.toLocaleString("en-US")} credits where ${Math.round(HOLD_CONCENTRATION * 100)}% of the activity is against one contract` };
  }
  return null;
}

// UTC days on which the record has a successful transaction.
export const activeDayCount = (tasks: { timestamp: string }[]) => new Set(tasks.map((task) => dayOf(task.timestamp))).size;

// The inviter's share of a claim, after the referral gates.
export function referralPayable(share: number, claimed: number, inviteeActiveDays: number, inviterPaidToday: number) {
  if (claimed < REFERRAL_MIN_CLAIM || inviteeActiveDays < REFERRAL_MIN_ACTIVE_DAYS) return 0;
  return Math.max(0, Math.min(share, REFERRAL_DAILY_CAP - inviterPaidToday));
}

// The start of the current UTC day as the ISO prefix the ledger stores.
export const utcDayStart = (now = Date.now()) => `${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`;
