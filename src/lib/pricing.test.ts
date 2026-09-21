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

test("every request costs at least one credit", () => {
  assert.equal(creditsFor({ inputTokens: 1, outputTokens: 1 }), 1);
  assert.equal(creditsFor({ inputTokens: 0, outputTokens: 0, costUsd: 0 }), 1);
});
