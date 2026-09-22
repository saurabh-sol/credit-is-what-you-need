import { heldFor, hold, planSpend } from "./budget.ts";
import { catalog, priceFor, typeFor, upstreamFor } from "./catalog.ts";
import type { Dialect } from "./dialects.ts";
import { chargeHeaders, ECHO_MODEL, settleTokens, upstreams, type Caller } from "./gateway.ts";
import { getBalance } from "./ledger.ts";
import { estimateTokens, type TokenUsage } from "./pricing.ts";

// One model call, in any dialect, for a caller who has already been identified.
// The same steps every time: check the model is priced, keep the call within
// the balance, hold the worst case, send it on, charge what was really used.

// Request fields that would let a caller change what they are billed for:
// provider routing, fallbacks and bring-your-own-key are the server's business.
const SERVER_ONLY_FIELDS = ["provider", "providerOptions", "provider_options", "models", "route", "byok"];

export async function proxyCall(caller: Caller, request: Request, body: Record<string, unknown>, dialect: Dialect) {
  const { error } = dialect;
  if (getBalance(caller.address) <= 0) {
    return error(402, "You are out of credits. Earn more on your Kredit dashboard.", "insufficient_credits");
  }
  const parsed = dialect.parse(body);
  if (typeof parsed === "string") return error(400, parsed, "invalid_body");

  if (upstreams().length === 0) {
    return error(
      503,
      `No AI provider is configured on this server yet. Use the model "${ECHO_MODEL}" on /v1/chat/completions to test your key.`,
      "provider_not_configured",
    );
  }

  // A model is only offered when its price is known, so nothing is billed by guesswork.
  const type = await typeFor(parsed.model);
  if (type && type !== "language") return error(400, `"${parsed.model}" is not a chat model.`, "model_not_supported");
  const price = await priceFor(parsed.model);
  const { baseUrl, apiKey, isOpenRouter } = await upstreamFor(parsed.model);
  if (!price) {
    if (!(await catalog()).live) {
      return error(502, "The AI provider's model list could not be read. Try again in a moment.", "provider_unreachable");
    }
    return error(404, `Unknown model "${parsed.model}". GET /v1/models lists the ones you can use.`, "model_not_found");
  }

  // Keep the call within the balance: shorten the answer if a longer one could
  // not be paid for, and hold the worst case so parallel calls can't overspend.
  const held = heldFor(caller.address);
  const plan = planSpend({
    available: getBalance(caller.address) - held,
    inputTokens: parsed.inputTokens,
    requestedMaxTokens: parsed.requestedMaxTokens,
    price,
  });
  if (!plan.ok) {
    const running = held > 0 ? " while your other calls are still running" : "";
    return error(
      402,
      `This call needs about ${plan.needed} credits, more than your balance covers${running}. Shorten the prompt, pick a cheaper model, or earn more on your Kredit dashboard.`,
      "insufficient_credits",
    );
  }
  const release = hold(caller.address, plan.hold);

  // Ask the provider to report usage (and cost, where supported) so the charge is exact.
  const payload: Record<string, unknown> = {
    ...body,
    ...(plan.maxTokens !== null && { [parsed.maxTokensField]: plan.maxTokens }),
    ...(isOpenRouter && { usage: { include: true } }),
    ...(parsed.stream &&
      dialect.path === "/chat/completions" && {
        stream_options: { ...(body.stream_options as object | undefined), include_usage: true },
      }),
  };
  for (const field of SERVER_ONLY_FIELDS) delete payload[field];

  const charge = (tokens: Partial<TokenUsage>, outputText: string, usd?: number) =>
    settleTokens(
      caller,
      parsed.model,
      price,
      {
        inputTokens: tokens.inputTokens ?? parsed.inputTokens,
        outputTokens: tokens.outputTokens ?? estimateTokens(outputText),
        cacheReadTokens: tokens.cacheReadTokens ?? 0,
        cacheWriteTokens: tokens.cacheWriteTokens ?? 0,
      },
      usd,
    );

  let streaming = false; // a stream gives its hold back itself, once it has been charged
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${dialect.path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(dialect.path === "/messages" && { "anthropic-version": request.headers.get("anthropic-version") ?? "2023-06-01" }),
        },
        body: JSON.stringify(payload),
        signal: request.signal,
      });
    } catch {
      return error(502, "The AI provider could not be reached. You were not charged.", "provider_unreachable");
    }

    if (!response.ok || !response.body) {
      // Provider errors are passed through untouched and cost nothing.
      return new Response(response.body, {
        status: response.status,
        headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
      });
    }

    if (parsed.stream) {
      streaming = true;
      return streamThrough(response.body, dialect, parsed.model, charge, release);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const usage = dialect.usageOf(data);
    const cost = (data.usage as { cost?: unknown } | undefined)?.cost; // OpenRouter reports the exact price
    const charged = charge(usage ?? {}, usage ? "" : dialect.textOf(data), typeof cost === "number" ? cost : undefined);
    return Response.json(data, { headers: chargeHeaders(charged) });
  } finally {
    if (!streaming) release();
  }
}

// Passes the provider's stream straight to the client while watching it for
// the usage report, then charges once the stream ends or the client leaves.
function streamThrough(
  source: ReadableStream<Uint8Array>,
  dialect: Dialect,
  model: string,
  charge: (tokens: Partial<TokenUsage>, outputText: string) => { credits: number; balance: number },
  release: () => void,
) {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  let output = "";
  let usage: Partial<TokenUsage> = {};
  let sawUsage = false;
  let settled = false;

  // Everything except the dialect's closing line, so the charge can go in front of it.
  const watch = (chunk: Uint8Array) => {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    let passthrough = "";
    for (const line of lines) {
      if (dialect.terminator && line.startsWith(dialect.terminator)) continue;
      passthrough += line + "\n";
      if (!line.startsWith("data: ")) continue;
      try {
        const event = dialect.onEvent(JSON.parse(line.slice(6)));
        if (event.usage) {
          usage = { ...usage, ...event.usage };
          sawUsage = true;
        }
        if (event.text) output += event.text;
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
      return charge(sawUsage ? usage : {}, output);
    } finally {
      release();
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        const charged = finish();
        const tail = charged && dialect.chargeEvent ? dialect.chargeEvent(model, charged) : "";
        const closing = dialect.terminator ? `${dialect.terminator}\n\n` : "";
        controller.enqueue(encoder.encode(`${pending}${tail}${closing}`));
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
