import { catalog, priceFor, typeFor, upstreamFor } from "@/lib/catalog";
import { apiError, authenticate, chargeHeaders, preflight, settle, upstreams, v1 } from "@/lib/gateway";
import { getBalance } from "@/lib/ledger";
import { creditsFor, estimateTokens } from "@/lib/pricing";

// OpenAI's embeddings endpoint. Billed on input tokens only, so the worst case
// is known before the call and no hold is needed.
export const POST = v1(async (request) => {
  const caller = authenticate(request);
  if (caller instanceof Response) return caller;
  if (getBalance(caller.address) <= 0) {
    return apiError(402, "You are out of credits. Earn more on your Kredit dashboard.", "insufficient_credits");
  }

  const body = (await request.json().catch(() => null)) as { model?: unknown; input?: unknown } | null;
  if (!body || typeof body.model !== "string" || body.input === undefined) {
    return apiError(400, "Send a JSON body with `model` and `input` (a string or an array of strings).", "invalid_body");
  }
  if (upstreams().length === 0) return apiError(503, "No AI provider is configured on this server yet.", "provider_not_configured");

  const type = await typeFor(body.model);
  if (type && type !== "embedding") return apiError(400, `"${body.model}" is not an embedding model.`, "model_not_supported");
  const price = await priceFor(body.model);
  const { baseUrl, apiKey } = await upstreamFor(body.model);
  if (!price) {
    if (!(await catalog()).live) {
      return apiError(502, "The AI provider's model list could not be read. Try again in a moment.", "provider_unreachable");
    }
    return apiError(404, `Unknown model "${body.model}". GET /v1/models lists the ones you can use.`, "model_not_found");
  }

  const text = Array.isArray(body.input) ? body.input.map(String).join("\n") : String(body.input);
  const needed = creditsFor(price, { inputTokens: estimateTokens(text), outputTokens: 0 });
  if (getBalance(caller.address) < needed) {
    return apiError(402, `This call needs about ${needed} credits, more than your balance covers.`, "insufficient_credits");
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ ...body, provider: undefined, providerOptions: undefined }),
      signal: request.signal,
    });
  } catch {
    return apiError(502, "The AI provider could not be reached. You were not charged.", "provider_unreachable");
  }
  if (!response.ok) {
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  }
  const data = await response.json();
  const charge = settle(caller, body.model, price, data.usage, { input: text, output: "" });
  return Response.json(data, { headers: chargeHeaders(charge) });
});

export const OPTIONS = preflight;
