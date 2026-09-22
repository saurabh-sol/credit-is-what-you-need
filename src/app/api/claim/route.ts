import { ExplorerError } from "@/lib/explorer";
import { claim } from "@/lib/ledger";
import { isNetworkId, networks } from "@/lib/networks";
import { scanRecord } from "@/lib/record";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const networkId: unknown = body?.network;
  if (!isNetworkId(networkId)) {
    return Response.json({ error: "network must be testnet or mainnet" }, { status: 400 });
  }

  try {
    const { receipt } = await scanRecord(networks[networkId], session.address);
    return Response.json(claim(session.address, networkId, receipt.tasks));
  } catch (error) {
    if (error instanceof ExplorerError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
