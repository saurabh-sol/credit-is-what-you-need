// What a model call costs in credits. 1,000 credits = $1.
export const CREDITS_PER_USD = 1000;
export const MARGIN = 0.2; // Kredit's cut on top of the provider's price
export const MIN_CREDITS_PER_REQUEST = 1;

// Used only when the provider reports neither the call's cost nor the model's price.
const FALLBACK_USD_PER_MILLION = { input: 3, output: 15 };

// A model's list price in USD per token, as the gateway publishes it.
export type ModelPrice = { input: number; output: number; cachedInput?: number };

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  /** What the provider said the call cost. Beats every estimate. */
  costUsd?: number;
  /** The model's list price, for providers that report tokens but not cost. */
  price?: ModelPrice;
};

// What tokens cost at a model's list price. Cached input is the part of the
// prompt the provider had already seen, billed at its own (cheaper) rate.
export function usdFor(price: ModelPrice, tokens: { input: number; output: number; cachedInput?: number }) {
  const cached = Math.min(tokens.cachedInput ?? 0, tokens.input);
  const fresh = tokens.input - cached;
  return fresh * price.input + cached * (price.cachedInput ?? price.input) + tokens.output * price.output;
}

export function creditsFor(usage: Usage) {
  const usd =
    usage.costUsd ??
    (usage.price
      ? usdFor(usage.price, { input: usage.inputTokens, output: usage.outputTokens, cachedInput: usage.cachedInputTokens })
      : (usage.inputTokens * FALLBACK_USD_PER_MILLION.input + usage.outputTokens * FALLBACK_USD_PER_MILLION.output) /
        1_000_000);
  return Math.max(MIN_CREDITS_PER_REQUEST, Math.ceil(usd * (1 + MARGIN) * CREDITS_PER_USD));
}

// A call is forwarded only when the balance covers the prompt plus the longest
// answer it allows, so nobody can run up a bill they cannot pay. Requests that
// set no max_tokens are held to this many output tokens.
export const DEFAULT_RESERVED_OUTPUT_TOKENS = 1024;

export function reserveFor(price: ModelPrice | undefined, tokens: { input: number; maxOutput?: number }) {
  const outputTokens = tokens.maxOutput && tokens.maxOutput > 0 ? tokens.maxOutput : DEFAULT_RESERVED_OUTPUT_TOKENS;
  return creditsFor({ inputTokens: tokens.input, outputTokens, price });
}

// A list price as people see it: credits per million tokens, margin included.
export const creditsPerMillion = (usdPerToken: number) =>
  Math.round(usdPerToken * 1_000_000 * (1 + MARGIN) * CREDITS_PER_USD * 100) / 100;

// Rough token count for when a provider reports no usage at all.
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
