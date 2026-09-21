import { GAS_BACK_PERCENT, gasBackMicro, splitMicro } from "./gasback.ts";

// Turns a wallet's on-chain record into credits. Pure logic, no I/O, so the
// rules are easy to test and to change. 1,000 credits = $1 of AI usage.

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

  const base = { hash: tx.hash, timestamp: tx.timestamp, feeWei: tx.feeWei, contract: tx.createdContract };
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

export const GAS_BACK_LABEL = `Gas-Back (${GAS_BACK_PERCENT}% of gas spent)`;
const sumFees = (tasks: { feeWei: string }[]) =>
  tasks.reduce((sum, task) => sum + BigInt(task.feeWei), BigInt(0));

// Pass the ETH price (in cents) to include Gas-Back; leave it out when the
// price feed is unavailable.
export function buildReceipt(
  txs: ScannedTx[],
  partners: PartnerRegistry = {},
  ethUsdCents?: bigint | null,
): Receipt {
  const tasks = txs
    .map((tx) => scoreTx(tx, partners))
    .filter((task): task is ScoredTask => task !== null);

  const lines: ReceiptLine[] = [];
  for (const kind of ["deploy", "partner", "contract_call", "transfer"] as const) {
    const group = tasks.filter((task) => task.kind === kind);
    if (group.length === 0) continue;
    lines.push({
      label: GROUP_LABELS[kind](group.length),
      credits: group.reduce((sum, task) => sum + task.credits, 0),
    });
  }

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

  if (ethUsdCents) {
    const { credits } = splitMicro(gasBackMicro(sumFees(tasks), ethUsdCents));
    if (credits > 0) lines.push({ label: GAS_BACK_LABEL, credits });
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
  gasBackPaidHashes: Set<string>; // Gas-Back is tracked per transaction, separately from the task reward
  gasBackCarryMicro: number;
  grantedPerDay: Map<string, number>; // UTC day -> credits already granted
  claimedMilestones: Set<number>;
};

export type ClaimPlan = {
  txGrants: { hash: string; day: string; earned: number; granted: number }[];
  milestones: { txs: number; credits: number }[];
  gasBack: { hashes: string[]; credits: number; carryMicro: number } | null;
  total: number;
};

export function planClaim(tasks: ScoredTask[], state: ClaimState, ethUsdCents?: bigint | null): ClaimPlan {
  const grantedPerDay = new Map(state.grantedPerDay);
  const progressPerDay = new Map<string, number>();
  const txGrants: ClaimPlan["txGrants"] = [];

  // Oldest first, so the cap fills in the order the work was done.
  const ordered = [...tasks].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const task of ordered) {
    const day = task.timestamp.slice(0, 10);
    progressPerDay.set(day, (progressPerDay.get(day) ?? 0) + 1);
    if (state.claimedHashes.has(task.hash)) continue;

    const used = grantedPerDay.get(day) ?? 0;
    const granted = Math.min(task.credits, Math.max(0, DAILY_TASK_CAP - used));
    grantedPerDay.set(day, used + granted);
    txGrants.push({ hash: task.hash, day, earned: task.credits, granted });
  }

  let progress = 0;
  for (const count of progressPerDay.values()) progress += Math.min(count, MILESTONE_TXS_PER_DAY);
  const milestones = MILESTONES.filter(
    (milestone) => progress >= milestone.txs && !state.claimedMilestones.has(milestone.txs),
  );

  // Gas-Back covers every successful transaction that hasn't had it yet,
  // including ones whose task reward was claimed earlier.
  let gasBack: ClaimPlan["gasBack"] = null;
  if (ethUsdCents) {
    const unpaid = tasks.filter((task) => !state.gasBackPaidHashes.has(task.hash));
    if (unpaid.length > 0) {
      const micro = gasBackMicro(sumFees(unpaid), ethUsdCents) + BigInt(state.gasBackCarryMicro);
      gasBack = { hashes: unpaid.map((task) => task.hash), ...splitMicro(micro) };
    }
  }

  const total =
    txGrants.reduce((sum, grant) => sum + grant.granted, 0) +
    milestones.reduce((sum, milestone) => sum + milestone.credits, 0) +
    (gasBack?.credits ?? 0);
  return { txGrants, milestones, gasBack, total };
}
