import { creditsFor, CREDITS_PER_USD, ECHO_PRICE } from "./pricing.ts";

// What typical requests cost, worked out by the real pricing function so the
// numbers shown to people can never drift from what they are charged. They use
// a mid-priced model ($3 in, $15 out per million tokens); every model's own
// price is on /v1/models and in the playground.

const sizes = [
  { name: "A quick question", detail: "one line in, a short answer out", inputTokens: 20, outputTokens: 60 },
  { name: "A normal chat turn", detail: "a paragraph each way", inputTokens: 300, outputTokens: 500 },
  { name: "A long question", detail: "a page of context, a detailed answer", inputTokens: 2_000, outputTokens: 1_500 },
  { name: "A big task", detail: "review a whole contract", inputTokens: 12_000, outputTokens: 4_000 },
  { name: "A huge task", detail: "a codebase-sized prompt", inputTokens: 60_000, outputTokens: 8_000 },
];

export const costExamples = sizes.map((size) => {
  const credits = creditsFor(ECHO_PRICE, size);
  return { ...size, credits, usd: credits / CREDITS_PER_USD };
});
