// End-to-end check of Builder Royalties against a real testnet builder.
//   DATABASE_PATH=/tmp/fuel-test.db npx next start -p 3458
//   BASE_URL=http://localhost:3458 node scripts/royalties-test.mjs
// Signs sessions locally (local testing only: real users sign with their wallet).
import fs from "node:fs";
import { SignJWT } from "jose";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const BUILDER = "0x3b9964d8F96F8E970a068913eA1BA3A9B179b7d6"; // deployed MeridianProxy, which other wallets call
const BUSY_BUILDER = "0x0b64B35c6Dd23944D6D4029864D2cA2AA1B66422"; // thousands of txs: deployment is outside the scan window
const BUSY_CONTRACT = "0x713ecbb623b879e5C6e51978c32b41dfe25de58D";
const USER = "0x0695BCD9c32d90fdD4AD75e2aEE29213Db1e771D"; // only calls contracts, never deployed one
const secret = fs.readFileSync(".env.local", "utf8").match(/SESSION_SECRET=(.+)/)[1].trim();
const sessionFor = async (address) =>
  `fuel_session=${await new SignJWT({ address }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(secret))}`;

const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${detail}`); };
const get = async (cookie, path) => (await fetch(base + path, { headers: { cookie } })).json();
const postRaw = (cookie, path, body) =>
  fetch(base + path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
const post = async (cookie, path, body) => (await postRaw(cookie, path, body)).json();

check("royalties need a session", (await fetch(`${base}/api/royalties`)).status === 401);

const builder = await sessionFor(BUILDER);
const before = await get(builder, "/api/royalties?network=testnet");
if (before.error) { console.log("FAIL  scan error:", before.error); process.exit(1); }
console.log(`      ${before.contracts.length} contract(s); ${before.newCalls} new calls by others; ${before.claimable} credits claimable`);
for (const c of before.contracts.filter((c) => c.newCalls > 0)) console.log(`      ${c.address}  newCalls=${c.newCalls} newUsers=${c.newUsers}`);
check("the builder's contracts are found", before.contracts.length > 0);
check("other people's usage is counted", before.newCalls > 0 && before.contracts.some((c) => c.newUsers > 1));

const claimed = await post(builder, "/api/royalties/claim", { network: "testnet" });
check("claim pays what was shown", claimed.granted === before.claimable && claimed.calls === before.newCalls, `(${claimed.granted} credits for ${claimed.calls} calls)`);
const again = await post(builder, "/api/royalties/claim", { network: "testnet" });
check("claiming again pays nothing", again.granted === 0 && again.balance === claimed.balance);
const after = await get(builder, "/api/royalties?network=testnet");
check("paid calls are recorded per contract", after.newCalls === 0 && after.contracts.reduce((n, c) => n + c.paidCalls, 0) === claimed.calls);
const account = await get(builder, "/api/account");
check("royalties show in the builder's activity", claimed.granted === 0 || account.activity.some((e) => e.kind === "royalty"));

const user = await sessionFor(USER);
const none = await get(user, "/api/royalties?network=testnet");
check("a wallet with no contracts earns no royalties", none.contracts.length === 0 && none.claimable === 0);

// --- adding a contract by address
const stolen = await postRaw(user, "/api/royalties/contracts", { network: "testnet", address: BUSY_CONTRACT });
check("you cannot add a contract someone else deployed", stolen.status === 403);
const notContract = await postRaw(user, "/api/royalties/contracts", { network: "testnet", address: USER });
check("a wallet address is not accepted as a contract", notContract.status === 404);
const garbage = await postRaw(user, "/api/royalties/contracts", { network: "testnet", address: "hello" });
check("an invalid address is rejected", garbage.status === 400);

const busy = await sessionFor(BUSY_BUILDER);
const added = await postRaw(busy, "/api/royalties/contracts", { network: "testnet", address: BUSY_CONTRACT });
check("the real deployer can add their contract", added.status === 201);
const busyRoyalties = await get(busy, "/api/royalties?network=testnet");
const row = busyRoyalties.contracts?.find((c) => c.address === BUSY_CONTRACT.toLowerCase());
check("the added contract earns royalties from its users", row?.newCalls > 0, `(${row?.newCalls} calls, ${row?.newUsers} users, ${busyRoyalties.claimable} credits)`);

process.exit(results.every(Boolean) ? 0 : 1);
