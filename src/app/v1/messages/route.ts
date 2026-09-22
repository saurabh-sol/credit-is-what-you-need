import { messages } from "@/lib/dialects";
import { authenticate, preflight, v1 } from "@/lib/gateway";
import { proxyCall } from "@/lib/proxy";

// Anthropic's Messages API, so Anthropic SDKs and tools such as Claude Code
// work with ANTHROPIC_BASE_URL pointed here. The key can come as x-api-key.
export const POST = v1(async (request) => {
  const caller = authenticate(request, messages.error);
  if (caller instanceof Response) return caller;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return messages.error(400, "Send a JSON body with `model`, `max_tokens` and `messages`.", "invalid_body");
  return proxyCall(caller, request, body, messages);
});

export const OPTIONS = preflight;
