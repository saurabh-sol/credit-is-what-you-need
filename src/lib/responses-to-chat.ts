// Some clients speak the Responses API to /chat/completions and read chat
// chunks back: Cursor does this for its agent mode on GPT-5 models. Such a body
// carries `input`, `instructions`, Responses-style tools and reasoning
// settings. This turns it into a Chat Completions body; the chat answer is
// already what the client expects.

type Rec = Record<string, unknown>;

const rec = (value: unknown): Rec | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;

export const isResponsesShaped = (body: Rec) => body.input !== undefined && body.messages === undefined;

// One piece of a message: text, an image or a file.
function part(value: unknown) {
  const item = rec(value);
  if (!item) return null;
  switch (item.type) {
    case "input_text":
    case "output_text":
    case "text":
      return typeof item.text === "string" ? { type: "text", text: item.text } : null;
    case "input_image":
      return typeof item.image_url === "string"
        ? { type: "image_url", image_url: { url: item.image_url, ...(typeof item.detail === "string" && { detail: item.detail }) } }
        : null;
    case "input_file":
      return typeof item.file_data === "string"
        ? { type: "file", file: { file_data: item.file_data, ...(typeof item.filename === "string" && { filename: item.filename }) } }
        : null;
    default:
      return null;
  }
}

// Plain text stays a string; anything with an image keeps the part list.
function content(value: unknown) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  const parts = value.map(part).filter((p): p is NonNullable<typeof p> => p !== null);
  return parts.every((p) => p.type === "text") ? parts.map((p) => (p as { text: string }).text).join("") : parts;
}

function messagesFrom(input: unknown, instructions: unknown) {
  const messages: Rec[] = [];
  if (typeof instructions === "string" && instructions) messages.push({ role: "system", content: instructions });
  const items = typeof input === "string" ? [{ role: "user", content: input }] : Array.isArray(input) ? input : [];
  for (const raw of items) {
    const item = rec(raw);
    if (!item) continue;
    const type = item.type ?? "message";
    if (type === "message") {
      const role = item.role === "developer" ? "system" : typeof item.role === "string" ? item.role : "user";
      messages.push({ role, content: content(item.content) });
    } else if (type === "function_call") {
      const call = {
        id: typeof item.call_id === "string" ? item.call_id : item.id,
        type: "function",
        function: { name: item.name, arguments: typeof item.arguments === "string" ? item.arguments : "{}" },
      };
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") last.tool_calls = [...((last.tool_calls as unknown[] | undefined) ?? []), call];
      else messages.push({ role: "assistant", content: null, tool_calls: [call] });
    } else if (type === "function_call_output") {
      messages.push({
        role: "tool",
        tool_call_id: item.call_id,
        content: typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? ""),
      });
    }
    // Reasoning items and built-in tool results carry nothing a chat model takes.
  }
  return messages;
}

function tools(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const list = value.flatMap((entry) => {
    const tool = rec(entry);
    if (!tool || tool.type !== "function") return []; // web_search and the like are not ours to run
    if (rec(tool.function)) return [tool]; // already in the chat shape
    return [
      {
        type: "function",
        function: {
          name: tool.name,
          ...(typeof tool.description === "string" && { description: tool.description }),
          ...(rec(tool.parameters) && { parameters: tool.parameters }),
          ...(typeof tool.strict === "boolean" && { strict: tool.strict }),
        },
      },
    ];
  });
  return list.length ? list : undefined;
}

function toolChoice(value: unknown) {
  const choice = rec(value);
  if (!choice) return value; // "auto", "none", "required" or nothing
  if (choice.type === "function" && typeof choice.name === "string") return { type: "function", function: { name: choice.name } };
  if (choice.type === "function" && rec(choice.function)) return value;
  return undefined;
}

function responseFormat(text: unknown) {
  const format = rec(rec(text)?.format);
  if (!format) return undefined;
  if (format.type === "json_object") return { type: "json_object" };
  if (format.type === "json_schema") {
    return {
      type: "json_schema",
      json_schema: {
        name: typeof format.name === "string" ? format.name : "response",
        schema: format.schema,
        ...(typeof format.strict === "boolean" && { strict: format.strict }),
      },
    };
  }
  return undefined;
}

// Responses-only fields; everything else (stream, temperature, user, metadata…) means the same in chat.
const RESPONSES_ONLY = new Set([
  "input", "instructions", "tools", "tool_choice", "text", "reasoning", "include", "store", "previous_response_id",
  "truncation", "max_output_tokens", "max_tool_calls", "background", "conversation", "prompt",
]);

export function chatBodyFromResponses(body: Rec): Rec {
  const rest = Object.fromEntries(Object.entries(body).filter(([key]) => !RESPONSES_ONLY.has(key)));
  const converted = { tools: tools(body.tools), tool_choice: toolChoice(body.tool_choice), response_format: responseFormat(body.text) };
  const effort = rec(body.reasoning)?.effort;
  return {
    ...rest,
    messages: messagesFrom(body.input, body.instructions),
    ...(converted.tools && { tools: converted.tools }),
    ...(converted.tool_choice !== undefined && { tool_choice: converted.tool_choice }),
    ...(converted.response_format && { response_format: converted.response_format }),
    ...(Number.isInteger(body.max_output_tokens) && { max_completion_tokens: body.max_output_tokens }),
    ...(typeof effort === "string" && { reasoning_effort: effort }),
  };
}
