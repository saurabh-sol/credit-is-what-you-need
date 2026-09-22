import { findKey, recordUsage } from "./ledger.ts";
import { creditsFor, estimateTokens, type ModelPrice } from "./pricing.ts";

// A built-in model that repeats your message. It lets anyone test a key
// end-to-end before a real AI provider is configured.
export const ECHO_MODEL = "kredit/echo";
// The id the echo model had before the rename. Requests for it are still answered.
export const LEGACY_ECHO_MODEL = "fuel/echo";

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60; // requests per key per minute
const recentRequests = new Map<string, number[]>();

// Errors use the OpenAI shape so existing clients display them properly.
export function apiError(status: number, message: string, code: string) {
  const type = status >= 500 ? "server_error" : "invalid_request_error";
  return Response.json({ error: { message, type, code } }, { status });
}

export type Caller = { keyId: string; address: string };

export function authenticate(request: Request): Caller | Response {
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? findKey(header.slice(7).trim()) : null;
  if (!key) {
    return apiError(401, "Invalid or revoked API key. Create one on your Kredit dashboard.", "invalid_api_key");
  }

  return rateLimited(key.id) ?? { keyId: key.id, address: key.address };
}

// Counts a request against `id` (a key, or a playground user). Returns the 429 once over the limit.
export function rateLimited(id: string) {
  const now = Date.now();
  const recent = (recentRequests.get(id) ?? []).filter((time) => time > now - RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    return apiError(429, `Rate limit reached: ${RATE_LIMIT} requests per minute per key.`, "rate_limit_exceeded");
  }
  recentRequests.set(id, [...recent, now]);
  return null;
}

// Usage from the website's playground is recorded under this name instead of a key.
export const PLAYGROUND_KEY_ID = "playground";

// Every credit spent here is paid for from one prepaid balance at Vercel AI
// Gateway, which bills each model at its maker's list price and reports the
// exact cost of every call. Any other OpenAI-compatible API can stand in for it.
export const VERCEL_AI_GATEWAY = "https://ai-gateway.vercel.sh/v1";

export function upstream() {
  const custom = process.env.UPSTREAM_BASE_URL?.trim();
  const baseUrl = (custom || VERCEL_AI_GATEWAY).replace(/\/$/, "");
  // The two UPSTREAM_ variables go together; the Vercel key is only for the default.
  const apiKey = (custom ? process.env.UPSTREAM_API_KEY : process.env.AI_GATEWAY_API_KEY)?.trim() || undefined;
  return { baseUrl, apiKey, isOpenRouter: baseUrl.includes("openrouter.ai") };
}

// The usage block on a chat completion. Vercel AI Gateway and OpenRouter both
// put the call's cost in it; `gateway_cost` also counts any add-on surcharges.
export type ProviderUsage =
  | {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
      cost?: number;
      gateway_cost?: number;
    }
  | undefined;

// Turns what the provider reported into a charge on the caller's balance.
export function settle(
  caller: Caller,
  model: string,
  usage: ProviderUsage,
  text: { input: string; output: string },
  price?: ModelPrice,
) {
  const inputTokens = usage?.prompt_tokens ?? estimateTokens(text.input);
  const outputTokens = usage?.completion_tokens ?? estimateTokens(text.output);
  const reported = usage?.gateway_cost ?? usage?.cost;
  const costUsd = typeof reported === "number" && Number.isFinite(reported) ? reported : undefined;
  const cachedInputTokens = usage?.prompt_tokens_details?.cached_tokens;
  const credits = creditsFor({ inputTokens, outputTokens, cachedInputTokens, costUsd, price });
  const balance = recordUsage({ ...caller, model, inputTokens, outputTokens, credits });
  return { credits, balance };
}

export const chargeHeaders = (charge: { credits: number; balance: number }) => ({
  "x-kredit-credits-charged": String(charge.credits),
  "x-kredit-balance": String(charge.balance),
});
