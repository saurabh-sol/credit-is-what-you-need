import { complete } from "@/lib/completions";
import { apiError, authenticate, preflight, v1 } from "@/lib/gateway";
import { chatBodyFromPrompt, toTextCompletion } from "@/lib/legacy-completions";

// OpenAI's legacy text completions, for older tools and autocomplete plugins.
// The prompt is answered by the chat path and reshaped on the way back.
export const POST = v1(async (request) => {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError(400, "Send a JSON body with `model` and a non-empty `prompt`.", "invalid_body");
  const chatBody = chatBodyFromPrompt(body);
  if (typeof chatBody === "string") return apiError(400, chatBody, "invalid_body");
  return toTextCompletion(await complete(caller, request, chatBody));
});

export const OPTIONS = preflight;
