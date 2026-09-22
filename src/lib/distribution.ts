import { all, NOW, one, run } from "./db.ts";

// The public side of the ledger: who earned what, and the name they chose to
// go by. Spending is shown as one total per wallet and the models it went to,
// never call by call and never what was asked.

const lower = (address: string) => address.toLowerCase();

// --- Display names -------------------------------------------------------------

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,23}$/u;

// 2-24 letters, digits, spaces, dots, dashes or underscores. Null when it doesn't fit.
export function cleanName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return NAME_PATTERN.test(trimmed) ? trimmed : null;
}

export async function getName(address: string) {
  const row = await one<{ name: string }>("SELECT name FROM profiles WHERE address = ?", [lower(address)]);
  return row?.name ?? null;
}

// Pass null to go back to showing only the address.
export async function setName(address: string, name: string | null) {
  if (name === null) {
    await run("DELETE FROM profiles WHERE address = ?", [lower(address)]);
    return;
  }
  await run(
    `INSERT INTO profiles (address, name) VALUES (?, ?) ON CONFLICT (address) DO UPDATE SET name = excluded.name, updated_at = ${NOW}`,
    [lower(address), name],
  );
}

// --- Distribution ----------------------------------------------------------------

export const EARNING_KINDS = ["claim", "milestone", "streak", "referral", "topup"] as const;
export type EarningKind = (typeof EARNING_KINDS)[number];

export type TokenPaid = { symbol: string; decimals: number; amount: string }; // amount in base units

// One model a wallet has put credits into, e.g. "openai/gpt-4o-mini".
export type ModelUsed = { model: string; credits: number; calls: number };

export type DistributionRow = {
  address: string;
  name: string | null;
  earned: number;
  bySource: Record<EarningKind, number>;
  tokensPaid: TokenPaid[];
  used: number; // credits spent, all models together
  models: ModelUsed[]; // where they went, biggest first
  lastEarnedAt: string;
};

export type ActiveWallet = {
  address: string;
  name: string | null;
  claimed: number; // everything earned, bought credits aside
  used: number;
  models: ModelUsed[];
  lastActiveAt: string;
};

type TokenTotals = Map<string, { decimals: number; amount: bigint }>;

// Which models each wallet has spent on, the ones that took the most credits first.
async function modelsUsedByWallet() {
  const rows = await all<{ address: string; model: string; credits: number; calls: number }>(
    `SELECT address, model, SUM(credits)::int AS credits, COUNT(*)::int AS calls
     FROM usage GROUP BY address, model ORDER BY credits DESC, calls DESC, model`,
  );
  const used = new Map<string, ModelUsed[]>();
  for (const row of rows) {
    const models = used.get(row.address) ?? [];
    models.push({ model: row.model, credits: row.credits, calls: row.calls });
    used.set(row.address, models);
  }
  return used;
}

// Token payments per wallet, summed per token symbol.
async function tokensPaidByWallet() {
  const rows = await all<{ address: string; symbol: string; decimals: number; amount: string }>(
    "SELECT address, symbol, decimals, amount FROM topups",
  );
  const paid = new Map<string, TokenTotals>();
  for (const row of rows) {
    const tokens: TokenTotals = paid.get(row.address) ?? new Map();
    const soFar = tokens.get(row.symbol)?.amount ?? BigInt(0);
    tokens.set(row.symbol, { decimals: row.decimals, amount: soFar + BigInt(row.amount) });
    paid.set(row.address, tokens);
  }
  return paid;
}

const asList = (tokens?: TokenTotals): TokenPaid[] =>
  [...(tokens ?? [])].map(([symbol, { decimals, amount }]) => ({ symbol, decimals, amount: amount.toString() }));

const EARNED = "SUM(CASE WHEN l.amount > 0 THEN l.amount ELSE 0 END)";
const CLAIMED = "SUM(CASE WHEN l.amount > 0 AND l.kind != 'topup' THEN l.amount ELSE 0 END)";
const USED = "-SUM(CASE WHEN l.amount < 0 THEN l.amount ELSE 0 END)";

// Everyone who has earned credits, biggest first.
export async function distribution(options: { search?: string; limit?: number } = {}) {
  const search = options.search?.trim().toLowerCase() ?? "";
  const perKind = EARNING_KINDS.map(
    (kind) => `SUM(CASE WHEN l.kind = '${kind}' THEN l.amount ELSE 0 END)::int AS ${kind}`,
  ).join(", ");

  // Every row of a wallet is read so its spending comes along; only earners make the list.
  const rows = await all<
    Record<EarningKind, number> & { address: string; name: string | null; earned: number; used: number; lastEarnedAt: string }
  >(
    `SELECT l.address AS address, p.name AS name,
       ${EARNED}::int AS earned, ${perKind},
       (${USED})::int AS used,
       MAX(CASE WHEN l.amount > 0 THEN l.created_at END) AS "lastEarnedAt"
     FROM ledger l LEFT JOIN profiles p ON p.address = l.address
     WHERE ?::text = '' OR l.address LIKE ? OR LOWER(p.name) LIKE ?
     GROUP BY l.address, p.name HAVING ${EARNED} > 0 ORDER BY earned DESC, l.address LIMIT ?`,
    [search, `%${search}%`, `%${search}%`, options.limit ?? 100],
  );

  const paid = await tokensPaidByWallet();
  const models = await modelsUsedByWallet();
  const wallets: DistributionRow[] = rows.map((row) => ({
    address: row.address,
    name: row.name,
    earned: row.earned,
    bySource: Object.fromEntries(EARNING_KINDS.map((kind) => [kind, row[kind]])) as Record<EarningKind, number>,
    tokensPaid: asList(paid.get(row.address)),
    used: row.used,
    models: models.get(row.address) ?? [],
    lastEarnedAt: row.lastEarnedAt,
  }));

  const totals = (await one<{ wallets: number; credits: number }>(
    "SELECT COUNT(DISTINCT address)::int AS wallets, COALESCE(SUM(amount), 0)::int AS credits FROM ledger WHERE amount > 0",
  )) ?? { wallets: 0, credits: 0 };

  const everyToken: TokenTotals = new Map();
  for (const tokens of paid.values()) {
    for (const [symbol, { decimals, amount }] of tokens) {
      everyToken.set(symbol, { decimals, amount: (everyToken.get(symbol)?.amount ?? BigInt(0)) + amount });
    }
  }

  // One line per wallet that has claimed, the ones putting their credits to work first.
  const active = (
    await all<Omit<ActiveWallet, "models">>(
      `SELECT l.address AS address, p.name AS name,
         ${CLAIMED}::int AS claimed,
         (${USED})::int AS used,
         MAX(l.created_at) AS "lastActiveAt"
       FROM ledger l LEFT JOIN profiles p ON p.address = l.address
       GROUP BY l.address, p.name HAVING ${CLAIMED} > 0 ORDER BY used DESC, claimed DESC, l.address LIMIT 12`,
    )
  ).map((row): ActiveWallet => ({ ...row, models: models.get(row.address) ?? [] }));

  return { totals: { wallets: totals.wallets, credits: totals.credits, tokensPaid: asList(everyToken) }, wallets, active };
}

export type Distribution = Awaited<ReturnType<typeof distribution>>;
