// A signed-in cookie for the end-to-end scripts, without a wallet (local testing
// only: real users must sign with their wallet). A session is a signed cookie
// plus a row in the server's database, so the script and the server must share
// SESSION_SECRET and DATABASE_URL.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { SignJWT } from "jose";
import { query } from "./db.mjs";

export const secret =
  process.env.SESSION_SECRET ?? fs.readFileSync(".env.local", "utf8").match(/SESSION_SECRET=(.+)/)[1].trim();

export async function sessionCookie(address) {
  const sid = randomUUID();
  // The server creates the tables on its first request; make sure that has happened.
  await fetch(`${process.env.BASE_URL ?? "http://localhost:3000"}/api/health`);
  await query("INSERT INTO sessions (id, address, expires_at) VALUES (?, ?, ?)", [
    sid,
    address.toLowerCase(),
    Math.floor(Date.now() / 1000) + 600,
  ]);

  const jwt = await new SignJWT({ address, sid })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
  return `kredit_session=${jwt}`;
}
