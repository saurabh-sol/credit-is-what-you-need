import assert from "node:assert/strict";
import { test } from "node:test";
import { creditsFor, creditsPerMillion, DEFAULT_RESERVED_OUTPUT_TOKENS, reserveFor, usdFor } from "./pricing.ts";

// Claude Sonnet 5 on Vercel AI Gateway: $2 in, $10 out, $0.20 cached, per million.
const sonnet = { input: 0.000002, output: 0.00001, cachedInput: 0.0000002 };

test("uses the provider's reported cost plus Kredit's margin", () => {
  assert.equal(creditsFor({ inputTokens: 0, outputTokens: 0, costUsd: 0.01 }), 12); // $0.01 * 1.2 = 12 credits
});

test("falls back to a token price when no cost is reported", () => {
  // 1M in + 1M out = $18, * 1.2 = $21.60
  assert.equal(creditsFor({ inputTokens: 1_000_000, outputTokens: 1_000_000 }), 21_600);
});

test("bills at the model's list price when only tokens are reported", () => {
  // 1M in + 1M out = $12, * 1.2 = $14.40
  assert.equal(creditsFor({ inputTokens: 1_000_000, outputTokens: 1_000_000, price: sonnet }), 14_400);
  // A reported cost still wins over the list price.
  assert.equal(creditsFor({ inputTokens: 1_000_000, outputTokens: 0, price: sonnet, costUsd: 0.01 }), 12);
});

test("cached input is billed at its own rate", () => {
  const fresh = usdFor(sonnet, { input: 1_000_000, output: 0 });
  const cached = usdFor(sonnet, { input: 1_000_000, output: 0, cachedInput: 1_000_000 });
  assert.equal(fresh, 2);
  assert.ok(Math.abs(cached - 0.2) < 1e-12, `cached input should cost $0.20, not $${cached}`);
  // More cached tokens than input tokens cannot make a call cheaper than fully cached.
  assert.equal(usdFor(sonnet, { input: 100, output: 0, cachedInput: 1_000 }), usdFor(sonnet, { input: 100, output: 0, cachedInput: 100 }));
  assert.equal(creditsFor({ inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 1_000_000, price: sonnet }), 240);
});

test("a longer question or a longer answer costs more", () => {
  const short = creditsFor({ inputTokens: 20, outputTokens: 60 });
  const long = creditsFor({ inputTokens: 2_000, outputTokens: 1_500 });
  const huge = creditsFor({ inputTokens: 60_000, outputTokens: 8_000 });
  assert.deepEqual([short, long, huge], [2, 35, 360]);
  // Output is the expensive side: the same tokens cost more as an answer than as a question.
  assert.ok(creditsFor({ inputTokens: 0, outputTokens: 1_000 }) > creditsFor({ inputTokens: 1_000, outputTokens: 0 }));
});

test("every request costs at least one credit", () => {
  assert.equal(creditsFor({ inputTokens: 1, outputTokens: 1 }), 1);
  assert.equal(creditsFor({ inputTokens: 0, outputTokens: 0, costUsd: 0 }), 1);
});

test("a call is held to the longest answer it allows", () => {
  // 1,000 in at $2/M + 4,000 out at $10/M = $0.042, * 1.2 = 50.4 -> 51 credits
  assert.equal(reserveFor(sonnet, { input: 1_000, maxOutput: 4_000 }), 51);
  // Without max_tokens the default allowance applies.
  assert.equal(reserveFor(sonnet, { input: 1_000 }), creditsFor({ inputTokens: 1_000, outputTokens: DEFAULT_RESERVED_OUTPUT_TOKENS, price: sonnet }));
  assert.equal(reserveFor(sonnet, { input: 1_000, maxOutput: 0 }), reserveFor(sonnet, { input: 1_000 }));
  // Unknown models are held at the fallback price.
  assert.equal(reserveFor(undefined, { input: 1_000, maxOutput: 4_000 }), creditsFor({ inputTokens: 1_000, outputTokens: 4_000 }));
});

test("list prices are shown per million tokens with the margin included", () => {
  assert.equal(creditsPerMillion(sonnet.input), 2_400);
  assert.equal(creditsPerMillion(sonnet.output), 12_000);
  assert.equal(creditsPerMillion(0.0000001), 120); // gpt-4.1-nano input
});
