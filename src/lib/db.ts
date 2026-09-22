import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "pg";

// Postgres, hosted on Neon. DATABASE_URL is the connection string; the tables
// are created on first use, so a fresh database needs no setup step.

// The current UTC time as an ISO string, the shape every timestamp here has.
export const NOW = `to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const SCHEMA = `
  -- Every credit movement. A wallet's balance is the sum of its rows.
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    address TEXT NOT NULL,
    amount INTEGER NOT NULL,
    kind TEXT NOT NULL,          -- claim | milestone | streak | referral | topup | spend
    memo TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    network TEXT,                -- which network a credit came from
    tx_hash TEXT                 -- the on-chain receipt that carried it
  );
  CREATE INDEX IF NOT EXISTS ledger_address ON ledger (address, id);

  -- A transaction pays out once, ever, no matter who asks or how often.
  CREATE TABLE IF NOT EXISTS claimed_txs (
    network TEXT NOT NULL,
    hash TEXT NOT NULL,
    address TEXT NOT NULL,
    day TEXT NOT NULL,
    earned INTEGER NOT NULL,
    granted INTEGER NOT NULL,
    PRIMARY KEY (network, hash)
  );
  CREATE INDEX IF NOT EXISTS claimed_txs_day ON claimed_txs (address, network, day);

  -- A day's streak bonus is paid once.
  CREATE TABLE IF NOT EXISTS claimed_streak_days (
    address TEXT NOT NULL,
    network TEXT NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (address, network, day)
  );

  -- Who invited a wallet, named once before its first claim. "claimed" is what
  -- the wallet has claimed since, "paid" the inviter's share of it.
  CREATE TABLE IF NOT EXISTS referrals (
    address TEXT PRIMARY KEY,
    referrer TEXT NOT NULL,
    claimed INTEGER NOT NULL DEFAULT 0,
    paid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX IF NOT EXISTS referrals_referrer ON referrals (referrer);

  CREATE TABLE IF NOT EXISTS claimed_milestones (
    address TEXT NOT NULL,
    network TEXT NOT NULL,
    txs INTEGER NOT NULL,
    PRIMARY KEY (address, network, txs)
  );

  -- Only the hash of a key is stored; the key itself is shown once.
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    last_used_at TEXT,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS api_keys_address ON api_keys (address);

  -- The name a wallet chose to show on the public distribution page.
  CREATE TABLE IF NOT EXISTS profiles (
    address TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );

  -- A token payment buys credits once. amount is in the token's base units.
  CREATE TABLE IF NOT EXISTS topups (
    network TEXT NOT NULL,
    hash TEXT NOT NULL,
    address TEXT NOT NULL,
    token TEXT NOT NULL,
    symbol TEXT NOT NULL,
    decimals INTEGER NOT NULL,
    amount TEXT NOT NULL,
    credits INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (network, hash)
  );
  CREATE INDEX IF NOT EXISTS topups_address ON topups (address);

  -- A signed-in browser. The cookie only names a row here, so signing out
  -- (here or everywhere) ends the session before the cookie expires.
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    expires_at INTEGER NOT NULL,   -- unix seconds
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS sessions_address ON sessions (address);

  -- Sign-in nonces already used, kept until they would have expired anyway.
  CREATE TABLE IF NOT EXISTS spent_nonces (
    nonce TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL    -- unix seconds
  );

  -- A receipt the server signed for the KreditReceipts contract. Its plan is
  -- written into the ledger once the chain has it (settled_at, tx_hash).
  CREATE TABLE IF NOT EXISTS pending_claims (
    receipt_id TEXT PRIMARY KEY,   -- the EIP-712 struct hash, as the contract reports it
    network TEXT NOT NULL,
    address TEXT NOT NULL,
    nonce INTEGER NOT NULL,
    credits INTEGER NOT NULL,
    plan TEXT NOT NULL,            -- JSON ClaimPlan
    deadline INTEGER NOT NULL,     -- unix seconds
    created_at TEXT NOT NULL DEFAULT ${NOW},
    tx_hash TEXT,
    settled_at TEXT
  );
  CREATE INDEX IF NOT EXISTS pending_claims_address ON pending_claims (address, network);

  CREATE TABLE IF NOT EXISTS usage (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key_id TEXT NOT NULL,
    address TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    credits INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX IF NOT EXISTS usage_address ON usage (address, id);

  -- Columns added after the first release. CREATE TABLE IF NOT EXISTS leaves
  -- an existing table alone, so each is added by hand when missing.
  ALTER TABLE ledger ADD COLUMN IF NOT EXISTS network TEXT;
  ALTER TABLE ledger ADD COLUMN IF NOT EXISTS tx_hash TEXT;
`;

export type Row = Record<string, unknown>;
export type QueryResult<T> = { rows: T[]; rowCount: number };

// Runs one statement. Parameters are written as `?` and bound in order.
export interface Sql {
  query<T = Row>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

// What a database has to provide: shared queries, one dedicated connection
// per transaction, and a way to run the schema (several statements at once).
export interface Backend extends Sql {
  exec(text: string): Promise<void>;
  transaction<T>(work: (tx: Sql) => Promise<T>): Promise<T>;
}

// `?` placeholders become Postgres's $1, $2, ... so the statements read plainly.
export const numbered = (text: string) => {
  let n = 0;
  return text.replace(/\?/g, () => `$${++n}`);
};

const holder = globalThis as { kreditBackend?: Backend; kreditReady?: Promise<void> };
// The transaction the current call is part of, if any.
const current = new AsyncLocalStorage<Sql>();

// Tests plug in an embedded Postgres here; the server uses DATABASE_URL.
export function configureDb(backend: Backend) {
  holder.kreditBackend = backend;
  holder.kreditReady = undefined;
}

function backend(): Backend {
  if (!holder.kreditBackend) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Copy your Neon connection string into .env.local.");
    holder.kreditBackend = postgres(url);
  }
  return holder.kreditBackend;
}

// The tables exist before the first query runs; once per process.
function ready() {
  if (!holder.kreditReady) {
    holder.kreditReady = backend()
      .exec(SCHEMA)
      .catch((error) => {
        holder.kreditReady = undefined; // so the next call tries again
        throw error;
      });
  }
  return holder.kreditReady;
}

export function db(): Sql {
  return {
    async query(text, params = []) {
      await ready();
      const client = current.getStore() ?? backend();
      return client.query(numbered(text), params);
    },
  };
}

// The three shapes a statement comes in: every row, the first row, or how many rows it touched.
export const all = async <T = Row>(text: string, params?: unknown[]) => (await db().query<T>(text, params)).rows;
export const one = async <T = Row>(text: string, params?: unknown[]) =>
  (await db().query<T>(text, params)).rows[0] as T | undefined;
export const run = async (text: string, params?: unknown[]) => (await db().query(text, params)).rowCount;

// Runs `work` in one transaction: every db() call inside it goes through the
// same connection, and it is committed only if `work` returns. `lock` names a
// row (a wallet, say) whose transactions must not overlap: two claims racing
// each other are then run one after the other, not interleaved.
export async function transaction<T>(work: () => Promise<T>, lock?: string): Promise<T> {
  if (current.getStore()) {
    if (lock) await db().query("SELECT pg_advisory_xact_lock(hashtext(?))", [lock]);
    return work(); // already inside one
  }
  await ready();
  return backend().transaction((tx) =>
    current.run(tx, async () => {
      if (lock) await db().query("SELECT pg_advisory_xact_lock(hashtext(?))", [lock]);
      return work();
    }),
  );
}

// --- Postgres over the network (Neon) ------------------------------------------

function postgres(url: string): Backend {
  // Neon's URL says sslmode=require; pg treats that as full verification anyway,
  // and saying so keeps it that way (and quiet) in the next pg release.
  const connectionString = url.replace(/sslmode=(prefer|require|verify-ca)\b/, "sslmode=verify-full");
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
  const wrap = (client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }): Sql => ({
    async query<T>(text: string, params: unknown[] = []) {
      const result = await client.query(text, params);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
  });
  return {
    ...wrap(pool),
    async exec(text) {
      await pool.query(text);
    },
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(wrap(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
