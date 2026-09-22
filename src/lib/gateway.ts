import { findKey, recordUsage } from "./ledger.ts";
import { creditsForUsd, estimateTokens, type ModelPrice, type TokenUsage, usdFor } from "./pricing.ts";

// A built-in model that repeats your message. It lets anyone test a key
// end-to-end before a real AI provider is configured.
export const ECHO_MODEL = "kredit/echo";

const RATE_WINDOW_MS = 60_000;
export const RATE_LIMIT = 60; // requests per key per minute
const recentRequests = new Map<string, number[]>();
let lastSweep = 0;

// Headers every /v1 response carries, so the API works from a browser on any
// site and every call can be traced by its id.
export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-api-key, anthropic-version, content-type, x-kredit-user",
  "access-control-expose-headers": "x-kredit-credits-charged, x-kredit-balance, x-request-id, x-ratelimit-limit, x-ratelimit-remaining",
  "access-control-max-age": "86400",
};

// Wraps a /v1 handler: adds the CORS and tracing headers to whatever it returns.
export function v1(handler: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response> | Response) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }) => {
    const response = await handler(request, context);
    for (const [name, value] of Object.entries(CORS_HEADERS)) response.headers.set(name, value);
    response.headers.set("x-request-id", crypto.randomUUID());
    const remaining = rateRemaining.get(request); // set by authenticate()
    if (remaining !== undefined) {
      response.headers.set("x-ratelimit-limit", String(RATE_LIMIT));
      response.headers.set("x-ratelimit-remaining", String(remaining));
    }
    return response;
  };
}

const rateRemaining = new WeakMap<Request, number>();

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

// Errors use the OpenAI shape so existing clients display them properly.
export function apiError(status: number, message: string, code: string) {
  const type = status >= 500 ? "server_error" : "invalid_request_error";
  return Response.json({ error: { message, type, code } }, { status });
}

export type Caller = { keyId: string; address: string; keyName?: string; keyPrefix?: string };

export type ErrorShape = typeof apiError;

// `error` shapes the refusals: OpenAI's by default, or the dialect's own.
export function authenticate(request: Request, error: ErrorShape = apiError): Caller | Response {
  // OpenAI-style clients send a bearer token; Anthropic-style clients send x-api-key.
  const header = request.headers.get("authorization") ?? `Bearer ${request.headers.get("x-api-key") ?? ""}`;
  const key = header.startsWith("Bearer ") ? findKey(header.slice(7).trim()) : null;
  if (!key) {
    return error(401, "Invalid or revoked API key. Create one on your Kredit dashboard.", "invalid_api_key");
  }

  const limited = rateLimited(key.id, error);
  if (limited) return limited;
  rateRemaining.set(request, RATE_LIMIT - (recentRequests.get(key.id)?.length ?? 0)); // for v1() to report
  return { keyId: key.id, address: key.address, keyName: key.name, keyPrefix: key.prefix };
}

// Counts a request against `id` (a key, or a playground user). Returns the 429 once over the limit.
export function rateLimited(id: string, error: ErrorShape = apiError) {
  const now = Date.now();
  // Once a minute, forget callers who have gone quiet so the map can't grow forever.
  if (now - lastSweep > RATE_WINDOW_MS) {
    lastSweep = now;
    for (const [caller, times] of recentRequests) {
      if (times[times.length - 1] <= now - RATE_WINDOW_MS) recentRequests.delete(caller);
    }
  }
  const recent = (recentRequests.get(id) ?? []).filter((time) => time > now - RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    return error(429, `Rate limit reached: ${RATE_LIMIT} requests per minute per key.`, "rate_limit_exceeded");
  }
  recentRequests.set(id, [...recent, now]);
  return null;
}

// Usage from the website's playground is recorded under this name instead of a key.
export const PLAYGROUND_KEY_ID = "playground";

// The AI provider behind /v1. Vercel AI Gateway by default; any
// OpenAI-compatible service with a priced /models list works.
export function upstream() {
  const baseUrl = (process.env.UPSTREAM_BASE_URL ?? "https://ai-gateway.vercel.sh/v1").replace(/\/$/, "");
  return { baseUrl, apiKey: process.env.UPSTREAM_API_KEY, isOpenRouter: baseUrl.includes("openrouter.ai") };
}

// The usage block of an OpenAI-style response.
export type ProviderUsage =
  | {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
      cost?: number; // OpenRouter reports the exact price; Vercel does not
    }
  | undefined;

// Turns what the provider reported into a charge on the caller's balance.
export function settle(
  caller: Caller,
  model: string,
  price: ModelPrice,
  usage: ProviderUsage,
  text: { input: string; output: string },
) {
  return settleTokens(
    caller,
    model,
    price,
    {
      inputTokens: usage?.prompt_tokens ?? estimateTokens(text.input),
      outputTokens: usage?.completion_tokens ?? estimateTokens(text.output),
      cacheReadTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
      cacheWriteTokens: usage?.prompt_tokens_details?.cache_write_tokens ?? 0,
    },
    typeof usage?.cost === "number" ? usage.cost : undefined,
  );
}

// The charge itself, from token counts in our own shape. `usd` overrides the
// price list when the provider reported the exact cost.
export function settleTokens(caller: Caller, model: string, price: ModelPrice, tokens: TokenUsage, usd?: number) {
  const credits = creditsForUsd(usd ?? usdFor(price, tokens));
  const balance = recordUsage({
    ...caller,
    model,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    credits,
  });
  return { credits, balance };
}

export const chargeHeaders = (charge: { credits: number; balance: number }) => ({
  "x-kredit-credits-charged": String(charge.credits),
  "x-kredit-balance": String(charge.balance),
});
