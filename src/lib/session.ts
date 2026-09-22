import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Address } from "viem";
import { closeAllSessions, closeSession, openSession, sessionIsLive, spendNonce } from "./session-store.ts";

const SESSION_COOKIE = "kredit_session";
const NONCE_COOKIE = "kredit_nonce";
const SESSION_TTL = 60 * 60 * 24 * 7;
const NONCE_TTL = 60 * 5;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(value);
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

async function sign(payload: Record<string, string>, ttl: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret());
}

async function read(name: string) {
  const token = (await cookies()).get(name)?.value;
  if (!token) return null;
  try {
    return (await jwtVerify(token, secret())).payload;
  } catch {
    return null;
  }
}

export async function issueNonce(nonce: string) {
  (await cookies()).set(
    NONCE_COOKIE,
    await sign({ nonce }, NONCE_TTL),
    cookieOptions(NONCE_TTL),
  );
}

// A nonce is single use, even if someone captured the cookie and replays it.
export async function consumeNonce() {
  const payload = await read(NONCE_COOKIE);
  (await cookies()).delete(NONCE_COOKIE);
  const nonce = payload?.nonce;
  if (typeof nonce !== "string") return null;
  return (await spendNonce(nonce, NONCE_TTL)) ? nonce : null;
}

export async function createSession(address: Address) {
  (await cookies()).set(
    SESSION_COOKIE,
    await sign({ address, sid: await openSession(address, SESSION_TTL) }, SESSION_TTL),
    cookieOptions(SESSION_TTL),
  );
}

export async function getSession() {
  const payload = await read(SESSION_COOKIE);
  if (typeof payload?.address !== "string" || typeof payload.sid !== "string") return null;
  // The cookie is only as good as its row: signing out ends it at once.
  if (!(await sessionIsLive(payload.sid, payload.address))) return null;
  return { address: payload.address as Address };
}

// `everywhere` also signs the wallet out of every other browser.
export async function clearSession({ everywhere = false } = {}) {
  const payload = await read(SESSION_COOKIE);
  if (typeof payload?.sid === "string") await closeSession(payload.sid);
  if (everywhere && typeof payload?.address === "string") await closeAllSessions(payload.address);
  (await cookies()).delete(SESSION_COOKIE);
}
