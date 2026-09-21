import { creditsFor, CREDITS_PER_USD } from "./pricing.ts";

// What typical requests cost, worked out by the real pricing function so the
// numbers shown to people can never drift from what they are charged. These use
// the fallback token price; a provider that reports its own price is billed at that instead.

const sizes = [
  { name: "A quick question", detail: "one line in, a short answer out", inputTokens: 20, outputTokens: 60 },
  { name: "A normal chat turn", detail: "a paragraph each way", inputTokens: 300, outputTokens: 500 },
  { name: "A long question", detail: "a page of context, a detailed answer", inputTokens: 2_000, outputTokens: 1_500 },
  { name: "A big task", detail: "review a whole contract", inputTokens: 12_000, outputTokens: 4_000 },
  { name: "A huge task", detail: "a codebase-sized prompt", inputTokens: 60_000, outputTokens: 8_000 },
];

export const costExamples = sizes.map((size) => {
  const credits = creditsFor(size);
  return { ...size, credits, usd: credits / CREDITS_PER_USD };
});
