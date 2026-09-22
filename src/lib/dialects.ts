import { estimateInputTokens } from "./budget.ts";
import { estimateTokens, type TokenUsage } from "./pricing.ts";

// The API speaks three dialects, all billed the same way: OpenAI Chat
// Completions, OpenAI Responses and Anthropic Messages. A dialect says how to
// read a request, where usage sits in the answer, and how its stream is shaped.

export type Parsed = {
  model: string;
  stream: boolean;
  inputTokens: number; // estimate, for the spend guard
  requestedMaxTokens?: number;
  maxTokensField: string; // where to write a shortened answer limit
};

export type StreamEvent = { usage?: Partial<TokenUsage>; text?: string };

export type Dialect = {
  path: string; // on the provider, under its base URL
  parse(body: Record<string, unknown>): Parsed | string; // a string is the reason it is invalid
  error(status: number, message: string, code: string): Response;
  usageOf(data: Record<string, unknown>): TokenUsage | null; // from a whole (non-streamed) answer
  textOf(data: Record<string, unknown>): string;
  // Each `data:` payload of the stream. Usage may arrive in pieces (Anthropic
  // sends input tokens at the start and output tokens at the end).
  onEvent(event: Record<string, unknown>): StreamEvent;
  // The stream's closing line, if the dialect has one, so the charge can go before it.
  terminator?: string;
  chargeEvent?(model: string, charge: { credits: number; balance: number }): string;
};

const positiveInt = (value: unknown) => (Number.isInteger(value) && (value as number) > 0 ? (value as number) : undefined);
const num = (value: unknown) => (typeof value === "number" ? value : 0);

// --- OpenAI Chat Completions ---------------------------------------------------

