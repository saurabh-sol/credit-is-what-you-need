// What a model call costs in credits. 1,000 credits = $1.
export const CREDITS_PER_USD = 1000;
export const MARGIN = 0.2; // Kredit's cut on top of the provider's price
export const MIN_CREDITS_PER_REQUEST = 1;

// Used only when the provider doesn't report what the call cost.
const FALLBACK_USD_PER_MILLION = { input: 3, output: 15 };

export type Usage = { inputTokens: number; outputTokens: number; costUsd?: number };

export function creditsFor(usage: Usage) {
  const usd =
    usage.costUsd ??
    (usage.inputTokens * FALLBACK_USD_PER_MILLION.input +
      usage.outputTokens * FALLBACK_USD_PER_MILLION.output) /
      1_000_000;
  return Math.max(MIN_CREDITS_PER_REQUEST, Math.ceil(usd * (1 + MARGIN) * CREDITS_PER_USD));
}

// Rough token count for when a provider reports no usage at all.
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
