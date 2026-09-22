import { getSession } from "@/lib/session";
import { deleteConversation, getConversation, listMessages, updateConversation } from "@/lib/workspace";

type Context = { params: Promise<{ id: string }> };

// One conversation with its messages.
export async function GET(_request: Request, context: Context) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await context.params;
  const conversation = await getConversation(session.address, id);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ...conversation, messages: await listMessages(session.address, id) });
}

// Rename it, change its model or its system prompt. { title?, model?, system? }
export async function PATCH(request: Request, context: Context) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { title?: unknown; model?: unknown; system?: unknown } | null;
  const patch = {
    ...(typeof body?.title === "string" && { title: body.title }),
    ...(typeof body?.model === "string" && { model: body.model }),
    ...((typeof body?.system === "string" || body?.system === null) && { system: body.system as string | null }),
  };
  const conversation = await updateConversation(session.address, id, patch);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(conversation);
}

// Gone for good, messages included.
export async function DELETE(_request: Request, context: Context) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await context.params;
  if (!(await deleteConversation(session.address, id))) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
