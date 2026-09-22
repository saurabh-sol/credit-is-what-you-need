import { db } from "./db.ts";

// The public side of the ledger: who earned what, and the name they chose to
// go by. Spending is only ever shown as one total per wallet, never call by call.

const lower = (address: string) => address.toLowerCase();

// --- Display names -------------------------------------------------------------

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,23}$/u;

// 2-24 letters, digits, spaces, dots, dashes or underscores. Null when it doesn't fit.
export function cleanName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return NAME_PATTERN.test(trimmed) ? trimmed : null;
}

export function getName(address: string) {
  const row = db().prepare("SELECT name FROM profiles WHERE address = ?").get(lower(address)) as
    | { name: string }
    | undefined;
  return row?.name ?? null;
}

// Pass null to go back to showing only the address.
export function setName(address: string, name: string | null) {
  if (name === null) {
    db().prepare("DELETE FROM profiles WHERE address = ?").run(lower(address));
    return;
  }
  db()
    .prepare(
      "INSERT INTO profiles (address, name) VALUES (?, ?) ON CONFLICT (address) DO UPDATE SET name = excluded.name, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
    )
    .run(lower(address), name);
}

// --- Distribution ----------------------------------------------------------------

export const EARNING_KINDS = ["claim", "milestone", "streak", "referral", "topup"] as const;
export type EarningKind = (typeof EARNING_KINDS)[number];

export type TokenPaid = { symbol: string; decimals: number; amount: string }; // amount in base units

export type DistributionRow = {
  address: string;
  name: string | null;
  earned: number;
  bySource: Record<EarningKind, number>;
  tokensPaid: TokenPaid[];
  lastEarnedAt: string;
};

export type ActiveWallet = {
  address: string;
  name: string | null;
  claimed: number; // everything earned, bought credits aside
  used: number;
  lastActiveAt: string;
};

type TokenTotals = Map<string, { decimals: number; amount: bigint }>;

// Token payments per wallet, summed per token symbol.
function tokensPaidByWallet() {
  const rows = db().prepare("SELECT address, symbol, decimals, amount FROM topups").all() as {
    address: string;
    symbol: string;
    decimals: number;
    amount: string;
  }[];
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

// Everyone who has earned credits, biggest first.
export function distribution(options: { search?: string; limit?: number } = {}) {
  const database = db();
  const search = options.search?.trim().toLowerCase() ?? "";
  const perKind = EARNING_KINDS.map(
    (kind) => `SUM(CASE WHEN l.kind = '${kind}' THEN l.amount ELSE 0 END) AS ${kind}`,
  ).join(", ");

  const rows = database
    .prepare(
      `SELECT l.address AS address, p.name AS name, SUM(l.amount) AS earned, ${perKind}, MAX(l.created_at) AS lastEarnedAt
       FROM ledger l LEFT JOIN profiles p ON p.address = l.address
       WHERE l.amount > 0 AND (? = '' OR l.address LIKE ? OR LOWER(p.name) LIKE ?)
       GROUP BY l.address ORDER BY earned DESC, l.address LIMIT ?`,
    )
    .all(search, `%${search}%`, `%${search}%`, options.limit ?? 100) as (Record<EarningKind, number> & {
    address: string;
    name: string | null;
    earned: number;
    lastEarnedAt: string;
  })[];

  const paid = tokensPaidByWallet();
  const wallets: DistributionRow[] = rows.map((row) => ({
    address: row.address,
    name: row.name,
    earned: row.earned,
    bySource: Object.fromEntries(EARNING_KINDS.map((kind) => [kind, row[kind]])) as Record<EarningKind, number>,
    tokensPaid: asList(paid.get(row.address)),
    lastEarnedAt: row.lastEarnedAt,
  }));

  const totals = database
    .prepare("SELECT COUNT(DISTINCT address) AS wallets, COALESCE(SUM(amount), 0) AS credits FROM ledger WHERE amount > 0")
    .get() as { wallets: number; credits: number };

  const everyToken: TokenTotals = new Map();
  for (const tokens of paid.values()) {
    for (const [symbol, { decimals, amount }] of tokens) {
      everyToken.set(symbol, { decimals, amount: (everyToken.get(symbol)?.amount ?? BigInt(0)) + amount });
    }
  }

  // One line per wallet that has claimed, the ones putting their credits to work first.
  const active = database
    .prepare(
      `SELECT l.address AS address, p.name AS name,
         SUM(CASE WHEN l.amount > 0 AND l.kind != 'topup' THEN l.amount ELSE 0 END) AS claimed,
         -SUM(CASE WHEN l.amount < 0 THEN l.amount ELSE 0 END) AS used,
         MAX(l.created_at) AS lastActiveAt
       FROM ledger l LEFT JOIN profiles p ON p.address = l.address
       GROUP BY l.address HAVING claimed > 0 ORDER BY used DESC, claimed DESC, l.address LIMIT 12`,
    )
    .all()
    // node:sqlite rows have no prototype, which React will not pass to a client component.
    .map((row) => ({ ...row })) as ActiveWallet[];

  return { totals: { ...totals, tokensPaid: asList(everyToken) }, wallets, active };
}

export type Distribution = ReturnType<typeof distribution>;
