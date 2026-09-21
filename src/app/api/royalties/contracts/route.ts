import { isAddress } from "viem";
import { ExplorerError, getContractCreation } from "@/lib/explorer";
import { addContract } from "@/lib/ledger";
import { isNetworkId, networks } from "@/lib/networks";
import { forgetRoyaltyScan } from "@/lib/royalty-scan";
import { getSession } from "@/lib/session";

// Registers a contract the scanner didn't find by itself (for example, one
// deployed long ago by a busy wallet). The explorer must confirm the signed-in
// wallet deployed it.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const networkId: unknown = body?.network;
  const contract: unknown = body?.address;
  if (!isNetworkId(networkId) || typeof contract !== "string" || !isAddress(contract)) {
    return Response.json({ error: "Send a network and a valid contract address" }, { status: 400 });
  }
  const network = networks[networkId];

  try {
    const creation = await getContractCreation(network, contract);
    if (!creation) {
      return Response.json({ error: `That address is not a contract on ${network.name}.` }, { status: 404 });
    }
    if (creation.creator.toLowerCase() !== session.address.toLowerCase()) {
      return Response.json(
        { error: "That contract was not deployed by your wallet. Contracts made through a factory are not supported yet." },
        { status: 403 },
      );
    }
    addContract(session.address, networkId, contract, creation.deployedAt);
    forgetRoyaltyScan(network, session.address);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ExplorerError) return Response.json({ error: error.message }, { status: 502 });
    throw error;
  }
}
