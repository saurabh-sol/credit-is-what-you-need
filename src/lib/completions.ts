import { estimateInputTokens, heldFor, hold, planSpend } from "./budget.ts";
import { catalog, priceFor, typeFor } from "./catalog.ts";
import {
  apiError,
  chargeHeaders,
  ECHO_MODEL,
  LEGACY_ECHO_MODEL,
  type ProviderUsage,
  settle,
  upstream,
  type Caller,
} from "./gateway.ts";
import { getBalance } from "./ledger.ts";
import { ECHO_PRICE, type ModelPrice } from "./pricing.ts";

// One chat completion for a caller who has already been identified: by API key
// on /v1, or by their signed-in session in the playground.

type ChatBody = {
  model: string;
  messages: { role: string; content: unknown }[];
  stream?: boolean;
  stream_options?: Record<string, unknown>;
  max_tokens?: unknown;
  max_completion_tokens?: unknown;
};

// Request fields that would let a caller change what they are billed for:
// provider routing, fallbacks and bring-your-own-key are the server's business.
const SERVER_ONLY_FIELDS = ["provider", "providerOptions", "provider_options", "models", "route", "byok"];

const textOf = (content: unknown) => (typeof content === "string" ? content : JSON.stringify(content ?? ""));
const promptText = (body: ChatBody) => body.messages.map((message) => textOf(message.content)).join("\n");

export async function complete(caller: Caller, request: Request) {
  if (getBalance(caller.address) <= 0) {
    return apiError(402, "You are out of credits. Earn more on your Kredit dashboard.", "insufficient_credits");
  }

  const body = (await request.json().catch(() => null)) as ChatBody | null;
  if (!body || typeof body.model !== "string" || !Array.isArray(body.messages) || body.messages.length === 0) {
    return apiError(400, "Send a JSON body with `model` and a non-empty `messages` array.", "invalid_body");
  }

  // The legacy id is answered by the same model and recorded under the new id.
  if (body.model === ECHO_MODEL || body.model === LEGACY_ECHO_MODEL) return echo(caller, body);

  const { baseUrl, apiKey, isOpenRouter } = upstream();
  if (!apiKey) {
    return apiError(
      503,
      `No AI provider is configured on this server yet. Use the model "${ECHO_MODEL}" to test your key.`,
      "provider_not_configured",
    );
  }

  // A model is only offered when its price is known, so nothing is billed by guesswork.
  const type = await typeFor(body.model);
  if (type && type !== "language") {
    return apiError(400, `"${body.model}" is not a chat model.`, "model_not_supported");
  }
  const price = await priceFor(body.model);
  if (!price) {
    if (!(await catalog()).live) {
      return apiError(502, "The AI provider's model list could not be read. Try again in a moment.", "provider_unreachable");
    }
    return apiError(404, `Unknown model "${body.model}". GET /v1/models lists the ones you can use.`, "model_not_found");
  }

  // Keep the call within the balance: shorten the answer if a longer one could
  // not be paid for, and hold the worst case so parallel calls can't overspend.
  const usesCompletionTokens = body.max_completion_tokens !== undefined;
  const requested = Number(usesCompletionTokens ? body.max_completion_tokens : body.max_tokens);
  const held = heldFor(caller.address);
  const plan = planSpend({
    available: getBalance(caller.address) - held,
    inputTokens: estimateInputTokens(body.messages),
    requestedMaxTokens: Number.isInteger(requested) && requested > 0 ? requested : undefined,
    price,
  });
  if (!plan.ok) {
    const running = held > 0 ? " while your other calls are still running" : "";
    return apiError(
      402,
      `This call needs about ${plan.needed} credits, more than your balance covers${running}. Shorten the prompt, pick a cheaper model, or earn more on your Kredit dashboard.`,
      "insufficient_credits",
    );
  }
  const release = hold(caller.address, plan.hold);

  // Ask the provider to report usage (and cost, where supported) so the charge is exact.
  const payload: Record<string, unknown> = {
    ...body,
    ...(plan.maxTokens !== null && { [usesCompletionTokens ? "max_completion_tokens" : "max_tokens"]: plan.maxTokens }),
    ...(isOpenRouter && { usage: { include: true } }),
    ...(body.stream && { stream_options: { ...body.stream_options, include_usage: true } }),
  };
  for (const field of SERVER_ONLY_FIELDS) delete payload[field];

  let streaming = false; // a stream gives its hold back itself, once it has been charged
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: request.signal,
      });
    } catch {
      return apiError(502, "The AI provider could not be reached. You were not charged.", "provider_unreachable");
    }

    if (!response.ok || !response.body) {
      // Provider errors are passed through untouched and cost nothing.
      return new Response(response.body, {
        status: response.status,
        headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
      });
    }

    if (body.stream) {
      streaming = true;
      return streamThrough(response.body, caller, body, price, release);
    }

    const data = await response.json();
    const output = textOf(data.choices?.[0]?.message?.content);
    const charge = settle(caller, body.model, price, data.usage, { input: promptText(body), output });
    return Response.json(data, { headers: chargeHeaders(charge) });
  } finally {
    if (!streaming) release();
  }
}

