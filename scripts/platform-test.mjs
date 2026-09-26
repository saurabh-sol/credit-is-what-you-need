// End-to-end check of the public platform pieces: the playground and top-up gating.
// Needs a server and this script to share SESSION_SECRET and DATABASE_URL:
//   SESSION_SECRET=… DATABASE_URL=postgres://… npx next start -p 3458
//   SESSION_SECRET=… DATABASE_URL=postgres://… BASE_URL=http://localhost:3458 node scripts/platform-test.mjs
// Credits are seeded straight into the database (local testing only).
import { query } from "./lib/db.mjs";
import { sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const WALLET = `0x${Date.now().toString(16).padStart(40, "c")}`; // a fresh wallet every run
const cookie = await sessionCookie(WALLET);

const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${detail}`); };
const app = (path, init = {}) => fetch(base + path, { ...init, headers: { cookie, "content-type": "application/json", ...init.headers } });
const json = async (response) => response.json();

// --- pages render
for (const page of ["/", "/docs", "/playground"]) {
  check(`${page} renders`, (await fetch(base + page)).status === 200);
}

// --- the signed-in product
for (const page of ["/dashboard", "/dashboard/earn", "/dashboard/keys", "/dashboard/activity", "/dashboard/credits", "/dashboard/settings"]) {
  check(`${page} renders for a signed-in wallet`, (await app(page)).status === 200);
}
const stranger = await fetch(`${base}/dashboard/keys`, { redirect: "manual" });
check("dashboard pages send signed-out visitors away", stranger.status >= 300 && stranger.status < 400);

// --- playground
const hello = { model: "kredit/echo", stream: true, messages: [{ role: "user", content: "hi" }] };
const signedOut = await fetch(`${base}/api/playground`, { method: "POST", body: JSON.stringify(hello) });
check("playground needs a session", signedOut.status === 401);
const broke = await app("/api/playground", { method: "POST", body: JSON.stringify(hello) });
check("playground refuses an empty balance", broke.status === 402, `(${(await json(broke)).error.code})`);

await query("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, 500, 'claim', 'platform-test')", [WALLET.toLowerCase()]);

const reply = await app("/api/playground", { method: "POST", body: JSON.stringify(hello) });
const stream = await reply.text();
check("playground streams the model's answer", reply.status === 200 && stream.includes("Kredit echo: hi") && stream.includes("[DONE]"));
const account = await json(await app("/api/account"));
check("the reply was paid from the wallet's balance", account.balance === 499, `(balance ${account.balance})`);
const essay = { ...hello, messages: [{ role: "user", content: "Explain rollups in depth. ".repeat(300) }] };
await (await app("/api/playground", { method: "POST", body: JSON.stringify(essay) })).text();
const afterEssay = (await json(await app("/api/account"))).balance;
check("a long request costs more than a short one", 499 - afterEssay > 10, `(${499 - afterEssay} credits vs 1)`);
const usage = (await query("SELECT key_id FROM usage WHERE address = ?", [WALLET.toLowerCase()])).rows[0];
check("usage is recorded under the playground, not a key", usage?.key_id === "playground");

// --- models and top-ups
const models = await json(await fetch(`${base}/api/models`));
check("the model catalog always has the test model", models.models.some((model) => model.id === "kredit/echo"));
const { config } = await json(await fetch(`${base}/api/topup`));
if (config) {
  check("top-up config names the chain to pay on", Number.isInteger(config.chainId) && config.usdgPerCredit > 0);
  const junk = await app("/api/topup", { method: "POST", body: JSON.stringify({ hash: "0x1234" }) });
  check("a malformed payment hash is refused", junk.status === 400);
} else {
  const closed = await app("/api/topup", { method: "POST", body: JSON.stringify({ hash: `0x${"0".repeat(64)}` }) });
  check("top-ups are closed until configured", closed.status === 503);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
