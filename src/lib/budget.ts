import { creditsFor, CREDITS_PER_USD, estimateTokens, FALLBACK_USD_PER_MILLION, MARGIN } from "./pricing.ts";

// Keeps a call within what the caller can pay for. Before a request goes to
// the provider we work out its worst case, shorten the answer if the balance
// can't cover a longer one, and hold those credits until the real charge lands.
// Pure logic apart from the in-memory holds, so the money rules are easy to test.

export type ModelLimits = {
  inputUsdPerToken: number;
  outputUsdPerToken: number;
  maxOutputTokens?: number; // what the provider says the model can write at most
};

// Used when the provider's price list doesn't know the model.
export const FALLBACK_LIMITS: ModelLimits = {
  inputUsdPerToken: FALLBACK_USD_PER_MILLION.input / 1_000_000,
  outputUsdPerToken: FALLBACK_USD_PER_MILLION.output / 1_000_000,
};

// When neither the request nor the provider says how long an answer can get.
const ASSUMED_MAX_OUTPUT = 16_384;
// Below this an answer is cut off before it says anything; better to refuse.
const MIN_OUTPUT_TOKENS = 16;
const IMAGE_TOKENS = 1_000; // a flat guess per attached image or file

// Rough size of the prompt. Attachments are counted flat instead of by the
// length of their base64, which would make one photo look like a whole book.
export function estimateInputTokens(messages: unknown[]) {
  let tokens = 0;
  for (const message of messages) {
    const content = (message as { content?: unknown } | null)?.content;
    if (typeof content === "string") tokens += estimateTokens(content);
    else if (Array.isArray(content)) {
      for (const part of content) {
        const text = (part as { text?: unknown } | null)?.text;
        tokens += typeof text === "string" ? estimateTokens(text) : IMAGE_TOKENS;
      }
    } else if (content != null) tokens += estimateTokens(JSON.stringify(content));
  }
  return tokens;
}

export type SpendPlan =
  | { ok: true; hold: number; maxTokens: number | null } // maxTokens: send this limit, or null to leave the request as it is
  | { ok: false; needed: number };

export function planSpend(input: {
  available: number; // balance minus credits held by calls still running
  inputTokens: number;
  requestedMaxTokens?: number;
  limits: ModelLimits;
}): SpendPlan {
  const { available, inputTokens, limits } = input;
  const inputUsd = inputTokens * limits.inputUsdPerToken;
  const cost = (outputTokens: number) =>
    creditsFor({ inputTokens, outputTokens, costUsd: inputUsd + outputTokens * limits.outputUsdPerToken });

  const needed = cost(MIN_OUTPUT_TOKENS);
  if (available < needed) return { ok: false, needed };

  const cap = Math.min(input.requestedMaxTokens ?? Infinity, limits.maxOutputTokens ?? ASSUMED_MAX_OUTPUT);
  // The longest answer the balance covers, from the same formula the charge uses.
  const budgetUsd = available / CREDITS_PER_USD / (1 + MARGIN) - inputUsd;
  const affordable =
    limits.outputUsdPerToken > 0 ? Math.floor(budgetUsd / limits.outputUsdPerToken) : Infinity;

  if (affordable >= cap) return { ok: true, hold: Math.min(available, cost(cap)), maxTokens: null };
  const maxTokens = Math.max(MIN_OUTPUT_TOKENS, affordable);
  return { ok: true, hold: Math.min(available, cost(maxTokens)), maxTokens };
}

// --- Holds -------------------------------------------------------------------
// Credits promised to calls that are still running. In memory is enough: the
// ledger is one SQLite file, so there is only ever one server process, and a
// restart ends every running call along with its hold.

const holder = globalThis as { kreditHolds?: Map<string, number> };
const holds = () => (holder.kreditHolds ??= new Map());

export const heldFor = (address: string) => holds().get(address.toLowerCase()) ?? 0;

// Returns the function that gives the credits back. Safe to call twice.
export function hold(address: string, credits: number) {
  const key = address.toLowerCase();
  holds().set(key, heldFor(key) + credits);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = heldFor(key) - credits;
    if (left > 0) holds().set(key, left);
    else holds().delete(key);
  };
}
