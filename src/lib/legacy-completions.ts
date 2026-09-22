// OpenAI's original text-completion endpoint, still used by older tools and
// some autocomplete plugins. The prompt becomes one user message on the chat
// path (so billing and the spend guard are the same), and the chat answer is
// reshaped into a `text_completion`.

type Rec = Record<string, unknown>;

const rec = (value: unknown): Rec | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;

// Fields with no chat equivalent. `n` and `stop` mean the same in chat and stay.
const TEXT_ONLY = new Set(["prompt", "suffix", "echo", "logprobs", "best_of"]);

export function chatBodyFromPrompt(body: Rec): Rec | string {
  const prompt = Array.isArray(body.prompt) ? body.prompt.map(String).join("\n") : body.prompt;
  if (typeof body.model !== "string" || typeof prompt !== "string" || !prompt) {
    return "Send a JSON body with `model` and a non-empty `prompt`.";
  }
  const rest = Object.fromEntries(Object.entries(body).filter(([key]) => !TEXT_ONLY.has(key)));
  return { ...rest, messages: [{ role: "user", content: prompt }] };
}

// A chat completion (whole, or one streamed chunk) in the text-completion shape.
export function asTextCompletion(data: Rec, streamed = false): Rec {
  if (!Array.isArray(data.choices)) return data;
  const choices = data.choices.map((entry, index) => {
    const choice = rec(entry) ?? {};
    const source = rec(streamed ? choice.delta : choice.message);
    return {
      index: typeof choice.index === "number" ? choice.index : index,
      text: typeof source?.content === "string" ? source.content : "",
      logprobs: null,
      finish_reason: choice.finish_reason ?? null,
    };
  });
  return { ...data, object: "text_completion", choices };
}

// Rewrites each `data:` line of a chat stream; other lines pass untouched.
export function textCompletionStream() {
  let pending = "";
  const mapLine = (line: string) => {
    if (!line.startsWith("data: ") || line.startsWith("data: [DONE]")) return line;
    try {
      return `data: ${JSON.stringify(asTextCompletion(JSON.parse(line.slice(6)), true))}`;
    } catch {
      return line;
    }
  };
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) controller.enqueue(`${mapLine(line)}\n`);
    },
    flush(controller) {
      if (pending) controller.enqueue(`${mapLine(pending)}\n`);
    },
  });
}

// The chat path's response, reshaped. Errors go through as they are.
export async function toTextCompletion(response: Response) {
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !response.body) return response;
  if (type.includes("text/event-stream")) {
    const body = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(textCompletionStream()).pipeThrough(new TextEncoderStream());
    return new Response(body, { status: response.status, headers: response.headers });
  }
  if (type.includes("application/json")) {
    const data = (await response.json()) as Rec;
    return Response.json(asTextCompletion(data), { status: response.status, headers: response.headers });
  }
  return response;
}
