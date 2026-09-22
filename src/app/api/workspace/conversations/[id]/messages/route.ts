import { getSession } from "@/lib/session";
import { appendMessage, MAX_MESSAGE_CHARS, priceMessage } from "@/lib/workspace";

type Context = { params: Promise<{ id: string }> };

// Appends a message. { role, content, model?, credits?, ms?, attachments? }
// The page writes the person's message before sending it to the model and the
// reply once it has finished streaming; the bytes of any attachment are not kept.
export async function POST(request: Request, context: Context) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || (body.role !== "user" && body.role !== "assistant") || typeof body.content !== "string") {
    return Response.json({ error: "Send role and content" }, { status: 400 });
  }
  if (body.content.length > MAX_MESSAGE_CHARS) {
    return Response.json({ error: `A message can hold ${MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters.` }, { status: 413 });
  }
  const saved = await appendMessage(session.address, id, {
    role: body.role,
    content: body.content,
    model: typeof body.model === "string" ? body.model : null,
    credits: typeof body.credits === "number" ? body.credits : null,
    ms: typeof body.ms === "number" ? Math.round(body.ms) : null,
    attachments: Array.isArray(body.attachments) ? body.attachments.filter((name): name is string => typeof name === "string").slice(0, 10) : [],
  });
  if (!saved) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(saved, { status: 201 });
}

// Fills in what a reply cost once its charge has settled. { messageId, credits }
export async function PATCH(request: Request, context: Context) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  await context.params;
  const body = (await request.json().catch(() => null)) as { messageId?: unknown; credits?: unknown } | null;
  if (typeof body?.messageId !== "number" || typeof body.credits !== "number") return Response.json({ error: "Send messageId and credits" }, { status: 400 });
  await priceMessage(session.address, body.messageId, body.credits);
  return Response.json({ ok: true });
}
