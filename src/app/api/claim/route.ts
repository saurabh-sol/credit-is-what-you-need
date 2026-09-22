import { ExplorerError } from "@/lib/explorer";
import { claim } from "@/lib/ledger";
import { isNetworkId, networks } from "@/lib/networks";
import { issueReceipt, ReceiptError, receiptsConfig } from "@/lib/receipts";
import { scanRecord } from "@/lib/record";
import { getSession } from "@/lib/session";

// Claims what the wallet's record has earned. On a network with the
// KreditReceipts contract set up, this answers with a signed receipt for the
// wallet to submit on-chain (then POST /api/claim/confirm); otherwise the
// credits are written straight into the ledger.
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
    const onchain = receiptsConfig(networkId);
    if (!onchain) return Response.json(claim(session.address, networkId, receipt.tasks));
    return Response.json({ onchain: true, ...(await issueReceipt(onchain, session.address, receipt.tasks)) });
  } catch (error) {
    if (error instanceof ExplorerError) return Response.json({ error: error.message }, { status: 502 });
    if (error instanceof ReceiptError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
