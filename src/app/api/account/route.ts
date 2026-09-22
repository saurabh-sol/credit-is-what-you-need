import { getBalance, getTotals, listKeys, listLedger } from "@/lib/ledger";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  return Response.json({
    address: session.address,
    balance: await getBalance(session.address),
    ...(await getTotals(session.address)),
    keys: await listKeys(session.address),
    activity: await listLedger(session.address),
  });
}
