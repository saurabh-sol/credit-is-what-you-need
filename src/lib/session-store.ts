import { randomUUID } from "node:crypto";
import { NOW, one, run } from "./db.ts";

// The server's side of sign-in: which sessions are alive and which nonces are
// spent. Kept in the database so a restart neither signs everyone out nor lets
// a captured sign-in message be replayed.

const now = () => Math.floor(Date.now() / 1000);

export async function openSession(address: string, ttlSeconds: number) {
  const id = randomUUID();
  await run("DELETE FROM sessions WHERE expires_at < ?", [now()]);
  await run("INSERT INTO sessions (id, address, expires_at) VALUES (?, ?, ?)", [id, address.toLowerCase(), now() + ttlSeconds]);
  return id;
}

export async function sessionIsLive(id: string, address: string) {
  const row = await one("SELECT 1 AS live FROM sessions WHERE id = ? AND address = ? AND revoked_at IS NULL AND expires_at >= ?", [
    id,
    address.toLowerCase(),
    now(),
  ]);
  return row !== undefined;
}

const REVOKE = `UPDATE sessions SET revoked_at = ${NOW} WHERE revoked_at IS NULL AND`;

export async function closeSession(id: string) {
  await run(`${REVOKE} id = ?`, [id]);
}

// Signs the wallet out of every browser, e.g. after a laptop is lost.
export function closeAllSessions(address: string) {
  return run(`${REVOKE} address = ?`, [address.toLowerCase()]);
}

// True the first time a nonce is seen, false ever after.
export async function spendNonce(nonce: string, ttlSeconds: number) {
  await run("DELETE FROM spent_nonces WHERE expires_at < ?", [now()]);
  const written = await run("INSERT INTO spent_nonces (nonce, expires_at) VALUES (?, ?) ON CONFLICT DO NOTHING", [
    nonce,
    now() + ttlSeconds,
  ]);
  return written > 0;
}
