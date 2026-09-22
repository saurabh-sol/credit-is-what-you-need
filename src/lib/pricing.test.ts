import assert from "node:assert/strict";
import { test } from "node:test";
import { creditsFor, creditsForUsd, ECHO_PRICE, type ModelPrice, usdFor } from "./pricing.ts";

// $3 in, $15 out per million tokens: the echo model's stand-in price.
const MID = ECHO_PRICE;

test("a provider's price gets Kredit's margin, rounded up", () => {
  assert.equal(creditsForUsd(0.01), 12); // $0.01 * 1.2 = 12 credits
});

test("tokens are priced from the model's list", () => {
  // 1M in + 1M out = $18, * 1.2 = $21.60
  assert.equal(creditsFor(MID, { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 21_600);
});

test("a longer question or a longer answer costs more", () => {
  const short = creditsFor(MID, { inputTokens: 20, outputTokens: 60 });
  const long = creditsFor(MID, { inputTokens: 2_000, outputTokens: 1_500 });
  const huge = creditsFor(MID, { inputTokens: 60_000, outputTokens: 8_000 });
  assert.deepEqual([short, long, huge], [2, 35, 360]);
  // Output is the expensive side: the same tokens cost more as an answer than as a question.
  assert.ok(creditsFor(MID, { inputTokens: 0, outputTokens: 1_000 }) > creditsFor(MID, { inputTokens: 1_000, outputTokens: 0 }));
});

test("every request costs at least one credit", () => {
  assert.equal(creditsFor(MID, { inputTokens: 1, outputTokens: 1 }), 1);
  assert.equal(creditsForUsd(0), 1);
});

test("cached prompt tokens are billed at the cache price, not the full one", () => {
  const price: ModelPrice = { input: 3e-6, output: 15e-6, cacheRead: 0.3e-6, cacheWrite: 3.75e-6 };
  const plain = usdFor(price, { inputTokens: 1000, outputTokens: 0 });
  const cached = usdFor(price, { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 800 });
  const written = usdFor(price, { inputTokens: 1000, outputTokens: 0, cacheWriteTokens: 1000 });
  assert.equal(plain, 0.003);
  assert.ok(Math.abs(cached - (200 * 3e-6 + 800 * 0.3e-6)) < 1e-12);
  assert.ok(Math.abs(written - 1000 * 3.75e-6) < 1e-12);
  // A model without cache prices bills cached tokens at the normal price.
  assert.equal(usdFor(MID, { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 800 }), plain);
});

test("long prompts move the whole call to the model's long-context tier", () => {
  const price: ModelPrice = {
    input: 3e-6,
    output: 15e-6,
    inputTiers: [{ min: 0, max: 200_001, usd: 3e-6 }, { min: 200_001, usd: 6e-6 }],
    outputTiers: [{ min: 0, max: 200_001, usd: 15e-6 }, { min: 200_001, usd: 22.5e-6 }],
    cacheRead: 0.3e-6,
  };
  const short = usdFor(price, { inputTokens: 1000, outputTokens: 100 });
  const long = usdFor(price, { inputTokens: 300_000, outputTokens: 100 });
  assert.ok(Math.abs(short - (1000 * 3e-6 + 100 * 15e-6)) < 1e-12);
  assert.ok(Math.abs(long - (300_000 * 6e-6 + 100 * 22.5e-6)) < 1e-12);
  // The cache price doubles with the tier, as the provider's does.
  const longCached = usdFor(price, { inputTokens: 300_000, outputTokens: 0, cacheReadTokens: 300_000 });
  assert.ok(Math.abs(longCached - 300_000 * 0.6e-6) < 1e-12);
});
