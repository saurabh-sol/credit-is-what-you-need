// What a model call costs in credits. 1,000 credits = $1.
export const CREDITS_PER_USD = 1000;
export const MARGIN = 0.2; // Kredit's cut on top of the provider's price
export const MIN_CREDITS_PER_REQUEST = 1;

// A price step: tokens from `min` up to (not including) `max` cost `usd` each.
export type PriceTier = { min: number; max?: number; usd: number };

// A model's price list, in USD per token, as the provider publishes it.
export type ModelPrice = {
  input: number;
  output: number;
  cacheRead?: number; // prompt tokens the provider served from its cache
  cacheWrite?: number; // prompt tokens the provider stored in its cache
  // Long-context models charge more for every token once the prompt passes a
  // size. The tier is chosen by the prompt size and applies to the whole call.
  inputTiers?: PriceTier[];
  outputTiers?: PriceTier[];
  maxOutputTokens?: number; // the longest answer the model can write
  contextWindow?: number;
};

// How much of what was used, as the provider reports it after the call.
export type TokenUsage = {
  inputTokens: number; // all prompt tokens, including cached ones
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

// The price used only for the built-in echo model, which has no provider. It
// stands in for a mid-priced model so a key can be tested against real charges.
export const ECHO_PRICE: ModelPrice = { input: 3 / 1_000_000, output: 15 / 1_000_000, maxOutputTokens: 4096 };

const tierFor = (tiers: PriceTier[] | undefined, promptTokens: number, flat: number) => {
  const tier = tiers?.find((step) => promptTokens >= step.min && (step.max === undefined || promptTokens < step.max));
  return tier?.usd ?? flat;
};

// The provider's price for a call, before Kredit's margin.
export function usdFor(price: ModelPrice, usage: TokenUsage) {
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const plain = Math.max(0, usage.inputTokens - cacheRead - cacheWrite);
  const inputUsd = tierFor(price.inputTiers, usage.inputTokens, price.input);
  const outputUsd = tierFor(price.outputTiers, usage.inputTokens, price.output);
  // Cache prices scale with the input tier the same way the provider's do.
  const scale = price.input > 0 ? inputUsd / price.input : 1;
  return (
    plain * inputUsd +
    cacheRead * (price.cacheRead ?? price.input) * scale +
    cacheWrite * (price.cacheWrite ?? price.input) * scale +
    usage.outputTokens * outputUsd
  );
}

// Provider price in USD -> credits, with the margin, rounded up, at least one.
export const creditsForUsd = (usd: number) =>
  Math.max(MIN_CREDITS_PER_REQUEST, Math.ceil(usd * (1 + MARGIN) * CREDITS_PER_USD));

export const creditsFor = (price: ModelPrice, usage: TokenUsage) => creditsForUsd(usdFor(price, usage));

// Rough token count for when a provider reports no usage at all.
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
