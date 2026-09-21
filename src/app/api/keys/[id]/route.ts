import { revokeKey } from "@/lib/ledger";
import { getSession } from "@/lib/session";

export async function DELETE(_request: Request, context: RouteContext<"/api/keys/[id]">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const { id } = await context.params;
  if (!revokeKey(session.address, id)) {
    return Response.json({ error: "Key not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
