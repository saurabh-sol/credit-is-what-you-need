// End-to-end check of the spend guard: a call is kept within the balance, and
// calls running at the same time cannot spend the same credits twice.
// This script is the AI provider: it listens on MOCK_PORT (default 3462), so
// start the server pointed at it, sharing SESSION_SECRET and DATABASE_URL:
//   UPSTREAM_BASE_URL=http://localhost:3462 UPSTREAM_API_KEY=test DATABASE_URL=postgres://… npx next start -p 3458
//   DATABASE_URL=postgres://… BASE_URL=http://localhost:3458 node scripts/guard-test.mjs
import http from "node:http";
import { query } from "./lib/db.mjs";
import { sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";

// --- the pretend provider: $3 in, $15 out per million tokens, answers up to 8,000 tokens
const received = [];
let delayMs = 0;
const provider = http.createServer(async (request, response) => {
  const send = (body) => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  if (request.url === "/models") {
    return send({
      data: [
        // OpenRouter's shape: it reports the exact cost of each call.
        { id: "mock/pricey", name: "Pricey", pricing: { prompt: "0.000003", completion: "0.000015" }, top_provider: { max_completion_tokens: 8000 } },
        // Vercel AI Gateway's shape: priced from the list, with cache and long-context tiers.
        {
          id: "mock/vercel", name: "Vercel-shaped", type: "language", context_window: 1_000_000, max_tokens: 64_000,
          pricing: {
            input: "0.000003", output: "0.000015", input_cache_read: "0.0000003",
            input_tiers: [{ cost: "0.000003", min: 0, max: 200001 }, { cost: "0.000006", min: 200001 }],
            output_tiers: [{ cost: "0.000015", min: 0, max: 200001 }, { cost: "0.0000225", min: 200001 }],
          },
        },
        { id: "mock/embed", name: "Embedder", type: "embedding", pricing: { input: "0.00000002" } },
      ],
    });
  }
  let text = "";
  for await (const chunk of request) text += chunk;
  const body = JSON.parse(text);
  received.push(body);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  if (request.url === "/messages") {
    // Anthropic counts cached tokens apart from input_tokens: 200 + 800 cached, 100 out -> 3 credits, as above.
    if (!body.stream) {
      return send({ id: "msg-1", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 800 } });
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
    response.write(ev("message_start", { message: { id: "msg-1", type: "message", role: "assistant", model: body.model, content: [], usage: { input_tokens: 200, output_tokens: 1, cache_read_input_tokens: 800 } } }));
    response.write(ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }));
    response.write(ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "ok" } }));
    response.write(ev("content_block_stop", { index: 0 }));
    response.write(ev("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 100 } }));
    return response.end(ev("message_stop", {}));
  }
  if (request.url === "/responses") {
    const usage = { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 800 } };
    const done = { id: "resp-1", object: "response", model: body.model, output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }], usage };
    if (!body.stream) return send(done);
    response.writeHead(200, { "content-type": "text/event-stream" });
    const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
    response.write(ev("response.created", { response: { id: "resp-1", object: "response" } }));
    response.write(ev("response.output_text.delta", { delta: "ok" }));
    return response.end(ev("response.completed", { response: done }));
  }
  if (request.url === "/embeddings") {
    return send({ object: "list", model: body.model, data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 50_000, total_tokens: 50_000 } });
  }
  if (body.model === "mock/vercel") {
    // 1,000 prompt tokens of which 800 cached, 100 out: (200 x 3 + 800 x 0.3 + 100 x 15) / 1M = $0.00234 -> 3 credits
    const usage = { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 800 } };
    if (!body.stream) {
      return send({ id: "mock-2", object: "chat.completion", model: body.model, choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage });
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (delta, finish_reason, extra = {}) => `data: ${JSON.stringify({ id: "mock-2", object: "chat.completion.chunk", model: body.model, choices: [{ index: 0, delta, finish_reason }], ...extra })}\n\n`;
    response.write(chunk({ role: "assistant", content: "ok" }, null));
    response.write(chunk({}, "stop"));
    response.write(`data: ${JSON.stringify({ id: "mock-2", object: "chat.completion.chunk", model: body.model, choices: [], usage })}\n\n`);
    return response.end("data: [DONE]\n\n");
  }
  send({
    id: "mock-1", object: "chat.completion", model: "mock/pricey",
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.002 }, // 2 credits at the provider's price
  });
});
await new Promise((resolve) => provider.listen(Number(process.env.MOCK_PORT ?? 3462), resolve));

