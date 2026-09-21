import { ExplorerError } from "@/lib/explorer";
import { claimRoyalties } from "@/lib/ledger";
import { isNetworkId, networks } from "@/lib/networks";
import { PriceError } from "@/lib/price";
import { ROYALTIES_OFF, scanRoyalties } from "@/lib/royalty-scan";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const networkId: unknown = body?.network;
  if (!isNetworkId(networkId)) {
    return Response.json({ error: "network must be testnet or mainnet" }, { status: 400 });
  }

  if (!networks[networkId].gasRewards) return Response.json({ error: ROYALTIES_OFF }, { status: 403 });

  try {
    const { usage, ethUsdCents } = await scanRoyalties(networks[networkId], session.address);
    return Response.json(claimRoyalties(session.address, networkId, usage, ethUsdCents));
  } catch (error) {
    if (error instanceof ExplorerError || error instanceof PriceError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
