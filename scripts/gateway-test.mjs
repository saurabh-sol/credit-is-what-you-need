// End-to-end check of claim -> key -> gateway -> balance.
// Needs a server started with the same SESSION_SECRET as .env.local:
//   DATABASE_PATH=/tmp/kredit-test.db npx next start -p 3458
//   DATABASE_PATH=/tmp/kredit-test.db BASE_URL=http://localhost:3458 node scripts/gateway-test.mjs
// It signs a session locally for a real, active testnet wallet (local testing
// only: real users must sign with their wallet).
import { sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const WALLET = "0x0695BCD9c32d90fdD4AD75e2aEE29213Db1e771D";
const cookie = await sessionCookie(WALLET);

const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${detail}`); };
const app = (path, init = {}) => fetch(base + path, { ...init, headers: { cookie, "content-type": "application/json", ...init.headers } });
const chat = (key, body) => fetch(`${base}/v1/chat/completions`, {
  method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body),
});
const hello = { model: "kredit/echo", messages: [{ role: "user", content: "hello kredit" }] };

// --- before any credits
const start = await (await app("/api/account")).json();
check("new account starts at zero", start.balance === 0 && start.keys.length === 0);

const created = await (await app("/api/keys", { method: "POST", body: JSON.stringify({ name: "test" }) })).json();
check("key is created and shown once", created.key?.startsWith("kredit_sk_"));
const broke = await chat(created.key, hello);
check("gateway refuses a wallet with no credits", broke.status === 402, `(${(await broke.json()).error.code})`);

// --- claim
const record = await (await app("/api/record?network=testnet")).json();
check("scan shows claimable credits", record.claimable > 0 && record.claimable === record.total, `(${record.claimable})`);
const claimed = await (await app("/api/claim", { method: "POST", body: JSON.stringify({ network: "testnet" }) })).json();
check("claim pays exactly what the receipt showed", claimed.granted === record.claimable && claimed.balance === record.claimable);
if (record.gasBackAvailable) {
  const line = record.lines.find((l) => l.label.startsWith("Gas-Back"));
  check("gas-back is on the receipt and paid with the claim", line?.credits > 0 && claimed.gasBack === line.credits, `(${claimed.gasBack} credits)`);
} else {
  check("testnet pays no gas-back unless switched on", record.gasBackOffered || (claimed.gasBack === 0 && !record.lines.some((l) => l.label.startsWith("Gas-Back"))));
  if (record.gasBackOffered) console.log("SKIP  gas-back (ETH price feed unreachable)");
}
const again = await (await app("/api/claim", { method: "POST", body: JSON.stringify({ network: "testnet" }) })).json();
check("claiming twice pays nothing the second time", again.granted === 0 && again.balance === claimed.balance);
const rescanned = await (await app("/api/record?network=testnet")).json();
check("receipt now shows nothing left to claim", rescanned.claimable === 0);

// --- gateway
const noKey = await fetch(`${base}/v1/chat/completions`, { method: "POST", body: JSON.stringify(hello) });
check("gateway rejects a missing key", noKey.status === 401);
const wrongKey = await chat("kredit_sk_not_a_real_key", hello);
check("gateway rejects a wrong key", wrongKey.status === 401);
const bad = await chat(created.key, { model: "kredit/echo" });
check("gateway rejects a body without messages", bad.status === 400);

const reply = await chat(created.key, hello);
const replyBody = await reply.json();
check("echo model answers in OpenAI format", reply.status === 200 && replyBody.choices[0].message.content === "Kredit echo: hello kredit");
check("response reports the charge", reply.headers.get("x-kredit-credits-charged") === "1" && reply.headers.get("x-kredit-balance") === String(claimed.balance - 1));

const streamed = await chat(created.key, { ...hello, stream: true });
const sse = await streamed.text();
check("streaming works", streamed.headers.get("content-type").includes("text/event-stream") && sse.includes("Kredit echo: hello kredit") && sse.trim().endsWith("data: [DONE]"));

const real = await chat(created.key, { ...hello, model: "some/real-model" });
const realCode = (await real.json()).error.code;
// Without a provider: 503. With one (CI runs a mock): the made-up model is unknown.
check("an unlisted model is refused with a clear reason", (real.status === 503 && realCode === "provider_not_configured") || (real.status === 404 && realCode === "model_not_found"), `(${realCode})`);

const models = await (await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${created.key}` } })).json();
check("/v1/models lists the echo model", models.data.some((m) => m.id === "kredit/echo"));

const after = await (await app("/api/account")).json();
check("balance dropped by the two paid calls", after.balance === claimed.balance - 2, `(${claimed.balance} -> ${after.balance})`);
check("activity shows the claim and the spending", after.activity.some((e) => e.kind === "claim") && after.activity.filter((e) => e.kind === "spend").length === 2);
check("key shows as used", Boolean(after.keys[0].lastUsedAt));

// --- revoke
const revoked = await app(`/api/keys/${created.id}`, { method: "DELETE" });
check("key can be revoked", revoked.status === 200);
check("revoked key stops working at once", (await chat(created.key, hello)).status === 401);

// --- other people can't touch this account
const stranger = await fetch(`${base}/api/account`);
check("account is private without a session", stranger.status === 401);

process.exit(results.every(Boolean) ? 0 : 1);
