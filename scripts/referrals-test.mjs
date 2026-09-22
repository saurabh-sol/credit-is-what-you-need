// End-to-end check of referrals: the invite link, naming an inviter, and the rules.
// Needs a server started with the same SESSION_SECRET and DATABASE_PATH:
//   DATABASE_PATH=/tmp/kredit-test.db npx next dev -p 3461
//   DATABASE_PATH=/tmp/kredit-test.db BASE_URL=http://localhost:3461 node scripts/referrals-test.mjs
// Signs sessions locally for throwaway wallets (local testing only: real users
// sign with their wallet). Two rows land in the referrals table.
import { sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const hex = (fill) => `0x${fill.repeat(40)}`;
const INVITER = hex("a");
const FRIEND = hex("b");
const OTHER = hex("c");

const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${detail}`); };
const get = async (cookie, path) => (await fetch(base + path, { headers: { cookie } })).json();
const post = (cookie, path, body) =>
  fetch(base + path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });

check("referrals need a session", (await fetch(`${base}/api/referrals`)).status === 401);

const link = await fetch(`${base}/r/${INVITER}`, { redirect: "manual" });
check("the invite link sends the visitor home and remembers the inviter",
  link.status === 307 && link.headers.get("location")?.endsWith("/") && (link.headers.get("set-cookie") ?? "").includes("kredit_ref="));
const bogus = await fetch(`${base}/r/not-a-wallet`, { redirect: "manual" });
check("a broken invite link still goes home, without a cookie", bogus.status === 307 && !(bogus.headers.get("set-cookie") ?? "").includes("kredit_ref="));

const friend = await sessionCookie(FRIEND);
check("you cannot invite yourself", (await post(friend, "/api/referrals", { referrer: FRIEND })).status === 409);
check("an inviter must be a wallet address", (await post(friend, "/api/referrals", { referrer: "hello" })).status === 400);
check("naming an inviter works once", (await post(friend, "/api/referrals", { referrer: INVITER })).status === 201);
check("and only once", (await post(friend, "/api/referrals", { referrer: OTHER })).status === 409);

const mine = await get(friend, "/api/referrals");
check("the friend sees who invited them", mine.referrer === INVITER && mine.code.toLowerCase() === FRIEND);

const inviter = await sessionCookie(INVITER);
const theirs = await get(inviter, "/api/referrals");
check("the inviter sees the friend on their list, with nothing earned yet",
  theirs.count === 1 && theirs.earned === 0 && theirs.invited.some((row) => row.address === FRIEND && row.paid === 0),
  `(${theirs.count} invited, ${theirs.earned} earned)`);
check("no loops: the inviter cannot be invited by their invitee", (await post(inviter, "/api/referrals", { referrer: FRIEND })).status === 409);

process.exit(results.every(Boolean) ? 0 : 1);
