import { ExplorerError } from "@/lib/explorer";
import { claimGate, CLAIMS_PER_MINUTE, walletAgeDays } from "@/lib/fairness";
import { rateLimited } from "@/lib/gateway";
import { claim, HeldError } from "@/lib/ledger";
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

  const limited = rateLimited(`claim:${session.address.toLowerCase()}`, undefined, CLAIMS_PER_MINUTE);
  if (limited) return Response.json({ error: `Claims are limited to ${CLAIMS_PER_MINUTE} a minute.` }, { status: 429 });

  const body = await request.json().catch(() => null);
  const networkId: unknown = body?.network;
  if (!isNetworkId(networkId)) {
    return Response.json({ error: "network must be mainnet" }, { status: 400 });
  }

  try {
    const { receipt, txs, truncated } = await scanRecord(networks[networkId], session.address);
    const gate = claimGate(txs, truncated);
    if (gate) return Response.json({ error: gate.message, code: gate.code, until: gate.until }, { status: 403 });
    const ageDays = walletAgeDays(txs, truncated);
    const onchain = receiptsConfig(networkId);
    if (!onchain) return Response.json(await claim(session.address, networkId, receipt.tasks, ageDays));
    return Response.json({ onchain: true, ...(await issueReceipt(onchain, session.address, receipt.tasks, ageDays)) });
  } catch (error) {
    if (error instanceof HeldError) return Response.json({ error: error.message, code: "held", until: error.hold.until }, { status: 423 });
    if (error instanceof ExplorerError) return Response.json({ error: error.message }, { status: 502 });
    if (error instanceof ReceiptError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
