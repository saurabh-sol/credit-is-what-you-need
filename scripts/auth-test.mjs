import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const cookieOf = (res) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${detail}`); };

async function login(signer, claimedAddress) {
  const nonceRes = await fetch(`${base}/api/auth/nonce`);
  const { nonce } = await nonceRes.json();
  const message = createSiweMessage({ address: claimedAddress, chainId: 4663, nonce, domain: new URL(base).host, uri: base, version: "1", statement: "test" });
  const signature = await signer.signMessage({ message });
  const send = () => fetch(`${base}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json", cookie: cookieOf(nonceRes) }, body: JSON.stringify({ message, signature }) });
  return { res: await send(), replay: send };
}

const alice = privateKeyToAccount(generatePrivateKey());
const mallory = privateKeyToAccount(generatePrivateKey());

// 1. no session -> dashboard redirects home
const anon = await fetch(`${base}/dashboard`, { redirect: "manual" });
check("dashboard blocked without session", anon.status === 307, `(status ${anon.status} -> ${anon.headers.get("location")})`);

// 2. real login
const { res, replay } = await login(alice, alice.address);
const session = cookieOf(res);
check("valid signature signs in", res.status === 200 && (await res.json()).address === alice.address);

// 3. session works
const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: session } })).json();
check("/me returns the signed-in wallet", me.address === alice.address);
const dash = await fetch(`${base}/dashboard`, { headers: { cookie: session }, redirect: "manual" });
check("dashboard opens with session", dash.status === 200 && (await dash.text()).includes(alice.address));

// 4. replaying the same signed message fails (nonce is single use, cookie was cleared server-side;
//    we resend the ORIGINAL nonce cookie to simulate an attacker who captured everything)
const replayRes = await replay();
check("replay with captured nonce cookie", replayRes.status === 200 ? false : true, `(status ${replayRes.status})`);

// 5. mallory signs but claims alice's address
const forged = await login(mallory, alice.address);
check("forged signature rejected", forged.res.status === 401, `(status ${forged.res.status})`);

// 6. record scanner: needs a session, validates input, and scans the signed-in wallet
const anonScan = await fetch(`${base}/api/record`);
check("scan blocked without session", anonScan.status === 401);
const badNetwork = await fetch(`${base}/api/record?network=solana`, { headers: { cookie: session } });
check("scan rejects unknown network", badNetwork.status === 400);
const scan = await fetch(`${base}/api/record?network=mainnet`, { headers: { cookie: session } });
const scanBody = await scan.json();
check("new wallet gets an empty receipt", scan.status === 200 && scanBody.total === 0 && scanBody.address === alice.address, `(total ${scanBody.total})`);

// 7. logout
const out = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie: session } });
check("logout clears cookie", out.headers.getSetCookie().some((c) => c.startsWith("kredit_session=;")));
const stale = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: session } })).json();
check("a copy of the old cookie is dead after logout", stale.address === null);

// 8. signing out everywhere ends the wallet's other sessions too
const laptop = cookieOf((await login(alice, alice.address)).res);
const phone = cookieOf((await login(alice, alice.address)).res);
await fetch(`${base}/api/auth/logout?everywhere=1`, { method: "POST", headers: { cookie: laptop } });
const other = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: phone } })).json();
check("logout everywhere ends the other browser's session", other.address === null);

process.exit(results.every(Boolean) ? 0 : 1);
