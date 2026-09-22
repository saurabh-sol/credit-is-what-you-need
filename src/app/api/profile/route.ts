import { cleanName, getName, setName } from "@/lib/distribution";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  return Response.json({ name: await getName(session.address) });
}

// Sets the name shown next to this wallet on the distribution page. An empty name removes it.
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  if (typeof body?.name !== "string") return Response.json({ error: "Send a name" }, { status: 400 });

  if (body.name.trim() === "") {
    await setName(session.address, null);
    return Response.json({ name: null });
  }
  const name = cleanName(body.name);
  if (!name) {
    return Response.json(
      { error: "Use 2 to 24 letters, numbers, spaces, dots, dashes or underscores." },
      { status: 400 },
    );
  }
  await setName(session.address, name);
  return Response.json({ name });
}
