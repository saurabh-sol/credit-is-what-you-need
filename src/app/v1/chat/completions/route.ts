import { apiError, authenticate, chargeHeaders, ECHO_MODEL, settle, upstream, type Caller } from "@/lib/gateway";
import { getBalance } from "@/lib/ledger";

type ChatBody = {
  model: string;
  messages: { role: string; content: unknown }[];
  stream?: boolean;
  stream_options?: Record<string, unknown>;
};

const textOf = (content: unknown) => (typeof content === "string" ? content : JSON.stringify(content ?? ""));
const promptText = (body: ChatBody) => body.messages.map((message) => textOf(message.content)).join("\n");

export async function POST(request: Request) {
  const caller = authenticate(request);
  if (caller instanceof Response) return caller;

  if (getBalance(caller.address) <= 0) {
    return apiError(402, "You are out of credits. Earn more on your Fuel dashboard.", "insufficient_credits");
  }

  const body = (await request.json().catch(() => null)) as ChatBody | null;
  if (!body || typeof body.model !== "string" || !Array.isArray(body.messages) || body.messages.length === 0) {
    return apiError(400, "Send a JSON body with `model` and a non-empty `messages` array.", "invalid_body");
  }

  if (body.model === ECHO_MODEL) return echo(caller, body);

  const { baseUrl, apiKey, isOpenRouter } = upstream();
  if (!apiKey) {
    return apiError(
      503,
      `No AI provider is configured on this server yet. Use the model "${ECHO_MODEL}" to test your key.`,
      "provider_not_configured",
    );
  }

  // Ask the provider to report usage (and cost, where supported) so the charge is exact.
  const payload = {
    ...body,
    ...(isOpenRouter && { usage: { include: true } }),
    ...(body.stream && { stream_options: { ...body.stream_options, include_usage: true } }),
  };

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

  if (body.stream) return streamThrough(response.body, caller, body);

  const data = await response.json();
  const output = textOf(data.choices?.[0]?.message?.content);
  const charge = settle(caller, body.model, data.usage, { input: promptText(body), output });
  return Response.json(data, { headers: chargeHeaders(charge) });
}

// Passes the provider's stream straight to the client while watching it for
// the usage report, then charges once the stream ends or the client leaves.
function streamThrough(source: ReadableStream<Uint8Array>, caller: Caller, body: ChatBody) {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let output = "";
  let usage: Parameters<typeof settle>[2];
  let settled = false;

  const watch = (chunk: Uint8Array) => {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line.startsWith("data: [DONE]")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.usage) usage = event.usage;
        output += event.choices?.[0]?.delta?.content ?? "";
      } catch {
        // not JSON (a keep-alive comment, for example)
      }
    }
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    settle(caller, body.model, usage, { input: promptText(body), output });
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        finish();
        controller.close();
        return;
      }
      watch(value);
      controller.enqueue(value);
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
  const reply = `Fuel echo: ${textOf(lastUser?.content)}`;
  const charge = settle(caller, ECHO_MODEL, { cost: 0 }, { input: promptText(body), output: reply });

  const base = { id: `fuel-echo-${Date.now()}`, created: Math.floor(Date.now() / 1000), model: ECHO_MODEL };
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
  const events = chunk({ role: "assistant", content: reply }, null) + chunk({}, "stop") + "data: [DONE]\n\n";
  return new Response(events, { headers: { "content-type": "text/event-stream", ...chargeHeaders(charge) } });
}
