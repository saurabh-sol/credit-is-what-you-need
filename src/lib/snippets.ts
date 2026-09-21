// The same request in three languages. Shared by the landing demo and the API docs.

export const KEY_PLACEHOLDER = "kredit_sk_••••••••";

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
};

export type SnippetName = keyof typeof snippets;
export const snippetNames = Object.keys(snippets) as SnippetName[];
