import type { Hash } from "viem";
import { isNetworkId } from "@/lib/networks";
import { confirmClaim, NotMinedError, ReceiptError, receiptsConfig } from "@/lib/receipts";
import { getSession } from "@/lib/session";

// The wallet submitted its receipt; here is the transaction. The server reads
// the `Claimed` event from it and writes the credits into the ledger. Answers
// 404 with `retry` while the transaction is still pending.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { network?: unknown; hash?: unknown } | null;
  if (!isNetworkId(body?.network)) {
    return Response.json({ error: "network must be testnet or mainnet" }, { status: 400 });
  }
  const hash = typeof body?.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(body.hash) ? (body.hash as Hash) : null;
  if (!hash) return Response.json({ error: "Send the hash of your claim transaction." }, { status: 400 });

  const config = receiptsConfig(body.network);
  if (!config) return Response.json({ error: "On-chain receipts are not set up for this network." }, { status: 503 });

  try {
    return Response.json(await confirmClaim(config, session.address, hash));
  } catch (error) {
    if (error instanceof NotMinedError) return Response.json({ error: error.message, retry: true }, { status: 404 });
    if (error instanceof ReceiptError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
