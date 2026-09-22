import { ExplorerError } from "@/lib/explorer";
import { previewClaim } from "@/lib/ledger";
import { isNetworkId, networks } from "@/lib/networks";
import { scanRecord } from "@/lib/record";
import { getSession } from "@/lib/session";

const RECENT_TASKS = 25;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const networkId = new URL(request.url).searchParams.get("network") ?? "testnet";
  if (!isNetworkId(networkId)) {
    return Response.json({ error: "network must be testnet or mainnet" }, { status: 400 });
  }
  const network = networks[networkId];

  try {
    // You can only scan the wallet you proved you own.
    const { receipt, truncated } = await scanRecord(network, session.address);
    return Response.json({
      address: session.address,
      network: { id: network.id, name: network.name, explorerUrl: network.explorerUrl },
      truncated,
      ...receipt,
      tasks: receipt.tasks.slice(0, RECENT_TASKS),
      claimable: previewClaim(session.address, networkId, receipt.tasks).total,
    });
  } catch (error) {
    if (error instanceof ExplorerError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
