// Copies the ledger to a dated file next to it. Safe while the site is running:
// VACUUM INTO takes a consistent snapshot without stopping writers.
//   npm run backup                       -> data/backups/kredit-2026-09-22T101500Z.db
//   BACKUP_DIR=/mnt/offsite npm run backup
// Keeps the newest BACKUP_KEEP files (default 14). Run it from cron, and copy
// the folder somewhere off the server: a backup on the same disk does not
// survive losing that disk.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const source = process.env.DATABASE_PATH ?? "data/kredit.db";
const dir = process.env.BACKUP_DIR ?? path.join(path.dirname(source), "backups");
const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

if (!fs.existsSync(source)) {
  console.error(`No database at ${source}. Set DATABASE_PATH.`);
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z").replaceAll(":", "");
const target = path.join(dir, `kredit-${stamp}.db`);
const database = new DatabaseSync(source);
database.prepare("VACUUM INTO ?").run(target);
database.close();

// Prove the copy opens and holds the ledger before trusting it.
const copy = new DatabaseSync(target, { readOnly: true });
const check = copy.prepare("PRAGMA integrity_check").get();
const { rows } = copy.prepare("SELECT COUNT(*) AS rows FROM ledger").get();
copy.close();
if (check.integrity_check !== "ok") {
  fs.rmSync(target);
  console.error(`Backup failed its integrity check: ${check.integrity_check}`);
  process.exit(1);
}

const old = fs
  .readdirSync(dir)
  .filter((name) => /^kredit-.*\.db$/.test(name))
  .sort()
  .slice(0, -keep);
for (const name of old) fs.rmSync(path.join(dir, name));

console.log(`Saved ${target} (${rows} ledger rows). Removed ${old.length} old backup${old.length === 1 ? "" : "s"}.`);
