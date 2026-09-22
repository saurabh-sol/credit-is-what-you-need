import { approveLogin, getLogin, LoginError } from "@/lib/cli-login";
import { getSession } from "@/lib/session";

type Context = { params: Promise<{ code: string }> };

// What the verify page shows before the person approves: which terminal asked, and whether the code is still good.
export async function GET(_request: Request, context: Context) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { code } = await context.params;
  const row = await getLogin(code);
  if (!row) return Response.json({ error: "That code is not known." }, { status: 404 });
  const expired = row.expiresAt < Math.floor(Date.now() / 1000);
  return Response.json({ code: row.code, host: row.host, approved: Boolean(row.approvedAt), expired });
}

// The signed-in wallet approves the code and a key is made for the terminal.
export async function POST(_request: Request, context: Context) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { code } = await context.params;
  try {
    return Response.json(await approveLogin(code, session.address));
  } catch (error) {
    if (error instanceof LoginError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
