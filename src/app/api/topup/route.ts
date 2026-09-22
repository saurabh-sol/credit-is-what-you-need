import type { Hash } from "viem";
import { chains, publicClient } from "@/lib/chain";
import { recordTopUp, TopUpUsedError } from "@/lib/ledger";
import { getSession } from "@/lib/session";
import { creditsForPayment, purchaseIn, topUpConfig } from "@/lib/topup";

// What the buy-credits form needs to know. `null` means top-ups are switched off.
export async function GET() {
  const config = topUpConfig();
  return Response.json({ config: config && { ...config, chainId: chains[config.network].chain.id } });
}

// The user has paid through the checkout contract, in USDG or in ETH; turn
// that transaction into credits.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const config = topUpConfig();
  if (!config) return Response.json({ error: "Buying credits is not open yet." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { hash?: unknown } | null;
  const hash = typeof body?.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(body.hash) ? (body.hash as Hash) : null;
  if (!hash) return Response.json({ error: "Send the transaction hash of your payment." }, { status: 400 });

  const client = publicClient(config.network);
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash });
  } catch {
    return Response.json(
      { error: "That transaction is not confirmed yet. Give it a moment and try again.", retry: true },
      { status: 404 },
    );
  }
  if (receipt.status !== "success") {
    return Response.json({ error: "That transaction failed on-chain, so nothing was paid." }, { status: 400 });
  }

  // The checkout contract moved the wallet's USDG (or the USDG its ETH bought)
  // to the treasury and wrote what that bought. The server prices the USDG
  // amount itself and never credits more than the contract recorded, so the
  // two rates cannot drift in the buyer's favour.
  const purchase = purchaseIn(receipt.logs, { checkout: config.checkout, token: config.token, buyer: session.address });
  const credits = purchase ? Math.min(creditsForPayment(purchase.amount, config), Number(purchase.credits)) : 0;
  if (!purchase || credits < 1) {
    return Response.json({ error: "No purchase from your wallet through Kredit's checkout was found in that transaction." }, { status: 400 });
  }

  try {
    const balance = await recordTopUp({ ...config, hash, address: session.address, amount: purchase.amount, credits });
    return Response.json({ credits, balance });
  } catch (error) {
    if (error instanceof TopUpUsedError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
