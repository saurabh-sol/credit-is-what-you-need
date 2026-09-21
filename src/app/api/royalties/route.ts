import { ExplorerError } from "@/lib/explorer";
import { listContracts, previewRoyalties } from "@/lib/ledger";
import { isNetworkId, networks } from "@/lib/networks";
import { PriceError } from "@/lib/price";
import { ROYALTY_PERCENT } from "@/lib/royalties";
import { ROYALTIES_OFF, scanRoyalties } from "@/lib/royalty-scan";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const networkId = new URL(request.url).searchParams.get("network") ?? "testnet";
  if (!isNetworkId(networkId)) {
    return Response.json({ error: "network must be testnet or mainnet" }, { status: 400 });
  }
  const network = networks[networkId];
  if (!network.gasRewards) return Response.json({ error: ROYALTIES_OFF }, { status: 403 });

  try {
    const { usage, ethUsdCents, skippedContracts } = await scanRoyalties(network, session.address);
    const plan = previewRoyalties(session.address, networkId, usage, ethUsdCents);
    const stats = new Map(plan.contracts.map((entry) => [entry.contract, entry]));
    return Response.json({
      network: { id: network.id, name: network.name, explorerUrl: network.explorerUrl },
      percent: ROYALTY_PERCENT,
      contracts: listContracts(session.address, networkId)
        .map((contract) => ({
          ...contract,
          newCalls: stats.get(contract.address)?.newCalls ?? 0,
          newUsers: stats.get(contract.address)?.newUsers ?? 0,
        }))
        .sort((a, b) => b.newCalls - a.newCalls || b.paidCalls - a.paidCalls),
      newCalls: plan.payable.length,
      claimable: plan.credits,
      skippedContracts,
    });
  } catch (error) {
    if (error instanceof ExplorerError || error instanceof PriceError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
