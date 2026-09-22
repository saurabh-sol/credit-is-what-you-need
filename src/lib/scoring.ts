import { applyDiversity, DAILY_EMISSIONS_BUDGET, MIN_TRANSFER_WEI } from "./fairness.ts";
import { streakDays, streakLabel } from "./streaks.ts";

// Turns a wallet's on-chain record into credits. Pure logic, no I/O, so the
// rules are easy to test and to change. 1,000 credits = $1 of AI usage.

// Bumped whenever a number below changes. An on-chain receipt carries it, so
// it is always clear which rules priced a claim.
// 2: the fair play rules (dust filter, diversity decay, emissions budget).
export const RULES_VERSION = 2;

export type ScannedTx = {
  hash: string;
  timestamp: string; // ISO
  ok: boolean;
  to: string | null;
  toIsContract: boolean;
  toName: string | null;
  method: string | null;
  createdContract: string | null;
  feeWei: string;
  valueWei?: string; // what the transaction sent along; unknown for old scans
};

export type Partner = { name: string; credits: number };
export type PartnerRegistry = Record<string, Partner>; // lowercase address -> partner

export type TaskKind = "deploy" | "partner" | "contract_call" | "transfer";

export const TASK_CREDITS: Record<Exclude<TaskKind, "partner">, number> = {
  deploy: 500,
  contract_call: 50,
  transfer: 10,
};

// One-time bonuses for reaching a number of successful transactions. Only the
// first MILESTONE_TXS_PER_DAY of each day count, so a bot can't buy every
// milestone with one afternoon of cheap transactions.
export const MILESTONE_TXS_PER_DAY = 20;
export const MILESTONES = [
  { txs: 10, credits: 100 },
  { txs: 50, credits: 300 },
  { txs: 100, credits: 750 },
  { txs: 500, credits: 2500 },
];

// Task rewards are sponsor-funded, so one wallet can earn at most this much
// per UTC day of activity. It keeps bots from draining the budget.
export const DAILY_TASK_CAP = 1000;

export type ScoredTask = {
  hash: string;
  timestamp: string;
  kind: TaskKind;
  label: string;
  credits: number;
  feeWei: string;
  contract: string | null; // the contract this transaction deployed, if any
  target?: string | null; // who the transaction was sent to, for the diversity rule
};

export type ReceiptLine = { label: string; credits: number };

export type Receipt = {
  lines: ReceiptLine[];
  total: number;
  tasks: ScoredTask[]; // newest first
  successfulTxs: number;
  failedTxs: number;
  gasSpentWei: string;
};

