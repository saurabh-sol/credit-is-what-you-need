import { apiError, authenticate, chargeHeaders, preflight, v1 } from "@/lib/gateway";
import { makeImages } from "@/lib/media";

// OpenAI's image endpoint: { model, prompt, n, size } in, { data: [{ b64_json }] } out.
export const POST = v1(async (request) => {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.model !== "string" || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return apiError(400, "Send a JSON body with `model` and `prompt`.", "invalid_body");
  }
  const result = await makeImages(
    caller,
    {
      model: body.model,
      prompt: body.prompt,
      n: typeof body.n === "number" ? body.n : undefined,
      size: typeof body.size === "string" ? body.size : undefined,
      aspectRatio: typeof body.aspect_ratio === "string" ? body.aspect_ratio : undefined,
    },
    request.signal,
  );
  if (result instanceof Response) return result;

  return Response.json(
    {
      created: Math.floor(Date.now() / 1000),
      data: result.images.map((image) => ({ b64_json: image.base64, media_type: image.mediaType })),
      usage: { input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens },
    },
    { headers: chargeHeaders(result.charge) },
  );
});

export const OPTIONS = preflight;
