import { getBalance, listKeys, listLedger } from "@/lib/ledger";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  return Response.json({
    address: session.address,
    balance: getBalance(session.address),
    keys: listKeys(session.address),
    activity: listLedger(session.address),
  });
}
