import { apiError, PLAYGROUND_KEY_ID, rateLimited } from "@/lib/gateway";
import { makeImages, makeVideo } from "@/lib/media";
import { getSession } from "@/lib/session";

// Images and video for the playground, paid from the wallet session like chat.
// { kind: "image" | "video", model, prompt, ...options }
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return apiError(401, "Sign in with your wallet to use the playground.", "not_signed_in");
  const limited = rateLimited(`${PLAYGROUND_KEY_ID}:${session.address.toLowerCase()}`);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.model !== "string" || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return apiError(400, "Send `model` and `prompt`.", "invalid_body");
  }
  const caller = { keyId: PLAYGROUND_KEY_ID, address: session.address };
  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : undefined);

  if (body.kind === "video") {
    const result = await makeVideo(
      caller,
      {
        model: body.model,
        prompt: body.prompt,
        duration: typeof body.duration === "number" ? body.duration : undefined,
        resolution: str("resolution"),
        aspectRatio: str("aspectRatio"),
        generateAudio: body.generateAudio === true,
      },
      request.signal,
    );
    if (result instanceof Response) return result;
    return Response.json({ videos: result.videos, credits: result.charge.credits, balance: result.charge.balance });
  }

  const result = await makeImages(
    caller,
    { model: body.model, prompt: body.prompt, n: typeof body.n === "number" ? body.n : 1, size: str("size") },
    request.signal,
  );
  if (result instanceof Response) return result;
  return Response.json({ images: result.images, credits: result.charge.credits, balance: result.charge.balance });
}