const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${detail}`); };

const WALLET = `0x${Date.now().toString(16).padStart(40, "d")}`; // a fresh wallet every run
const cookie = await sessionCookie(WALLET);
const grant = (credits) =>
  query("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, 'claim', 'guard-test')", [WALLET.toLowerCase(), credits]);
const balance = async () => (await (await fetch(`${base}/api/account`, { headers: { cookie } })).json()).balance;

const created = await (await fetch(`${base}/api/keys`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "guard" }) })).json();
const chat = (body) =>
  fetch(`${base}/v1/chat/completions`, {
    method: "POST", headers: { authorization: `Bearer ${created.key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "mock/pricey", messages: [{ role: "user", content: "hi" }], ...body }),
  });

// --- a thin balance shortens the answer instead of going into debt
await grant(20);
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
await grant(100_000);
await chat({});
check("a healthy balance sends the request untouched", received.at(-1).max_tokens === undefined);
await chat({ max_tokens: 300 });
check("and keeps the caller's own limit", received.at(-1).max_tokens === 300);

const listed = await (await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${created.key}` } })).json();
check("/v1/models lists the provider's models", listed.data.some((model) => model.id === "mock/pricey") && listed.data[0].id === "kredit/echo");
const vercel = listed.data.find((model) => model.id === "mock/vercel");
check("/v1/models shows prices in credits per million tokens", vercel?.pricing.credits_per_million_input === 3600 && vercel?.pricing.credits_per_million_output === 18_000 && vercel?.context_window === 1_000_000, JSON.stringify(vercel?.pricing));

// --- a provider that reports no cost is billed from its price list
const before = await balance();
const priced = await chat({ model: "mock/vercel" });
check("cached prompt tokens are billed at the cache price", priced.headers.get("x-kredit-credits-charged") === "3" && (await balance()) === before - 3, `(charged ${priced.headers.get("x-kredit-credits-charged")})`);

const streamed = await chat({ model: "mock/vercel", stream: true });
const events = await streamed.text();
const chargeLine = events.split("\n").find((line) => line.includes('"kredit"'));
const charge = chargeLine && JSON.parse(chargeLine.slice(6));
check("a stream ends with the charge, then [DONE]", charge?.kredit.credits_charged === 3 && charge.kredit.balance === before - 6 && events.trimEnd().endsWith("data: [DONE]"), chargeLine?.slice(0, 80));
check("the provider's own [DONE] is not passed through twice", events.split("[DONE]").length === 2);

const unknown = await chat({ model: "mock/nope" });
check("an unknown model is refused, not guessed", unknown.status === 404 && (await unknown.json()).error.code === "model_not_found");
const embed = await chat({ model: "mock/embed" });
check("an embedding model cannot chat", embed.status === 400 && (await embed.json()).error.code === "model_not_supported");
await chat({ provider: { order: ["cheap"] }, models: ["mock/other"] });
check("provider routing fields never reach the provider", received.at(-1).provider === undefined && received.at(-1).models === undefined);

// --- the rest of the API: account, usage, embeddings, browser access
const auth = { authorization: `Bearer ${created.key}` };
const account = await fetch(`${base}/v1/account`, { headers: auth });
const accountBody = await account.json();
check("/v1/account shows the balance behind the key", account.status === 200 && accountBody.balance === (await balance()) && accountBody.key.name === "guard" && accountBody.held === 0, JSON.stringify(accountBody).slice(0, 120));
check("every /v1 response carries CORS, a request id and the rate limit", account.headers.get("access-control-allow-origin") === "*" && /^[0-9a-f-]{36}$/.test(account.headers.get("x-request-id") ?? "") && account.headers.get("x-ratelimit-limit") === "60" && Number(account.headers.get("x-ratelimit-remaining")) < 60);
const pre = await fetch(`${base}/v1/chat/completions`, { method: "OPTIONS" });
check("preflight answers without a key", pre.status === 204 && pre.headers.get("access-control-allow-headers")?.includes("authorization"));

const usage = await (await fetch(`${base}/v1/usage?limit=2`, { headers: auth })).json();
const spentSoFar = usage.by_model.reduce((sum, model) => sum + model.credits, 0);
check("/v1/usage lists calls newest first with a per-model summary", usage.data.length === 2 && usage.has_more === true && usage.data[0].id > usage.data[1].id && usage.total_credits === spentSoFar && usage.by_model.some((model) => model.model === "mock/vercel" && model.calls === 2 && model.credits === 6), JSON.stringify(usage.by_model));
const nextPage = await (await fetch(`${base}/v1/usage?limit=2&before=${usage.next}`, { headers: auth })).json();
check("and pages continue from `next`", nextPage.data.every((row) => row.id < usage.next));
const badDate = await fetch(`${base}/v1/usage?from=yesterday`, { headers: auth });
check("a bad date is a 400, not a crash", badDate.status === 400);
const future = await (await fetch(`${base}/v1/usage?from=2999-01-01`, { headers: auth })).json();
check("a period with no calls is empty", future.data.length === 0 && future.total_credits === 0);

const beforeEmbed = await balance();
const embedding = await fetch(`${base}/v1/embeddings`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ model: "mock/embed", input: ["hello", "world"] }) });
// 50,000 tokens x $0.02/M = $0.001 x 1.2 = 1.2 -> 2 credits
check("/v1/embeddings is billed on input tokens", embedding.status === 200 && embedding.headers.get("x-kredit-credits-charged") === "2" && (await balance()) === beforeEmbed - 2, `(charged ${embedding.headers.get("x-kredit-credits-charged")})`);
const notEmbed = await fetch(`${base}/v1/embeddings`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ model: "mock/vercel", input: "x" }) });
check("a chat model cannot embed", notEmbed.status === 400 && (await notEmbed.json()).error.code === "model_not_supported");

// --- the other dialects: Anthropic Messages and OpenAI Responses
const post = (path, headers, body) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const anthropicBody = { model: "mock/vercel", max_tokens: 500, messages: [{ role: "user", content: "hi" }] };

let start = await balance();
const msg = await post("/v1/messages", { "x-api-key": created.key }, anthropicBody);
check("/v1/messages takes the key in x-api-key and bills cached tokens at the cache price", msg.status === 200 && msg.headers.get("x-kredit-credits-charged") === "3" && (await balance()) === start - 3 && received.at(-1).max_tokens === 500, `(${msg.status}, charged ${msg.headers.get("x-kredit-credits-charged")})`);
start = await balance();
const msgStream = await post("/v1/messages", { authorization: `Bearer ${created.key}` }, { ...anthropicBody, stream: true });
const msgEvents = await msgStream.text();
check("a streamed message is passed through untouched and billed when it ends", msgStream.status === 200 && msgEvents.includes("event: message_stop") && !msgEvents.includes("kredit") && (await balance()) === start - 3, `(balance moved ${start - (await balance())})`);
const msgNoMax = await post("/v1/messages", { "x-api-key": created.key }, { ...anthropicBody, max_tokens: undefined });
const msgErr = await msgNoMax.json();
check("errors use Anthropic's shape on /v1/messages", msgNoMax.status === 400 && msgErr.type === "error" && msgErr.error.type === "invalid_request_error", JSON.stringify(msgErr));
const msgBadKey = await post("/v1/messages", { "x-api-key": "kred_sk_nope" }, anthropicBody);
check("a wrong key on /v1/messages is an authentication_error", msgBadKey.status === 401 && (await msgBadKey.json()).error.type === "authentication_error");

start = await balance();
const resp = await post("/v1/responses", { authorization: `Bearer ${created.key}` }, { model: "mock/vercel", input: "hi", max_output_tokens: 400 });
check("/v1/responses is billed from its usage block", resp.status === 200 && resp.headers.get("x-kredit-credits-charged") === "3" && (await balance()) === start - 3 && received.at(-1).max_output_tokens === 400, `(charged ${resp.headers.get("x-kredit-credits-charged")})`);
start = await balance();
const respStream = await post("/v1/responses", { authorization: `Bearer ${created.key}` }, { model: "mock/vercel", input: [{ role: "user", content: "hi" }], stream: true });
const respEvents = await respStream.text();
check("a streamed response is billed from response.completed", respStream.status === 200 && respEvents.includes("event: response.completed") && (await balance()) === start - 3);

// A thin balance shortens the answer in every dialect.
const THIN = `0x${Date.now().toString(16).padStart(40, "f")}`;
const thinCookie = await sessionCookie(THIN);
await query("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, 20, 'claim', 'guard-test')", [THIN.toLowerCase()]);
const thinKey = await (await fetch(`${base}/api/keys`, { method: "POST", headers: { cookie: thinCookie, "content-type": "application/json" }, body: JSON.stringify({ name: "thin" }) })).json();
await post("/v1/messages", { "x-api-key": thinKey.key }, { ...anthropicBody, max_tokens: 8000 });
const thinMsg = received.at(-1);
await post("/v1/responses", { authorization: `Bearer ${thinKey.key}` }, { model: "mock/vercel", input: "hi" });
const thinResp = received.at(-1);
check("a thin balance shortens Anthropic and Responses calls too", thinMsg.max_tokens > 0 && thinMsg.max_tokens < 8000 && thinResp.max_output_tokens > 0 && thinResp.max_output_tokens < 64_000, `(max_tokens ${thinMsg.max_tokens}, max_output_tokens ${thinResp.max_output_tokens})`);

const spec = await fetch(`${base}/v1/openapi.json`);
const specBody = await spec.json();
check("/v1/openapi.json is public and lists every endpoint", spec.status === 200 && specBody.openapi === "3.1.0" && ["/chat/completions", "/responses", "/messages", "/embeddings", "/models", "/account", "/usage"].every((path) => path in specBody.paths) && specBody.servers[0].url === `${base}/v1`);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
provider.close();
process.exit(results.every(Boolean) ? 0 : 1);
