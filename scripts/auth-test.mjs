// End-to-end check of sign-in and sessions against a running server.
//
// Privy issues the login, so the happy path (a real Privy token) cannot run
// from a script. What is checked here: the sign-in route refuses everything
// that is not a valid Privy token, and sessions behave once one exists (made
// directly in the database, the same way the other e2e scripts do).
//   SESSION_SECRET=… DATABASE_URL=postgres://… BASE_URL=http://localhost:3458 node scripts/auth-test.mjs
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${detail}`); };
const json = { "content-type": "application/json" };

const alice = privateKeyToAccount(generatePrivateKey());

// 1. no session -> dashboard redirects home
const anon = await fetch(`${base}/dashboard`, { redirect: "manual" });
check("dashboard blocked without session", anon.status === 307, `(status ${anon.status} -> ${anon.headers.get("location")})`);

// 2. the sign-in route only takes a real Privy token
const empty = await fetch(`${base}/api/auth/privy`, { method: "POST", headers: json, body: "{}" });
check("sign-in without a token is refused", empty.status === 400 || empty.status === 503, `(status ${empty.status})`);
const junk = await fetch(`${base}/api/auth/privy`, { method: "POST", headers: json, body: JSON.stringify({ token: "not.a.jwt", address: alice.address }) });
check("sign-in with a made-up token is refused", junk.status === 401 || junk.status === 503, `(status ${junk.status})`);
const forged = await fetch(`${base}/api/auth/privy`, {
  method: "POST",
  headers: json,
  // A well-formed JWT signed by nobody Privy knows.
  body: JSON.stringify({ token: "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6cHJpdnk6eCIsImlzcyI6InByaXZ5LmlvIn0.AAAA", address: alice.address }),
});
check("sign-in with a forged token is refused", forged.status === 401 || forged.status === 503, `(status ${forged.status})`);
const none = await fetch(`${base}/api/auth/me`);
check("/me is null before signing in", (await none.json()).address === null);

// 3. a session works
const session = await sessionCookie(alice.address);
const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: session } })).json();
check("/me returns the signed-in wallet", me.address?.toLowerCase() === alice.address.toLowerCase());
const dash = await fetch(`${base}/dashboard`, { headers: { cookie: session }, redirect: "manual" });
check("dashboard opens with session", dash.status === 200 && (await dash.text()).toLowerCase().includes(alice.address.slice(0, 6).toLowerCase()));

// 4. record scanner: needs a session, validates input, and scans the signed-in wallet
const anonScan = await fetch(`${base}/api/record`);
check("scan blocked without session", anonScan.status === 401);
const badNetwork = await fetch(`${base}/api/record?network=solana`, { headers: { cookie: session } });
check("scan rejects unknown network", badNetwork.status === 400);
const scan = await fetch(`${base}/api/record?network=mainnet`, { headers: { cookie: session } });
const scanBody = await scan.json();
check("new wallet has nothing to claim", scan.status === 200 && scanBody.claimable === 0 && scanBody.address?.toLowerCase() === alice.address.toLowerCase(), `(status ${scan.status}, claimable ${scanBody.claimable ?? scanBody.error})`);

// 5. logout
const out = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie: session } });
check("logout clears cookie", out.headers.getSetCookie().some((c) => c.startsWith("kredit_session=;")));
const stale = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: session } })).json();
check("a copy of the old cookie is dead after logout", stale.address === null);

// 6. signing out everywhere ends the wallet's other sessions too
const laptop = await sessionCookie(alice.address);
const phone = await sessionCookie(alice.address);
await fetch(`${base}/api/auth/logout?everywhere=1`, { method: "POST", headers: { cookie: laptop } });
const other = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: phone } })).json();
check("logout everywhere ends the other browser's session", other.address === null);

process.exit(results.every(Boolean) ? 0 : 1);