export const chat: Dialect = {
  path: "/chat/completions",
  parse(body) {
    if (typeof body.model !== "string" || !Array.isArray(body.messages) || body.messages.length === 0) {
      return "Send a JSON body with `model` and a non-empty `messages` array.";
    }
    const usesCompletionTokens = body.max_completion_tokens !== undefined;
    return {
      model: body.model,
      stream: body.stream === true,
      inputTokens: estimateInputTokens(body.messages),
      requestedMaxTokens: positiveInt(usesCompletionTokens ? body.max_completion_tokens : body.max_tokens),
      maxTokensField: usesCompletionTokens ? "max_completion_tokens" : "max_tokens",
    };
  },
  error: (status, message, code) =>
    Response.json({ error: { message, type: status >= 500 ? "server_error" : "invalid_request_error", code } }, { status }),
  usageOf(data) {
    const usage = data.usage as Record<string, unknown> | undefined;
    if (!usage || typeof usage.prompt_tokens !== "number") return null;
    const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
    return {
      inputTokens: usage.prompt_tokens,
      outputTokens: num(usage.completion_tokens),
      cacheReadTokens: num(details?.cached_tokens),
      cacheWriteTokens: num(details?.cache_write_tokens),
    };
  },
  textOf(data) {
    const content = (data.choices as { message?: { content?: unknown } }[] | undefined)?.[0]?.message?.content;
    return typeof content === "string" ? content : JSON.stringify(content ?? "");
  },
  onEvent(event) {
    const usage = event.usage ? chat.usageOf(event) : null;
    const delta = (event.choices as { delta?: { content?: unknown } }[] | undefined)?.[0]?.delta?.content;
    return { ...(usage && { usage }), ...(typeof delta === "string" && { text: delta }) };
  },
  terminator: "data: [DONE]",
  // In the chunk shape, so OpenAI clients read past it: they already accept usage chunks with no choices.
  chargeEvent: (model, charge) =>
    `data: ${JSON.stringify({
      id: `kredit-charge-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [],
      kredit: { credits_charged: charge.credits, balance: charge.balance },
    })}\n\n`,
};

// --- OpenAI Responses ------------------------------------------------------------

const responsesInputTokens = (input: unknown, instructions: unknown) => {
  const items = Array.isArray(input) ? input : [{ content: input }];
  return estimateInputTokens(items) + (typeof instructions === "string" ? estimateTokens(instructions) : 0);
};

export const responses: Dialect = {
  path: "/responses",
  parse(body) {
    if (typeof body.model !== "string" || body.input === undefined) {
      return "Send a JSON body with `model` and `input` (a string or an array of items).";
    }
    return {
      model: body.model,
      stream: body.stream === true,
      inputTokens: responsesInputTokens(body.input, body.instructions),
      requestedMaxTokens: positiveInt(body.max_output_tokens),
      maxTokensField: "max_output_tokens",
    };
  },
  error: chat.error,
  usageOf(data) {
    const usage = data.usage as Record<string, unknown> | undefined;
    if (!usage || typeof usage.input_tokens !== "number") return null;
    const details = usage.input_tokens_details as Record<string, unknown> | undefined;
    return {
      inputTokens: usage.input_tokens,
      outputTokens: num(usage.output_tokens),
      cacheReadTokens: num(details?.cached_tokens),
    };
  },
  textOf(data) {
    if (typeof data.output_text === "string") return data.output_text;
    const output = (data.output as { content?: { text?: unknown }[] }[] | undefined) ?? [];
    return output.flatMap((item) => item.content ?? []).map((part) => (typeof part.text === "string" ? part.text : "")).join("");
  },
  onEvent(event) {
    if (event.type === "response.completed" || event.type === "response.incomplete") {
      const usage = responses.usageOf((event.response as Record<string, unknown>) ?? {});
      return usage ? { usage } : {};
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") return { text: event.delta };
    return {};
  },
};

// --- Anthropic Messages ----------------------------------------------------------

export const messages: Dialect = {
  path: "/messages",
  parse(body) {
    if (typeof body.model !== "string" || !Array.isArray(body.messages) || body.messages.length === 0) {
      return "Send a JSON body with `model`, `max_tokens` and a non-empty `messages` array.";
    }
    if (positiveInt(body.max_tokens) === undefined) return "`max_tokens` is required and must be a positive integer.";
    const system = Array.isArray(body.system) ? estimateInputTokens(body.system.map((part) => ({ content: part }))) : 0;
    return {
      model: body.model,
      stream: body.stream === true,
      inputTokens: estimateInputTokens(body.messages) + (typeof body.system === "string" ? estimateTokens(body.system) : system),
      requestedMaxTokens: positiveInt(body.max_tokens),
      maxTokensField: "max_tokens",
    };
  },
  error: (status, message, code) => {
    const type = { 400: "invalid_request_error", 401: "authentication_error", 402: "billing_error", 404: "not_found_error", 429: "rate_limit_error" }[status] ?? "api_error";
    return Response.json({ type: "error", error: { type, message, code } }, { status });
  },
  usageOf(data) {
    const usage = data.usage as Record<string, unknown> | undefined;
    if (!usage || typeof usage.input_tokens !== "number") return null;
    // Anthropic counts cached tokens apart from input_tokens; ours are the whole prompt.
    const cacheRead = num(usage.cache_read_input_tokens);
    const cacheWrite = num(usage.cache_creation_input_tokens);
    return {
      inputTokens: usage.input_tokens + cacheRead + cacheWrite,
      outputTokens: num(usage.output_tokens),
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
    };
  },
  textOf(data) {
    const content = (data.content as { type?: string; text?: unknown }[] | undefined) ?? [];
    return content.map((part) => (typeof part.text === "string" ? part.text : "")).join("");
  },
  onEvent(event) {
    if (event.type === "message_start") {
      const usage = messages.usageOf((event.message as Record<string, unknown>) ?? {});
      return usage ? { usage: { ...usage, outputTokens: 0 } } : {};
    }
    if (event.type === "message_delta") {
      const usage = event.usage as Record<string, unknown> | undefined;
      return typeof usage?.output_tokens === "number" ? { usage: { outputTokens: usage.output_tokens } } : {};
    }
    if (event.type === "content_block_delta") {
      const text = (event.delta as { text?: unknown } | undefined)?.text;
      return typeof text === "string" ? { text } : {};
    }
    return {};
  },
};
