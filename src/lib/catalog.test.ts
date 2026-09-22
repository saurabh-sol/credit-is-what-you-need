import assert from "node:assert/strict";
import { test } from "node:test";
import { parseModels } from "./catalog.ts";

// Trimmed from real /v1/models responses.
const vercel = [
  {
    id: "anthropic/claude-sonnet-5",
    object: "model",
    created: 1755815280,
    owned_by: "anthropic",
    name: "Claude Sonnet 5",
    type: "language",
    pricing: { input: "0.000002", output: "0.00001", input_cache_read: "0.0000002", web_search: "10" },
  },
  { id: "openai/text-embedding-3-small", name: "Text Embedding 3 Small", type: "embedding", pricing: { input: "0.00000002" } },
  { id: "google/imagen-4", name: "Imagen 4", type: "image", pricing: { image: "0.04" } },
  { id: "acme/unpriced", name: "No price", type: "language" },
  { name: "no id" },
];

const openRouter = [
  { id: "openai/gpt-4o-mini", name: "OpenAI: GPT-4o-mini", pricing: { prompt: "0.00000015", completion: "0.0000006" } },
];

test("keeps chat models from Vercel AI Gateway with their prices", () => {
  const models = parseModels(vercel);
  assert.deepEqual(
    models.map((model) => model.id),
    ["anthropic/claude-sonnet-5", "acme/unpriced"],
  );
  assert.deepEqual(models[0], {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    created: 1755815280,
    price: { input: 0.000002, output: 0.00001, cachedInput: 0.0000002 },
  });
  assert.equal(models[1].price, undefined);
});

test("reads OpenRouter's prompt and completion prices too", () => {
  const [model] = parseModels(openRouter);
  assert.deepEqual(model.price, { input: 0.00000015, output: 0.0000006 });
  assert.equal(model.provider, "openai");
});

test("a broken list yields nothing rather than a crash", () => {
  assert.deepEqual(parseModels(undefined), []);
  assert.deepEqual(parseModels({ data: [] }), []);
});
