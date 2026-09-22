import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
  -- Every credit movement. A wallet's balance is the sum of its rows.
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    amount INTEGER NOT NULL,
    kind TEXT NOT NULL,          -- claim | milestone | streak | referral | topup | spend
    memo TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_used_at TEXT,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS api_keys_address ON api_keys (address);

  -- The name a wallet chose to show on the public distribution page.
  CREATE TABLE IF NOT EXISTS profiles (
    address TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (network, hash)
  );
  CREATE INDEX IF NOT EXISTS topups_address ON topups (address);

  -- A signed-in browser. The cookie only names a row here, so signing out
  -- (here or everywhere) ends the session before the cookie expires.
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
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
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    tx_hash TEXT,
    settled_at TEXT
  );
  CREATE INDEX IF NOT EXISTS pending_claims_address ON pending_claims (address, network);

  CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id TEXT NOT NULL,
    address TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    credits INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;

// Databases from before streaks and referrals keep their old tables (contracts,
// royalty_txs, gas_back_carry...) untouched; the ledger rows they produced still
// count toward balances. Nothing needs altering, only the new tables above.

// One connection per process; survives hot reloads in dev.
const holder = globalThis as { kreditDb?: DatabaseSync };

export function db() {
  if (!holder.kreditDb) {
    const path = process.env.DATABASE_PATH ?? "data/kredit.db";
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
      // Data written under the product's old name moves over on first open.
      const old = path.replace(/kredit\.db$/, "fuel.db");
      if (old !== path && !existsSync(path) && existsSync(old)) renameSync(old, path);
    }
    const database = new DatabaseSync(path);
    database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    database.exec(SCHEMA);
    migrate(database);
    holder.kreditDb = database;
  }
  return holder.kreditDb;
}

// node:sqlite is synchronous, so nothing else in this process runs between
// BEGIN and COMMIT. IMMEDIATE also locks out other processes.
// Columns added after the first release. CREATE TABLE IF NOT EXISTS leaves an
// existing table alone, so each is added by hand when missing.
function migrate(database: DatabaseSync) {
  const columns = (table: string) =>
    new Set((database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name));
  const ledger = columns("ledger");
  // Which network a credit came from, and the on-chain receipt that carried it.
  if (!ledger.has("network")) database.exec("ALTER TABLE ledger ADD COLUMN network TEXT");
  if (!ledger.has("tx_hash")) database.exec("ALTER TABLE ledger ADD COLUMN tx_hash TEXT");
}

export function transaction<T>(work: () => T): T {
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
