import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Address } from "viem";

const SESSION_COOKIE = "fuel_session";
const NONCE_COOKIE = "fuel_nonce";
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

// Nonces already spent, kept until they would have expired anyway. In-memory is
// enough for one server process; move this to the database when Phase 3 adds one.
const spentNonces = new Map<string, number>();

// A nonce is single use, even if someone captured the cookie and replays it.
export async function consumeNonce() {
  const payload = await read(NONCE_COOKIE);
  (await cookies()).delete(NONCE_COOKIE);
  const nonce = payload?.nonce;
  if (typeof nonce !== "string") return null;

  const now = Date.now();
  for (const [spent, expiry] of spentNonces) {
    if (expiry < now) spentNonces.delete(spent);
  }
  if (spentNonces.has(nonce)) return null;
  spentNonces.set(nonce, now + NONCE_TTL * 1000);
  return nonce;
}

export async function createSession(address: Address) {
  (await cookies()).set(
    SESSION_COOKIE,
    await sign({ address }, SESSION_TTL),
    cookieOptions(SESSION_TTL),
  );
}

export async function getSession() {
  const payload = await read(SESSION_COOKIE);
  return typeof payload?.address === "string"
    ? { address: payload.address as Address }
    : null;
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
