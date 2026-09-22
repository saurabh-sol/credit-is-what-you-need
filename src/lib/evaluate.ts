import { catalog, priceFor, typeFor } from "./catalog.ts";
import { apiError, ECHO_MODEL, settleTokens, upstream, type Caller } from "./gateway.ts";
import { getBalance } from "./ledger.ts";
import { creditsFor, estimateTokens } from "./pricing.ts";

// Evaluation models (TypeSafe AI's Jev) are not chat models: they read some
// state and answer typed questions with probabilities, choices and scores.
// Vercel AI Gateway serves them on its own endpoint, in TypeSafe's shape,
// which is passed through here and billed on the tokens it reports.

export type EvaluationBody = { model: string; state: unknown; questions: Record<string, unknown> } & Record<string, unknown>;

// TypeSafe's request, checked just enough to price it.
export function parseEvaluation(body: unknown): EvaluationBody | string {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b.model !== "string") return "Send a JSON body with `model`, `state` and `questions`.";
  if (b.state === undefined || b.state === null || b.state === "") return "`state` is what the model looks at; it cannot be empty.";
  if (!b.questions || typeof b.questions !== "object" || Array.isArray(b.questions) || Object.keys(b.questions).length === 0) {
    return "`questions` is an object of named questions, each with a `type` (noul, choice or score) and `instructions`.";
  }
  return b as EvaluationBody;
}

// Runs one evaluation and charges for it. Errors come back as a Response.
export async function evaluate(caller: Caller, body: EvaluationBody, signal?: AbortSignal, error = apiError) {
  if ((await getBalance(caller.address)) <= 0) {
    return error(402, "You are out of credits. Earn more on your Kredit dashboard.", "insufficient_credits");
  }
  const { baseUrl, apiKey } = upstream();
  if (!apiKey) {
    return error(503, `No AI provider is configured on this server yet. Use "${ECHO_MODEL}" on /v1/chat/completions to test your key.`, "provider_not_configured");
  }
  if (!baseUrl.includes("ai-gateway.vercel.sh")) {
    return error(503, "Evaluation models need Vercel AI Gateway as the provider.", "provider_not_configured");
  }

  const type = await typeFor(body.model);
  if (type && type !== "evaluation") return error(400, `"${body.model}" is not an evaluation model.`, "model_not_supported");
  const price = await priceFor(body.model);
  if (!price) {
    if (!(await catalog()).live) return error(502, "The AI provider's model list could not be read. Try again in a moment.", "provider_unreachable");
    return error(404, `Unknown model "${body.model}". GET /v1/models lists the ones you can use.`, "model_not_found");
  }

  // The answers are tiny and priced at zero, so the worst case is the input alone.
  const inputTokens = estimateTokens(JSON.stringify({ state: body.state, questions: body.questions }));
  const needed = creditsFor(price, { inputTokens, outputTokens: 0 });
  if ((await getBalance(caller.address)) < needed) {
    return error(402, `This call needs about ${needed} credits, more than your balance covers.`, "insufficient_credits");
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/v1$/, "")}/typesafe/v1/systemone`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ ...body, provider: undefined, providerOptions: undefined }),
      signal,
    });
  } catch {
    return error(502, "The AI provider could not be reached. You were not charged.", "provider_unreachable");
  }
  if (!response.ok) {
    // Provider errors pass through untouched (TypeSafe's shape) and cost nothing.
    return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" } });
  }

  const data = (await response.json()) as {
    usage?: { input_tokens?: number; output_tokens?: number };
    provider_metadata?: { gateway?: { cost?: unknown } };
  } & Record<string, unknown>;
  const cost = Number(data.provider_metadata?.gateway?.cost); // the gateway reports the exact price
  const charge = await settleTokens(
    caller,
    body.model,
    price,
    { inputTokens: data.usage?.input_tokens ?? inputTokens, outputTokens: data.usage?.output_tokens ?? 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    Number.isFinite(cost) ? cost : undefined,
  );
  return { data, charge };
}