export function scoreTx(tx: ScannedTx, partners: PartnerRegistry): ScoredTask | null {
  if (!tx.ok) return null; // a failed transaction is not a finished task

  const base = { hash: tx.hash, timestamp: tx.timestamp, feeWei: tx.feeWei, contract: tx.createdContract, target: tx.to?.toLowerCase() ?? null };
  if (tx.createdContract) {
    return { ...base, kind: "deploy", label: "Deployed a contract", credits: TASK_CREDITS.deploy };
  }
  const partner = tx.to ? partners[tx.to.toLowerCase()] : undefined;
  if (partner) {
    return { ...base, kind: "partner", label: `Used ${partner.name}`, credits: partner.credits };
  }
  if (tx.toIsContract) {
    const what = tx.method && !tx.method.startsWith("0x") ? tx.method : "contract call";
    const where = tx.toName ? ` on ${tx.toName}` : "";
    return { ...base, kind: "contract_call", label: `${what}${where}`, credits: TASK_CREDITS.contract_call };
  }
  // Dust: a transfer that moved (almost) nothing is not work. Scans that do
  // not report the value are given the benefit of the doubt.
  if (tx.valueWei !== undefined && BigInt(tx.valueWei) < MIN_TRANSFER_WEI) return null;
  return { ...base, kind: "transfer", label: "Sent a transfer", credits: TASK_CREDITS.transfer };
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const GROUP_LABELS: Record<TaskKind, (count: number) => string> = {
  deploy: (n) => `Deployed ${plural(n, "contract", "contracts")}`,
  partner: (n) => plural(n, "partner protocol use", "partner protocol uses"),
  contract_call: (n) => plural(n, "contract interaction", "contract interactions"),
  transfer: (n) => plural(n, "transfer", "transfers"),
};

const activeDays = (tasks: { timestamp: string }[]) => tasks.map((task) => task.timestamp.slice(0, 10));

export function buildReceipt(txs: ScannedTx[], partners: PartnerRegistry = {}): Receipt {
  const scored = txs
    .map((tx) => scoreTx(tx, partners))
    .filter((task): task is ScoredTask => task !== null);
  // Repeat calls to one target on one day pay less and less. The tasks carry
  // the reduced credits from here on, so a claim pays exactly what is shown.
  const tasks = applyDiversity(scored);

  const lines: ReceiptLine[] = [];
  for (const kind of ["deploy", "partner", "contract_call", "transfer"] as const) {
    const group = scored.filter((task) => task.kind === kind);
    if (group.length === 0) continue;
    lines.push({
      label: GROUP_LABELS[kind](group.length),
      credits: group.reduce((sum, task) => sum + task.credits, 0),
    });
  }
  const repeated = scored.reduce((sum, task) => sum + task.credits, 0) - tasks.reduce((sum, task) => sum + task.credits, 0);
  if (repeated > 0) lines.push({ label: "Repeat calls to the same contract", credits: -repeated });

  // Apply the daily cap per UTC day of activity.
  const perDay = new Map<string, { credits: number; count: number }>();
  for (const task of tasks) {
    const day = task.timestamp.slice(0, 10);
    const entry = perDay.get(day) ?? { credits: 0, count: 0 };
    perDay.set(day, { credits: entry.credits + task.credits, count: entry.count + 1 });
  }
  let overCap = 0;
  let milestoneProgress = 0;
  for (const { credits, count } of perDay.values()) {
    overCap += Math.max(0, credits - DAILY_TASK_CAP);
    milestoneProgress += Math.min(count, MILESTONE_TXS_PER_DAY);
  }
  if (overCap > 0) {
    lines.push({ label: `Daily cap (${DAILY_TASK_CAP} per day)`, credits: -overCap });
  }

  for (const milestone of MILESTONES) {
    if (milestoneProgress >= milestone.txs) {
      lines.push({ label: `Reached ${milestone.txs} transactions`, credits: milestone.credits });
    }
  }

  const streak = streakDays(activeDays(tasks));
  if (streak.length > 0) {
    lines.push({ label: streakLabel(streak), credits: streak.reduce((sum, day) => sum + day.credits, 0) });
  }

  const gasSpent = txs.reduce((sum, tx) => sum + BigInt(tx.feeWei), BigInt(0));

  return {
    lines,
    total: lines.reduce((sum, line) => sum + line.credits, 0),
    tasks: [...tasks].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    successfulTxs: tasks.length,
    failedTxs: txs.length - tasks.length,
    gasSpentWei: gasSpent.toString(),
  };
}

// ---------------------------------------------------------------------------
// Claiming. A wallet can scan as often as it likes, but every transaction and
// every milestone pays out exactly once, and the daily cap holds across claims.

export type ClaimState = {
  claimedHashes: Set<string>;
  grantedPerDay: Map<string, number>; // UTC day -> credits already granted
  claimedMilestones: Set<number>;
  claimedStreakDays: Set<string>; // UTC days whose streak bonus was paid
};

export type ClaimPlan = {
  txGrants: { hash: string; day: string; earned: number; granted: number }[];
  milestones: { txs: number; credits: number }[];
  streakDays: { day: string; credits: number }[];
  total: number;
  // Task credits earned but left unclaimed because today's emissions budget
  // is spent. They stay claimable and are paid from a later day's budget.
  deferred: number;
  // UTC days on which the record has a successful transaction; the referral
  // rule needs it.
  activeDays: number;
};

// `budget` is how many task credits today's emissions budget still allows.
export function planClaim(tasks: ScoredTask[], state: ClaimState, budget = DAILY_EMISSIONS_BUDGET): ClaimPlan {
  const grantedPerDay = new Map(state.grantedPerDay);
  const progressPerDay = new Map<string, number>();
  const txGrants: ClaimPlan["txGrants"] = [];
  let left = Math.max(0, budget);
  let deferred = 0;

  // Oldest first, so the cap fills in the order the work was done.
  const ordered = [...tasks].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const task of ordered) {
    const day = task.timestamp.slice(0, 10);
    progressPerDay.set(day, (progressPerDay.get(day) ?? 0) + 1);
    if (state.claimedHashes.has(task.hash)) continue;

    const used = grantedPerDay.get(day) ?? 0;
    const granted = Math.min(task.credits, Math.max(0, DAILY_TASK_CAP - used));
    // Out of budget for today: leave the transaction unclaimed rather than
    // marking it paid for nothing.
    if (granted > left) {
      deferred += granted;
      continue;
    }
    left -= granted;
    grantedPerDay.set(day, used + granted);
    txGrants.push({ hash: task.hash, day, earned: task.credits, granted });
  }

  let progress = 0;
  for (const count of progressPerDay.values()) progress += Math.min(count, MILESTONE_TXS_PER_DAY);
  const milestones = MILESTONES.filter(
    (milestone) => progress >= milestone.txs && !state.claimedMilestones.has(milestone.txs),
  );

  // A streak is read from the whole record, so a day whose transactions were
  // claimed earlier still counts toward it; each day's bonus is paid once.
  const streak = streakDays(activeDays(tasks))
    .filter((bonus) => !state.claimedStreakDays.has(bonus.day))
    .map(({ day, credits }) => ({ day, credits }));

  const total =
    txGrants.reduce((sum, grant) => sum + grant.granted, 0) +
    milestones.reduce((sum, milestone) => sum + milestone.credits, 0) +
    streak.reduce((sum, bonus) => sum + bonus.credits, 0);
  return { txGrants, milestones, streakDays: streak, total, deferred, activeDays: progressPerDay.size };
}
