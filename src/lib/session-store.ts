import { randomUUID } from "node:crypto";
import { db } from "./db.ts";

// The server's side of sign-in: which sessions are alive and which nonces are
// spent. Kept in the database so a restart neither signs everyone out nor lets
// a captured sign-in message be replayed.

const now = () => Math.floor(Date.now() / 1000);

export function openSession(address: string, ttlSeconds: number) {
  const id = randomUUID();
  const database = db();
  database.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
  database
    .prepare("INSERT INTO sessions (id, address, expires_at) VALUES (?, ?, ?)")
    .run(id, address.toLowerCase(), now() + ttlSeconds);
  return id;
}

export function sessionIsLive(id: string, address: string) {
  const row = db()
    .prepare("SELECT 1 AS live FROM sessions WHERE id = ? AND address = ? AND revoked_at IS NULL AND expires_at >= ?")
    .get(id, address.toLowerCase(), now());
  return row !== undefined;
}

const REVOKE = "UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE revoked_at IS NULL AND";

export function closeSession(id: string) {
  db().prepare(`${REVOKE} id = ?`).run(id);
}

// Signs the wallet out of every browser, e.g. after a laptop is lost.
export function closeAllSessions(address: string) {
  return Number(db().prepare(`${REVOKE} address = ?`).run(address.toLowerCase()).changes);
}

// True the first time a nonce is seen, false ever after.
export function spendNonce(nonce: string, ttlSeconds: number) {
  const database = db();
  database.prepare("DELETE FROM spent_nonces WHERE expires_at < ?").run(now());
  const result = database
    .prepare("INSERT OR IGNORE INTO spent_nonces (nonce, expires_at) VALUES (?, ?)")
    .run(nonce, now() + ttlSeconds);
  return result.changes > 0;
}
