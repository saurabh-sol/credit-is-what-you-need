import { settings } from "./config.js";

// One thin client over the /v1 API. Errors carry the code the server sent,
// so a command can turn it into advice.

export class ApiError extends Error {
  constructor(status, message, code, requestId) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

// What to do about each error, in one line.
export function adviceFor(error, baseUrl) {
  switch (error.code) {
    case "invalid_api_key":
      return "Run `kredit login` with a key from your dashboard.";
    case "insufficient_credits":
      return `Earn credits at ${baseUrl}/dashboard/earn or buy some at ${baseUrl}/dashboard/credits.`;
    case "model_not_found":
      return "Run `kredit models <search>` to find the id.";
    case "model_not_supported":
      return "This model is a different kind; `kredit models <id>` shows which command it takes.";
    case "rate_limit_exceeded":
      return "Wait a moment; each key gets 60 requests a minute.";
    case "provider_unreachable":
    case "provider_not_configured":
      return "The server's AI provider is not answering; try again shortly.";
    case "not_signed_in":
      return "Run `kredit login` first.";
    default:
      return undefined;
  }
}

export function client(overrides = {}) {
  const { baseUrl, key } = settings(overrides);
  const headers = (extra = {}) => ({
    ...(key.value && { authorization: `Bearer ${key.value}` }),
    "content-type": "application/json",
    "user-agent": "kredit-cli",
    ...extra,
  });

  async function parse(response) {
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: { message: text.slice(0, 200) || response.statusText } };
    }
    if (!response.ok) {
      const error = data.error ?? data;
      throw new ApiError(response.status, error.message ?? `HTTP ${response.status}`, error.code ?? error.error_type, response.headers.get("x-request-id"));
    }
    return { data, charged: Number(response.headers.get("x-kredit-credits-charged")) || 0, balance: Number(response.headers.get("x-kredit-balance")) };
  }

  const get = async (path, signal) => parse(await fetch(`${baseUrl.value}${path}`, { headers: headers(), signal }));
  const post = async (path, body, signal) => parse(await fetch(`${baseUrl.value}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal }));

  // A streamed chat completion: yields text pieces, then returns the charge.
  async function* stream(path, body, signal) {
    const response = await fetch(`${baseUrl.value}${path}`, { method: "POST", headers: headers(), body: JSON.stringify({ ...body, stream: true }), signal });
    if (!response.ok || !response.body) await parse(response);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let charge;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        let chunk;
        try {
          chunk = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (chunk.kredit) charge = chunk.kredit;
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) yield { text: delta.content };
        else if (delta?.reasoning || delta?.reasoning_content) yield { reasoning: delta.reasoning ?? delta.reasoning_content };
      }
    }
    return charge;
  }

  return { baseUrl: baseUrl.value, hasKey: Boolean(key.value), keyFrom: key.from, get, post, stream };
}
