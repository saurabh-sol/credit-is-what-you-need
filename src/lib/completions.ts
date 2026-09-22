import { chat } from "./dialects.ts";
import { apiError, chargeHeaders, ECHO_MODEL, LEGACY_ECHO_MODEL, settle, type Caller } from "./gateway.ts";
import { getBalance } from "./ledger.ts";
import { ECHO_PRICE } from "./pricing.ts";
import { proxyCall } from "./proxy.ts";

// One chat completion for a caller who has already been identified: by API key
// on /v1, or by their signed-in session in the playground.

type ChatBody = {
  model: string;
  messages: { role: string; content: unknown }[];
  stream?: boolean;
};

const textOf = (content: unknown) => (typeof content === "string" ? content : JSON.stringify(content ?? ""));
const promptText = (body: ChatBody) => body.messages.map((message) => textOf(message.content)).join("\n");

export async function complete(caller: Caller, request: Request) {
  if (getBalance(caller.address) <= 0) {
    return apiError(402, "You are out of credits. Earn more on your Kredit dashboard.", "insufficient_credits");
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError(400, "Send a JSON body with `model` and a non-empty `messages` array.", "invalid_body");

  // The legacy id is answered by the same model and recorded under the new id.
  if ((body.model === ECHO_MODEL || body.model === LEGACY_ECHO_MODEL) && Array.isArray(body.messages) && body.messages.length > 0) {
    return echo(caller, body as unknown as ChatBody);
  }
  return proxyCall(caller, request, body, chat);
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
    chunk({ role: "assistant", content: reply }, null) + chunk({}, "stop") + chat.chargeEvent!(ECHO_MODEL, charge) + "data: [DONE]\n\n";
  return new Response(events, { headers: { "content-type": "text/event-stream", ...chargeHeaders(charge) } });
}
