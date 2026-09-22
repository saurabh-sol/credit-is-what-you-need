import { responses } from "@/lib/dialects";
import { authenticate, preflight, v1 } from "@/lib/gateway";
import { proxyCall } from "@/lib/proxy";

// OpenAI's Responses API, the default of the newer OpenAI SDKs.
export const POST = v1(async (request) => {
  const caller = authenticate(request);
  if (caller instanceof Response) return caller;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return responses.error(400, "Send a JSON body with `model` and `input`.", "invalid_body");
  return proxyCall(caller, request, body, responses);
});

export const OPTIONS = preflight;
