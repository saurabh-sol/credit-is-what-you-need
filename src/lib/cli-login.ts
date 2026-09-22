import { randomInt } from "node:crypto";
import { NOW, one, run, transaction } from "./db.ts";
import { createKey, KeyLimitError } from "./ledger.ts";

// How the CLI signs in without ever seeing the wallet: the terminal asks for
// a code, the person opens the verify page, signs in with the wallet as usual
// and approves; a key is made for the CLI and handed over exactly once.

export const LOGIN_TTL_S = 600; // ten minutes to approve
export const POLL_INTERVAL_S = 3;
export const KEY_NAME_PREFIX = "CLI on ";

// Letters and digits that cannot be confused with each other when read aloud.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeCode() {
  let raw = "";
  for (let index = 0; index < 8; index++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");

const now = () => Math.floor(Date.now() / 1000);

export async function startLogin(host: string | null) {
  const code = makeCode();
  const expiresAt = now() + LOGIN_TTL_S;
  await run("INSERT INTO cli_logins (code, host, expires_at) VALUES (?, ?, ?)", [code, host?.slice(0, 80) ?? null, expiresAt]);
  // Old rows are of no use to anyone; sweep them as we go.
  await run("DELETE FROM cli_logins WHERE expires_at < ?", [now() - 3600]);
  return { code, expiresAt, interval: POLL_INTERVAL_S };
}

export type LoginRow = { code: string; host: string | null; address: string | null; keyId: string | null; keyValue: string | null; expiresAt: number; approvedAt: string | null; claimedAt: string | null };

export function getLogin(code: string) {
  return one<LoginRow>(
    `SELECT code, host, address, key_id AS "keyId", key_value AS "keyValue", expires_at AS "expiresAt", approved_at AS "approvedAt", claimed_at AS "claimedAt"
     FROM cli_logins WHERE code = ?`,
    [normalizeCode(code)],
  );
}

export class LoginError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// The signed-in wallet approves the code: a key is made in its name and parked
// on the row for the terminal to collect.
export async function approveLogin(code: string, address: string) {
  return transaction(async () => {
    const row = await getLogin(code);
    if (!row) throw new LoginError("That code is not known. Run `kredit login` again.", 404);
    if (row.expiresAt < now()) throw new LoginError("That code has expired. Run `kredit login` again.", 410);
    if (row.approvedAt) throw new LoginError("That code was already approved.", 409);
    let key;
    try {
      key = await createKey(address, `${KEY_NAME_PREFIX}${row.host ?? "a terminal"}`.slice(0, 40));
    } catch (error) {
      if (error instanceof KeyLimitError) throw new LoginError(error.message, 409);
      throw error;
    }
    await run(`UPDATE cli_logins SET address = ?, key_id = ?, key_value = ?, approved_at = ${NOW} WHERE code = ?`, [
      address.toLowerCase(),
      key.id,
      key.key,
      row.code,
    ]);
    return { address: address.toLowerCase(), keyName: key.name, host: row.host };
  }, address.toLowerCase());
}

// The terminal asks whether its code was approved. The key is returned once;
// the row forgets it the moment it is collected.
export async function collectLogin(code: string) {
  const row = await getLogin(code);
  if (!row) return { status: "unknown" as const };
  if (row.expiresAt < now()) return { status: "expired" as const };
  if (!row.approvedAt) return { status: "pending" as const, interval: POLL_INTERVAL_S };
  if (row.claimedAt || !row.keyValue) return { status: "collected" as const };
  await run(`UPDATE cli_logins SET key_value = NULL, claimed_at = ${NOW} WHERE code = ?`, [row.code]);
  return { status: "approved" as const, key: row.keyValue, address: row.address!, keyId: row.keyId! };
}
