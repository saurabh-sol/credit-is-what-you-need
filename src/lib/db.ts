import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
  -- Every credit movement. A wallet's balance is the sum of its rows.
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    amount INTEGER NOT NULL,
    kind TEXT NOT NULL,          -- claim | milestone | gasback | royalty | topup | spend
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
    gas_back_paid INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (network, hash)
  );
  CREATE INDEX IF NOT EXISTS claimed_txs_day ON claimed_txs (address, network, day);

  -- The fraction of a credit of Gas-Back left over from the last claim.
  CREATE TABLE IF NOT EXISTS gas_back_carry (
    address TEXT NOT NULL,
    network TEXT NOT NULL,
    micro INTEGER NOT NULL,
    PRIMARY KEY (address, network)
  );

  -- Contracts a wallet deployed. Remembered so royalties keep flowing after
  -- the deployment drops out of the wallet's latest 1,000 transactions.
  CREATE TABLE IF NOT EXISTS contracts (
    network TEXT NOT NULL,
    address TEXT NOT NULL,
    builder TEXT NOT NULL,
    deployed_at TEXT NOT NULL,
    last_checked_at TEXT,
    PRIMARY KEY (network, address)
  );
  CREATE INDEX IF NOT EXISTS contracts_builder ON contracts (builder, network);

  -- A call to a contract pays its builder once.
  CREATE TABLE IF NOT EXISTS royalty_txs (
    network TEXT NOT NULL,
    hash TEXT NOT NULL,
    contract TEXT NOT NULL,
    builder TEXT NOT NULL,
    PRIMARY KEY (network, hash)
  );
  CREATE INDEX IF NOT EXISTS royalty_txs_contract ON royalty_txs (network, contract);

  CREATE TABLE IF NOT EXISTS royalty_carry (
    address TEXT NOT NULL,
    network TEXT NOT NULL,
    micro INTEGER NOT NULL,
    PRIMARY KEY (address, network)
  );

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

// Bring databases created by earlier phases up to date.
function migrate(database: DatabaseSync) {
  const columns = database.prepare("PRAGMA table_info(claimed_txs)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "gas_back_paid")) {
    database.exec("ALTER TABLE claimed_txs ADD COLUMN gas_back_paid INTEGER NOT NULL DEFAULT 0");
  }
  const contractColumns = database.prepare("PRAGMA table_info(contracts)").all() as { name: string }[];
  if (!contractColumns.some((column) => column.name === "last_checked_at")) {
    database.exec("ALTER TABLE contracts ADD COLUMN last_checked_at TEXT");
  }
}

// One connection per process; survives hot reloads in dev.
const holder = globalThis as { fuelDb?: DatabaseSync };

export function db() {
  if (!holder.fuelDb) {
    const path = process.env.DATABASE_PATH ?? "data/fuel.db";
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const database = new DatabaseSync(path);
    database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    database.exec(SCHEMA);
    migrate(database);
    holder.fuelDb = database;
  }
  return holder.fuelDb;
}

// node:sqlite is synchronous, so nothing else in this process runs between
// BEGIN and COMMIT. IMMEDIATE also locks out other processes.
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
