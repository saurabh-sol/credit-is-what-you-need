import { apiError, authenticate, chargeHeaders, preflight, v1 } from "@/lib/gateway";
import { makeVideo } from "@/lib/media";

// Text to video. { model, prompt, duration, resolution, aspect_ratio, generate_audio } in,
// { data: [{ b64_json, media_type }] } out. The call stays open until the video is ready.
export const POST = v1(async (request) => {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.model !== "string" || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return apiError(400, "Send a JSON body with `model` and `prompt`.", "invalid_body");
  }
  const result = await makeVideo(
    caller,
    {
      model: body.model,
      prompt: body.prompt,
      duration: typeof body.duration === "number" ? body.duration : undefined,
      resolution: typeof body.resolution === "string" ? body.resolution : undefined,
      aspectRatio: typeof body.aspect_ratio === "string" ? body.aspect_ratio : undefined,
      generateAudio: typeof body.generate_audio === "boolean" ? body.generate_audio : undefined,
    },
    request.signal,
  );
  if (result instanceof Response) return result;

  return Response.json(
    {
      created: Math.floor(Date.now() / 1000),
      data: result.videos.map((video) => ({ b64_json: video.base64, media_type: video.mediaType })),
      duration: result.duration,
      resolution: result.resolution,
      generate_audio: result.generateAudio,
    },
    { headers: chargeHeaders(result.charge) },
  );
});

export const OPTIONS = preflight;