// The last event of a streamed answer: the charge, in the chunk shape so
// OpenAI clients read past it (they already accept usage chunks with no choices).
const chargeEvent = (body: ChatBody, charge: { credits: number; balance: number }) =>
  `data: ${JSON.stringify({
    id: `kredit-charge-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    choices: [],
    kredit: { credits_charged: charge.credits, balance: charge.balance },
  })}\n\n`;

// Passes the provider's stream straight to the client while watching it for
// the usage report, then charges once the stream ends or the client leaves.
function streamThrough(
  source: ReadableStream<Uint8Array>,
  caller: Caller,
  body: ChatBody,
  price: ModelPrice,
  release: () => void,
) {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  let output = "";
  let usage: ProviderUsage;
  let settled = false;

  // Everything up to (not including) the provider's [DONE], so the charge can go in front of it.
  const watch = (chunk: Uint8Array) => {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    let passthrough = "";
    for (const line of lines) {
      if (line.startsWith("data: [DONE]")) continue;
      passthrough += line + "\n";
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.usage) usage = event.usage;
        output += event.choices?.[0]?.delta?.content ?? "";
      } catch {
        // not JSON (a keep-alive comment, for example)
      }
    }
    return passthrough;
  };
  const finish = () => {
    if (settled) return null;
    settled = true;
    try {
      return settle(caller, body.model, price, usage, { input: promptText(body), output });
    } finally {
      release();
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        const charge = finish();
        controller.enqueue(encoder.encode(`${pending}${charge ? chargeEvent(body, charge) : ""}data: [DONE]\n\n`));
        controller.close();
        return;
      }
      const forward = watch(value);
      if (forward) controller.enqueue(encoder.encode(forward));
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}

function echo(caller: Caller, body: ChatBody) {
  const lastUser = [...body.messages].reverse().find((message) => message.role === "user");
  const reply = `Kredit echo: ${textOf(lastUser?.content)}`;
  // Echo costs us nothing, but it is billed by length like a mid-priced model,
  // so a key can be tested against realistic charges.
  const charge = settle(caller, ECHO_MODEL, ECHO_PRICE, undefined, { input: promptText(body), output: reply });

  const base = { id: `kredit-echo-${Date.now()}`, created: Math.floor(Date.now() / 1000), model: ECHO_MODEL };
  if (!body.stream) {
    return Response.json(
      {
        ...base,
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
      },
      { headers: chargeHeaders(charge) },
    );
  }

  const chunk = (delta: object, finish_reason: string | null) =>
    `data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
  const events =
    chunk({ role: "assistant", content: reply }, null) + chunk({}, "stop") + chargeEvent(body, charge) + "data: [DONE]\n\n";
  return new Response(events, { headers: { "content-type": "text/event-stream", ...chargeHeaders(charge) } });
}
