import { getSession } from "@/lib/session";
import { clearWorkspace } from "@/lib/workspace";

// Deletes every conversation, message, picture and clip this wallet keeps.
// The ledger and usage rows stay: they are the money, not the workspace.
export async function DELETE() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  await clearWorkspace(session.address);
  return Response.json({ ok: true });
}
