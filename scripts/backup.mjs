// Saves every table as one dated JSON file. Neon keeps its own point-in-time
// history; this is the copy you hold yourself, off Neon.
//   npm run backup                       -> data/backups/kredit-2026-09-22T101500Z.json
//   BACKUP_DIR=/mnt/offsite npm run backup
// Keeps the newest BACKUP_KEEP files (default 14). Run it from cron, and copy
// the folder somewhere off the server.
import fs from "node:fs";
import path from "node:path";
import { query } from "./lib/db.mjs";

const TABLES = [
  "ledger",
  "claimed_txs",
  "claimed_streak_days",
  "claimed_milestones",
  "referrals",
  "api_keys",
  "profiles",
  "topups",
  "sessions",
  "spent_nonces",
  "pending_claims",
  "usage",
];

const dir = process.env.BACKUP_DIR ?? "data/backups";
const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
fs.mkdirSync(dir, { recursive: true });

const snapshot = { takenAt: new Date().toISOString(), tables: {} };
for (const table of TABLES) {
  snapshot.tables[table] = (await query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
}

const stamp = snapshot.takenAt.replace(/\.\d+Z$/, "Z").replaceAll(":", "");
const target = path.join(dir, `kredit-${stamp}.json`);
fs.writeFileSync(target, JSON.stringify(snapshot));

// Prove the file reads back and holds the ledger before trusting it.
const rows = JSON.parse(fs.readFileSync(target, "utf8")).tables.ledger.length;
if (rows !== snapshot.tables.ledger.length) {
  fs.rmSync(target);
  console.error("Backup did not read back whole.");
  process.exit(1);
}

const old = fs
  .readdirSync(dir)
  .filter((name) => /^kredit-.*\.json$/.test(name))
  .sort()
  .slice(0, -keep);
for (const name of old) fs.rmSync(path.join(dir, name));

console.log(`Saved ${target} (${rows} ledger rows). Removed ${old.length} old backup${old.length === 1 ? "" : "s"}.`);
