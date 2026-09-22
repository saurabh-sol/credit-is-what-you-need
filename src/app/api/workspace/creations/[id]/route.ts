import { getSession } from "@/lib/session";
import { deleteCreation } from "@/lib/workspace";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await context.params;
  if (!(await deleteCreation(session.address, id))) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
