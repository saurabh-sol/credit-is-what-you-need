"use client";

import { useSyncExternalStore } from "react";
import { CodeBlock, CodeTabs } from "@/components/code-block";
import { snippetNames, snippets } from "@/lib/snippets";

// The real origin in the browser, a stand-in on the server, with no hydration mismatch.
const useOrigin = () =>
  useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "https://your-kredit-host",
  );

export function Quickstart() {
  const origin = useOrigin();
  return <CodeTabs tabs={snippetNames.map((name) => ({ name, code: snippets[name]({ origin }) }))} />;
}

export function StreamingExample() {
  const origin = useOrigin();
  return (
    <CodeBlock
      title="Streaming"
      code={`curl -N ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer $KREDIT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "kredit/echo", "stream": true, "messages": [{ "role": "user", "content": "hi" }] }'

# data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"Kredit echo: hi"}}]}
# data: [DONE]`}
    />
  );
}

export function ModelsExample() {
  const origin = useOrigin();
  return (
    <CodeBlock
      title="List models"
      code={`curl ${origin}/v1/models \\
  -H "Authorization: Bearer $KREDIT_KEY"

# { "object": "list", "data": [{ "id": "anthropic/claude-sonnet-4.5", "type": "language",
#     "pricing": { "credits_per_million_input": 3600, "credits_per_million_output": 18000 } }, …] }

curl ${origin}/v1/account -H "Authorization: Bearer $KREDIT_KEY"
# { "balance": 4988, "held": 0, "available": 4988, "usd_value": 4.988, … }`}
    />
  );
}

export function BaseUrl() {
  const origin = useOrigin();
  return <CodeBlock title="Base URL" code={`${origin}/v1`} />;
}
