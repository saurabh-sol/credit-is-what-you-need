import { getSession } from "@/lib/session";
import { listCreations, saveCreation } from "@/lib/workspace";

// The wallet's library, newest first. ?meta=1 leaves the bytes out.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const meta = new URL(request.url).searchParams.get("meta") === "1";
  return Response.json({ creations: await listCreations(session.address, { withFiles: !meta }) });
}

// Keeps a picture or clip the studio just made. { kind, prompt, model, credits?, files }
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const files = Array.isArray(body?.files)
    ? body!.files.filter((file): file is { base64: string; mediaType: string } => typeof file?.base64 === "string" && typeof file?.mediaType === "string")
    : [];
  if (!body || (body.kind !== "image" && body.kind !== "video") || typeof body.prompt !== "string" || typeof body.model !== "string" || files.length === 0) {
    return Response.json({ error: "Send kind, prompt, model and files" }, { status: 400 });
  }
  const id = await saveCreation(session.address, {
    kind: body.kind,
    prompt: body.prompt,
    model: body.model,
    credits: typeof body.credits === "number" ? body.credits : null,
    files,
  });
  return Response.json({ id }, { status: 201 });
}
