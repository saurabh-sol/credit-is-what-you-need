// End-to-end check of the spend guard: a call is kept within the balance, and
// calls running at the same time cannot spend the same credits twice.
// This script is the AI provider: it listens on MOCK_PORT (default 3462), so
// start the server pointed at it, sharing SESSION_SECRET and DATABASE_PATH:
//   UPSTREAM_BASE_URL=http://localhost:3462 UPSTREAM_API_KEY=test DATABASE_PATH=/tmp/kredit-test.db npx next start -p 3458
//   DATABASE_PATH=/tmp/kredit-test.db BASE_URL=http://localhost:3458 node scripts/guard-test.mjs
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { databasePath, sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";

// --- the pretend provider: $3 in, $15 out per million tokens, answers up to 8,000 tokens
const received = [];
let delayMs = 0;
const provider = http.createServer(async (request, response) => {
  const send = (body) => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  if (request.url === "/models") {
    return send({
      data: [{ id: "mock/pricey", name: "Pricey", pricing: { prompt: "0.000003", completion: "0.000015" }, top_provider: { max_completion_tokens: 8000 } }],
    });
  }
  let text = "";
  for await (const chunk of request) text += chunk;
  received.push(JSON.parse(text));
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  send({
    id: "mock-1", object: "chat.completion", model: "mock/pricey",
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.001 }, // 2 credits with the margin
  });
});
await new Promise((resolve) => provider.listen(Number(process.env.MOCK_PORT ?? 3462), resolve));

const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${detail}`); };

const WALLET = `0x${Date.now().toString(16).padStart(40, "d")}`; // a fresh wallet every run
const cookie = await sessionCookie(WALLET);
const database = new DatabaseSync(databasePath);
const grant = (credits) =>
  database.prepare("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, 'claim', 'guard-test')").run(WALLET.toLowerCase(), credits);
const balance = async () => (await (await fetch(`${base}/api/account`, { headers: { cookie } })).json()).balance;

const created = await (await fetch(`${base}/api/keys`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "guard" }) })).json();
const chat = (body) =>
  fetch(`${base}/v1/chat/completions`, {
    method: "POST", headers: { authorization: `Bearer ${created.key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "mock/pricey", messages: [{ role: "user", content: "hi" }], ...body }),
  });

// --- a thin balance shortens the answer instead of going into debt
grant(20);
const thin = await chat({});
const sent = received.at(-1);
check("a thin balance caps the answer length", thin.status === 200 && sent.max_tokens > 0 && sent.max_tokens < 8000, `(max_tokens ${sent?.max_tokens})`);
const worstCase = Math.ceil(sent.max_tokens * 15e-6 * 1.2 * 1000);
check("the longest answer allowed fits in the balance", worstCase <= 20, `(worst case ${worstCase} of 20 credits)`);
check("the call is charged what it really cost", thin.headers.get("x-kredit-credits-charged") === "2" && (await balance()) === 18);

const asked = await chat({ max_completion_tokens: 6000 });
const sentAsked = received.at(-1);
check("a request for more than the balance covers is cut down", asked.status === 200 && sentAsked.max_completion_tokens < 6000 && sentAsked.max_tokens === undefined, `(max_completion_tokens ${sentAsked?.max_completion_tokens})`);

// --- a prompt the balance cannot cover never reaches the provider
const calls = received.length;
const huge = await chat({ messages: [{ role: "user", content: "x".repeat(400_000) }] });
const hugeBody = await huge.json();
check("a prompt too big for the balance is refused", huge.status === 402 && hugeBody.error.code === "insufficient_credits", `(${hugeBody.error?.message})`);
check("and the provider is never called for it", received.length === calls);

// --- two calls at once cannot both spend the same credits
delayMs = 700;
const [first, second] = await Promise.all([chat({}), new Promise((resolve) => setTimeout(resolve, 150)).then(() => chat({}))]);
const secondBody = second.status === 402 ? await second.json() : null;
check("while one call holds the balance, a second is refused", first.status === 200 && second.status === 402, `(${first.status}, ${second.status})`);
check("and says why", secondBody?.error.message.includes("other calls are still running") === true);
delayMs = 0;
check("the hold is given back when the call ends", (await chat({})).status === 200);

// --- a healthy balance is left alone
grant(100_000);
await chat({});
check("a healthy balance sends the request untouched", received.at(-1).max_tokens === undefined);
await chat({ max_tokens: 300 });
check("and keeps the caller's own limit", received.at(-1).max_tokens === 300);

const listed = await (await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${created.key}` } })).json();
check("/v1/models lists the provider's models", listed.data.some((model) => model.id === "mock/pricey") && listed.data[0].id === "kredit/echo");

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
provider.close();
process.exit(results.every(Boolean) ? 0 : 1);
