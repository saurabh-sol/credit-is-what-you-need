import { findKey, recordUsage } from "./ledger.ts";
import { creditsFor, estimateTokens } from "./pricing.ts";

// A built-in model that repeats your message. It lets anyone test a key
// end-to-end before a real AI provider is configured.
export const ECHO_MODEL = "fuel/echo";

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
    return apiError(401, "Invalid or revoked API key. Create one on your Fuel dashboard.", "invalid_api_key");
  }

  const now = Date.now();
  const recent = (recentRequests.get(key.id) ?? []).filter((time) => time > now - RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    return apiError(429, `Rate limit reached: ${RATE_LIMIT} requests per minute per key.`, "rate_limit_exceeded");
  }
  recentRequests.set(key.id, [...recent, now]);

  return { keyId: key.id, address: key.address };
}

export function upstream() {
  const baseUrl = (process.env.UPSTREAM_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  return { baseUrl, apiKey: process.env.UPSTREAM_API_KEY, isOpenRouter: baseUrl.includes("openrouter.ai") };
}

type ProviderUsage = { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined;

// Turns what the provider reported into a charge on the caller's balance.
export function settle(caller: Caller, model: string, usage: ProviderUsage, text: { input: string; output: string }) {
  const inputTokens = usage?.prompt_tokens ?? estimateTokens(text.input);
  const outputTokens = usage?.completion_tokens ?? estimateTokens(text.output);
  const costUsd = typeof usage?.cost === "number" ? usage.cost : undefined;
  const credits = creditsFor({ inputTokens, outputTokens, costUsd });
  const balance = recordUsage({ ...caller, model, inputTokens, outputTokens, credits });
  return { credits, balance };
}

export const chargeHeaders = (charge: { credits: number; balance: number }) => ({
  "x-fuel-credits-charged": String(charge.credits),
  "x-fuel-balance": String(charge.balance),
});
