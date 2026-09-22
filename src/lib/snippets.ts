// The same request in three languages. Shared by the landing demo and the API docs.

export const KEY_PLACEHOLDER = "kred_sk_••••••••";

type SnippetOptions = { origin: string; key?: string; model?: string; message?: string };

export const snippets = {
  curl: ({ origin, key = KEY_PLACEHOLDER, model = "kredit/echo", message = "hi" }: SnippetOptions) =>
    `curl ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "${model}", "messages": [{ "role": "user", "content": "${message}" }] }'`,
  Python: ({ origin, key = KEY_PLACEHOLDER, model = "kredit/echo", message = "hi" }: SnippetOptions) =>
    `from openai import OpenAI

client = OpenAI(base_url="${origin}/v1", api_key="${key}")
reply = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "${message}"}],
)
print(reply.choices[0].message.content)`,
  Node: ({ origin, key = KEY_PLACEHOLDER, model = "kredit/echo", message = "hi" }: SnippetOptions) =>
    `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${origin}/v1", apiKey: "${key}" });
const reply = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "${message}" }],
});
console.log(reply.choices[0].message.content);`,
  Anthropic: ({ origin, key = KEY_PLACEHOLDER, model = "anthropic/claude-sonnet-4.5", message = "hi" }: SnippetOptions) =>
    `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ baseURL: "${origin}/v1", apiKey: "${key}" });
const reply = await client.messages.create({
  model: "${model}",
  max_tokens: 1024,
  messages: [{ role: "user", content: "${message}" }],
});
console.log(reply.content[0].text);`,
  "AI SDK": ({ origin, key = KEY_PLACEHOLDER, model = "kredit/echo", message = "hi" }: SnippetOptions) =>
    `import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

const kredit = createOpenAICompatible({ name: "kredit", baseURL: "${origin}/v1", apiKey: "${key}" });
const { text } = await generateText({ model: kredit("${model}"), prompt: "${message}" });
console.log(text);`,
  "Claude Code": ({ origin, key = KEY_PLACEHOLDER, model = "anthropic/claude-sonnet-4.5" }: SnippetOptions) =>
    `export ANTHROPIC_BASE_URL="${origin}/v1"
export ANTHROPIC_API_KEY="${key}"
export ANTHROPIC_MODEL="${model}"
claude`,
};

export type SnippetName = keyof typeof snippets;
export const snippetNames = Object.keys(snippets) as SnippetName[];

// The landing demo shows the echo model answering, so it keeps to the snippets that call it.
export const demoSnippetNames: SnippetName[] = ["curl", "Python", "Node"];
