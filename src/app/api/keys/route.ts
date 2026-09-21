import { createKey, KeyLimitError } from "@/lib/ledger";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 40) : "";

  try {
    return Response.json(createKey(session.address, name || "My key"), { status: 201 });
  } catch (error) {
    if (error instanceof KeyLimitError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
