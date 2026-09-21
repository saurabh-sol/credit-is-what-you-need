// End-to-end check of the public platform pieces: display names, the
// playground, the distribution board and top-up gating.
// Needs a server and this script to share SESSION_SECRET and DATABASE_PATH:
//   SESSION_SECRET=… DATABASE_PATH=/tmp/kredit-test.db npx next start -p 3458
//   SESSION_SECRET=… DATABASE_PATH=/tmp/kredit-test.db BASE_URL=http://localhost:3458 node scripts/platform-test.mjs
// Credits are seeded straight into the database (local testing only).
import { DatabaseSync } from "node:sqlite";
import { sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const WALLET = `0x${Date.now().toString(16).padStart(40, "c")}`; // a fresh wallet every run
const cookie = await sessionCookie(WALLET);

const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${detail}`); };
const app = (path, init = {}) => fetch(base + path, { ...init, headers: { cookie, "content-type": "application/json", ...init.headers } });
const json = async (response) => response.json();

// --- pages render
for (const page of ["/", "/docs", "/playground", "/distribution"]) {
  check(`${page} renders`, (await fetch(base + page)).status === 200);
}

// --- the signed-in product
for (const page of ["/dashboard", "/dashboard/earn", "/dashboard/keys", "/dashboard/activity", "/dashboard/credits", "/dashboard/settings"]) {
  check(`${page} renders for a signed-in wallet`, (await app(page)).status === 200);
}
const stranger = await fetch(`${base}/dashboard/keys`, { redirect: "manual" });
check("dashboard pages send signed-out visitors away", stranger.status >= 300 && stranger.status < 400);

// --- display name
const badName = await app("/api/profile", { method: "PUT", body: JSON.stringify({ name: "<b>" }) });
check("a name with markup is refused", badName.status === 400);
const NAME = `Mira ${Date.now() % 100000}`;
const named = await json(await app("/api/profile", { method: "PUT", body: JSON.stringify({ name: `  ${NAME}  ` }) }));
check("a valid name is trimmed and saved", named.name === NAME);
check("signed-out visitors cannot set a name", (await fetch(`${base}/api/profile`, { method: "PUT", body: "{}" })).status === 401);

// --- playground
const hello = { model: "kredit/echo", stream: true, messages: [{ role: "user", content: "hi" }] };
const signedOut = await fetch(`${base}/api/playground`, { method: "POST", body: JSON.stringify(hello) });
check("playground needs a session", signedOut.status === 401);
const broke = await app("/api/playground", { method: "POST", body: JSON.stringify(hello) });
check("playground refuses an empty balance", broke.status === 402, `(${(await json(broke)).error.code})`);

const database = new DatabaseSync(process.env.DATABASE_PATH ?? "data/fuel.db");
database.prepare("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, 500, 'claim', 'platform-test')").run(WALLET.toLowerCase());

const reply = await app("/api/playground", { method: "POST", body: JSON.stringify(hello) });
const stream = await reply.text();
check("playground streams the model's answer", reply.status === 200 && stream.includes("Kredit echo: hi") && stream.includes("[DONE]"));
const account = await json(await app("/api/account"));
check("the reply was paid from the wallet's balance", account.balance === 499, `(balance ${account.balance})`);
const essay = { ...hello, messages: [{ role: "user", content: "Explain rollups in depth. ".repeat(300) }] };
await (await app("/api/playground", { method: "POST", body: JSON.stringify(essay) })).text();
const afterEssay = (await json(await app("/api/account"))).balance;
check("a long request costs more than a short one", 499 - afterEssay > 10, `(${499 - afterEssay} credits vs 1)`);
const usage = database.prepare("SELECT key_id FROM usage WHERE address = ?").get(WALLET.toLowerCase());
check("usage is recorded under the playground, not a key", usage?.key_id === "playground");

// --- distribution
const board = await json(await fetch(`${base}/api/distribution?q=${encodeURIComponent(NAME)}`));
const row = board.wallets[0];
check("the wallet shows on the board under its name", row?.name === NAME && row.address === WALLET.toLowerCase());
check("the board counts what was earned, not what is left", row?.earned === 500 && row.bySource.claim === 500);
const page = await fetch(`${base}/distribution`);
check("the distribution page renders once it has wallets to show", page.status === 200 && (await page.text()).includes(NAME));
check("searching for nobody finds nobody", (await json(await fetch(`${base}/api/distribution?q=zzzz-nobody`))).wallets.length === 0);

// --- models and top-ups
const models = await json(await fetch(`${base}/api/models`));
check("the model catalog always has the test model", models.models.some((model) => model.id === "kredit/echo"));
const { config } = await json(await fetch(`${base}/api/topup`));
if (config) {
  check("top-up config names the chain to pay on", Number.isInteger(config.chainId) && config.creditsPerToken > 0);
  const junk = await app("/api/topup", { method: "POST", body: JSON.stringify({ hash: "0x1234" }) });
  check("a malformed payment hash is refused", junk.status === 400);
} else {
  const closed = await app("/api/topup", { method: "POST", body: JSON.stringify({ hash: `0x${"0".repeat(64)}` }) });
  check("top-ups are closed until configured", closed.status === 503);
}

await app("/api/profile", { method: "PUT", body: JSON.stringify({ name: "" }) });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
