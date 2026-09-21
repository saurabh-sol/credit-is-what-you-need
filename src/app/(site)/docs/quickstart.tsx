"use client";

import { useSyncExternalStore } from "react";
import { CodeBlock, CodeTabs } from "@/components/code-block";
import { snippetNames, snippets } from "@/lib/snippets";

// The real origin in the browser, a stand-in on the server, with no hydration mismatch.
const useOrigin = () =>
  useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "https://your-fuel-host",
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
  -H "Authorization: Bearer $FUEL_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "fuel/echo", "stream": true, "messages": [{ "role": "user", "content": "hi" }] }'

# data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"Fuel echo: hi"}}]}
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
  -H "Authorization: Bearer $FUEL_KEY"

# { "object": "list", "data": [{ "id": "fuel/echo", "object": "model", "owned_by": "fuel" }] }`}
    />
  );
}

export function BaseUrl() {
  const origin = useOrigin();
  return <CodeBlock title="Base URL" code={`${origin}/v1`} />;
}
