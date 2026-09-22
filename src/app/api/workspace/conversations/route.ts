import { getSession } from "@/lib/session";
import { createConversation, listConversations } from "@/lib/workspace";

// The wallet's conversations, newest first.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  return Response.json({ conversations: await listConversations(session.address) });
}

// Starts a conversation. { model, title?, system? }
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { model?: unknown; title?: unknown; system?: unknown } | null;
  if (typeof body?.model !== "string" || !body.model) return Response.json({ error: "Send a model" }, { status: 400 });
  const conversation = await createConversation(session.address, {
    model: body.model,
    title: typeof body.title === "string" ? body.title : undefined,
    system: typeof body.system === "string" ? body.system : null,
  });
  return Response.json(conversation, { status: 201 });
}
