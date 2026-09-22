// Drives /v1 the way real clients do: the OpenAI SDK (chat, Responses,
// embeddings, models), the Anthropic SDK, Cursor's request shapes, a browser
// preflight and the legacy text-completion endpoint. Calls go to the real
// provider, so a run costs a few credits' worth of the cheapest models.
// Needs a server and this script to share SESSION_SECRET and DATABASE_URL:
//   DATABASE_URL=postgres://… npx next start -p 3458
//   DATABASE_URL=postgres://… BASE_URL=http://localhost:3458 node scripts/compat-test.mjs
// Credits are seeded straight into the database (local testing only).
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { query } from "./lib/db.mjs";
import { sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const CHAT = process.env.CHAT_MODEL ?? "openai/gpt-4o-mini";
const EMBED = process.env.EMBED_MODEL ?? "openai/text-embedding-3-small";
const CLAUDE = process.env.CLAUDE_MODEL ?? "anthropic/claude-haiku-4.5";
const WALLET = `0x${Date.now().toString(16).padStart(40, "d")}`; // a fresh wallet every run

const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${detail}`); };
const attempt = async (name, fn) => {
  try {
    await fn();
  } catch (error) {
    check(name, false, `threw: ${error?.status ?? ""} ${String(error?.message ?? error).slice(0, 200)}`);
  }
};

// --- a key with credits
const cookie = await sessionCookie(WALLET);
await query("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, 3000, 'claim', 'compat-test')", [WALLET.toLowerCase()]);
const created = await (await fetch(`${base}/api/keys`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "compat" }) })).json();
const key = created.key;
check("a key is created for the test wallet", typeof key === "string" && key.startsWith("kred_sk_"));
const raw = (path, body, headers = {}) =>
  fetch(`${base}/v1${path}`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const openai = new OpenAI({ baseURL: `${base}/v1`, apiKey: key, maxRetries: 0 });
const anthropic = new Anthropic({ baseURL: base, apiKey: key, maxRetries: 0 });

// --- OpenAI SDK: models
await attempt("models.list", async () => {
  const ids = [];
  for await (const model of await openai.models.list()) ids.push(model.id);
  check("openai.models.list()", ids.includes(CHAT), `(${ids.length} models)`);
});
await attempt("models.retrieve", async () => {
  const model = await openai.models.retrieve(CHAT);
  check("openai.models.retrieve(id) with the slash encoded", model.id === CHAT && model.object === "model");
});
await attempt("models by path", async () => {
  const response = await fetch(`${base}/v1/models/${CHAT}`, { headers: { authorization: `Bearer ${key}` } });
  check("GET /v1/models/<provider>/<model> as two segments", response.status === 200 && (await response.json()).id === CHAT);
});

// --- OpenAI SDK: chat completions
await attempt("chat", async () => {
  const reply = await openai.chat.completions.create({ model: CHAT, messages: [{ role: "user", content: "Say the word pong." }], max_tokens: 20 });
  check("chat.completions.create", /pong/i.test(reply.choices[0].message.content ?? "") && reply.usage.prompt_tokens > 0);
});
await attempt("chat max_completion_tokens", async () => {
  const reply = await openai.chat.completions.create({ model: CHAT, messages: [{ role: "user", content: "Say pong." }], max_completion_tokens: 20 });
  check("chat with max_completion_tokens", typeof reply.choices[0].message.content === "string");
});
await attempt("chat stream", async () => {
  const stream = await openai.chat.completions.create({ model: CHAT, messages: [{ role: "user", content: "Count from 1 to 5, digits only." }], stream: true });
  let text = "";
  let usage = null;
  let chunks = 0;
  for await (const chunk of stream) {
    chunks++;
    text += chunk.choices?.[0]?.delta?.content ?? "";
    if (chunk.usage) usage = chunk.usage;
  }
  check("chat.completions stream=true, with a usage chunk", text.includes("5") && chunks > 2 && usage?.completion_tokens > 0, `(${chunks} chunks)`);
});
await attempt("chat stream helper", async () => {
  const final = await openai.chat.completions.stream({ model: CHAT, messages: [{ role: "user", content: "Say pong." }] }).finalChatCompletion();
  check("chat.completions.stream().finalChatCompletion()", typeof final.choices[0].message.content === "string");
});
const weather = { type: "function", function: { name: "get_weather", description: "Weather for a city", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } };
await attempt("tools", async () => {
  const reply = await openai.chat.completions.create({ model: CHAT, messages: [{ role: "user", content: "What is the weather in Paris? Use the tool." }], tools: [weather] });
  const call = reply.choices[0].message.tool_calls?.[0];
  check("chat tool calling", call?.function?.name === "get_weather" && call.function.arguments.includes("Paris"));
});
await attempt("tools stream", async () => {
  const stream = await openai.chat.completions.create({ model: CHAT, messages: [{ role: "user", content: "What is the weather in Paris? Use the tool." }], tools: [weather], stream: true });
  let name = "";
  let args = "";
  for await (const chunk of stream) {
    const call = chunk.choices?.[0]?.delta?.tool_calls?.[0];
    name += call?.function?.name ?? "";
    args += call?.function?.arguments ?? "";
  }
  check("chat tool calling while streaming", name === "get_weather" && args.includes("Paris"));
});
await attempt("json mode", async () => {
  const reply = await openai.chat.completions.create({ model: CHAT, messages: [{ role: "user", content: 'Return JSON {"ok": true}' }], response_format: { type: "json_object" } });
  check("chat response_format json_object", JSON.parse(reply.choices[0].message.content).ok === true);
});
await attempt("multi-turn", async () => {
  const reply = await openai.chat.completions.create({
    model: CHAT,
    messages: [
      { role: "system", content: "You answer with one word." },
      { role: "user", content: [{ type: "text", text: "Say pong." }] },
      { role: "assistant", content: "pong" },
      { role: "user", content: "Again." },
    ],
  });
  check("chat with system, content parts and history", typeof reply.choices[0].message.content === "string");
});

// --- OpenAI SDK: Responses API
await attempt("responses", async () => {
  const reply = await openai.responses.create({ model: CHAT, input: "Say pong.", instructions: "One word." });
  check("responses.create", /pong/i.test(reply.output_text ?? "") && reply.usage.input_tokens > 0);
});
await attempt("responses stream", async () => {
  const stream = await openai.responses.create({ model: CHAT, input: "Count 1 to 3.", stream: true });
  let text = "";
  let completed = false;
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") text += event.delta;
    if (event.type === "response.completed") completed = true;
  }
  check("responses.create stream=true", text.includes("3") && completed);
});
await attempt("responses tools", async () => {
  const reply = await openai.responses.create({
    model: CHAT,
    input: "Weather in Paris? Use the tool.",
    tools: [{ type: "function", name: "get_weather", parameters: { type: "object", properties: { city: { type: "string" } } } }],
  });
  const call = reply.output.find((item) => item.type === "function_call");
  check("responses tool calling", call?.name === "get_weather");
});

// --- OpenAI SDK: embeddings, legacy completions
await attempt("embeddings", async () => {
  const reply = await openai.embeddings.create({ model: EMBED, input: ["hello", "world"] });
  check("embeddings.create", reply.data.length === 2 && reply.data[0].embedding.length > 100);
});
await attempt("completions", async () => {
  const reply = await openai.completions.create({ model: CHAT, prompt: "Say the word pong.", max_tokens: 20 });
  check("legacy completions.create", reply.object === "text_completion" && /pong/i.test(reply.choices[0].text));
});
await attempt("completions stream", async () => {
  const stream = await openai.completions.create({ model: CHAT, prompt: "Count from 1 to 5, digits only.", stream: true });
  let text = "";
  for await (const chunk of stream) text += chunk.choices?.[0]?.text ?? "";
  check("legacy completions.create stream=true", text.includes("5"));
});

// --- Cursor
await attempt("cursor verify", async () => {
  const response = await raw("/chat/completions", { model: CHAT, messages: [{ role: "user", content: "hi" }], stream: false });
  check("Cursor's key check (a plain chat completion)", response.status === 200);
});
// Cursor's agent mode on GPT-5 models sends a Responses-shaped body to
// /chat/completions and reads chat chunks back (Cursor forum thread 159298).
await attempt("cursor agent", async () => {
  const response = await raw("/chat/completions", {
    model: CHAT,
    input: [{ role: "user", content: [{ type: "input_text", text: "Say pong." }] }],
    instructions: "One word.",
    stream: true,
    stream_options: { include_usage: true },
    include: ["reasoning.encrypted_content"],
    reasoning: { effort: "low", summary: "auto" },
    text: { verbosity: "low" },
  });
  const body = await response.text();
  const events = body.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
  const text = events.map((event) => event.choices?.[0]?.delta?.content ?? "").join("");
  check(
    "Cursor's agent shape: a Responses body on /chat/completions, chat chunks back",
    response.status === 200 && events.every((event) => event.object === "chat.completion.chunk") && /pong/i.test(text),
    `(${response.status} ${text.slice(0, 40) || body.slice(0, 120).replace(/\n/g, " ")})`,
  );
});
await attempt("cursor agent tools", async () => {
  const response = await raw("/chat/completions", {
    model: CHAT,
    input: [
      { role: "user", content: [{ type: "input_text", text: "Weather in Paris? Use the tool." }] },
      { type: "function_call", call_id: "call_1", name: "get_weather", arguments: '{"city":"Paris"}' },
      { type: "function_call_output", call_id: "call_1", output: "sunny, 21C" },
    ],
    tools: [{ type: "function", name: "get_weather", parameters: { type: "object", properties: { city: { type: "string" } } } }],
  });
  const body = await response.json();
  check("Cursor's agent shape: tool call history and Responses-style tools", response.status === 200 && /sunny|21/i.test(body.choices?.[0]?.message?.content ?? ""));
});
await attempt("unknown model", async () => {
  const response = await raw("/chat/completions", { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] });
  check("a bare OpenAI model name gets a clear 404", response.status === 404 && (await response.json()).error.code === "model_not_found");
});

// --- Anthropic SDK
await attempt("anthropic", async () => {
  const reply = await anthropic.messages.create({ model: CLAUDE, max_tokens: 20, messages: [{ role: "user", content: "Say pong." }] });
  check("anthropic.messages.create", /pong/i.test(reply.content[0].text ?? ""));
});
await attempt("anthropic stream", async () => {
  const final = await anthropic.messages.stream({ model: CLAUDE, max_tokens: 30, messages: [{ role: "user", content: "Count 1 to 3." }] }).finalMessage();
  check("anthropic.messages.stream", final.content[0].text.includes("3") && final.usage.output_tokens > 0);
});
await attempt("anthropic bearer", async () => {
  const response = await raw("/messages", { model: CLAUDE, max_tokens: 10, messages: [{ role: "user", content: "hi" }] }, { "anthropic-version": "2023-06-01" });
  check("/v1/messages with a Bearer header", response.status === 200);
});

// --- errors, browsers, unknown paths
await attempt("bad key", async () => {
  const wrong = new OpenAI({ baseURL: `${base}/v1`, apiKey: "kred_sk_wrong", maxRetries: 0 });
  await wrong.chat.completions.create({ model: CHAT, messages: [{ role: "user", content: "hi" }] }).then(
    () => check("a wrong key raises AuthenticationError", false),
    (error) => check("a wrong key raises AuthenticationError", error.constructor.name === "AuthenticationError"),
  );
});
await attempt("preflight", async () => {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "OPTIONS",
    headers: { origin: "https://example.com", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,x-stainless-os,x-stainless-retry-count" },
  });
  const allowed = response.headers.get("access-control-allow-headers") ?? "";
  check("a browser preflight allows the SDKs' x-stainless-* headers", response.status === 204 && allowed.includes("x-stainless-os"));
});
await attempt("unknown path", async () => {
  const response = await fetch(`${base}/v1/no/such/thing`, { headers: { authorization: `Bearer ${key}` } });
  const body = await response.json().catch(() => null);
  check("an unknown /v1 path is a JSON 404", response.status === 404 && body?.error?.code === "not_found");
});

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
