import assert from "node:assert/strict";
import { test } from "node:test";
import { creditsFor } from "./pricing.ts";

test("uses the provider's reported cost plus Fuel's margin", () => {
  assert.equal(creditsFor({ inputTokens: 0, outputTokens: 0, costUsd: 0.01 }), 12); // $0.01 * 1.2 = 12 credits
});

test("falls back to a token price when no cost is reported", () => {
  // 1M in + 1M out = $18, * 1.2 = $21.60
  assert.equal(creditsFor({ inputTokens: 1_000_000, outputTokens: 1_000_000 }), 21_600);
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
