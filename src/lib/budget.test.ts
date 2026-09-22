import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateInputTokens, heldFor, hold, planSpend } from "./budget.ts";
import { creditsFor, ECHO_PRICE, type ModelPrice } from "./pricing.ts";

// $3 in, $15 out per million tokens; answers of up to 8,000 tokens.
const MODEL: ModelPrice = { input: 3e-6, output: 15e-6, maxOutputTokens: 8000 };

test("a healthy balance leaves the request alone and holds its worst case", () => {
  const plan = planSpend({ available: 10_000, inputTokens: 1000, price: MODEL });
  assert.deepEqual(plan, { ok: true, maxTokens: null, hold: 148 }); // (1000 x $3 + 8000 x $15) / 1M x 1.2 x 1000, rounded up
});

test("a requested limit lowers the hold", () => {
  const plan = planSpend({ available: 10_000, inputTokens: 1000, requestedMaxTokens: 500, price: MODEL });
  assert.deepEqual(plan, { ok: true, maxTokens: null, hold: 13 });
});

test("a thin balance shortens the answer to what it can pay for", () => {
  const plan = planSpend({ available: 20, inputTokens: 1000, price: MODEL });
  assert.ok(plan.ok && plan.maxTokens !== null);
  assert.ok(plan.maxTokens < 8000);
  // The longest answer allowed never costs more than the balance.
  const worst = creditsFor(MODEL, { inputTokens: 1000, outputTokens: plan.maxTokens });
  assert.ok(worst <= 20, `worst case ${worst} credits`);
  assert.equal(plan.hold, worst);
});

test("a request asking for more than the balance covers is cut down too", () => {
  const plan = planSpend({ available: 20, inputTokens: 1000, requestedMaxTokens: 4000, price: MODEL });
  assert.ok(plan.ok && plan.maxTokens !== null && plan.maxTokens < 4000);
});

test("a prompt the balance cannot cover is refused with what it needs", () => {
  const plan = planSpend({ available: 3, inputTokens: 100_000, price: MODEL });
  assert.deepEqual(plan, { ok: false, needed: 361 });
  assert.equal(planSpend({ available: 0, inputTokens: 1, price: MODEL }).ok, false);
});

test("free models are never shortened", () => {
  const free: ModelPrice = { input: 0, output: 0, maxOutputTokens: 4000 };
  assert.deepEqual(planSpend({ available: 1, inputTokens: 50_000, price: free }), { ok: true, maxTokens: null, hold: 1 });
});

test("a model with no known answer limit is planned with an assumed length", () => {
  const plan = planSpend({ available: 100_000, inputTokens: 0, price: { ...ECHO_PRICE, maxOutputTokens: undefined } });
  assert.deepEqual(plan, { ok: true, maxTokens: null, hold: 295 }); // 16,384 x $15 / 1M x 1.2 x 1000, rounded up
});

test("attachments count flat, not by the size of their base64", () => {
  const photo = { type: "image_url", image_url: { url: `data:image/png;base64,${"A".repeat(2_000_000)}` } };
  const tokens = estimateInputTokens([
    { role: "system", content: "12345678" }, // 2 tokens
    { role: "user", content: [{ type: "text", text: "1234" }, photo] }, // 1 + 1,000
    null,
  ]);
  assert.equal(tokens, 1003);
});

test("holds add up per wallet and are given back once", () => {
  const ALICE = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
  const first = hold(ALICE, 100);
  const second = hold(ALICE.toLowerCase(), 40);
  assert.equal(heldFor(ALICE), 140);
  first();
  first(); // a second release changes nothing
  assert.equal(heldFor(ALICE), 40);
  second();
  assert.equal(heldFor(ALICE), 0);
});
