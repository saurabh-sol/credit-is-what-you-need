import type { Hash } from "viem";
import { chains, publicClient } from "@/lib/chain";
import { recordTopUp, TopUpUsedError } from "@/lib/ledger";
import { getSession } from "@/lib/session";
import { readTokenTerms } from "@/lib/token-checkout";
import { creditsForPayment, creditsForTokens, purchaseIn, tokenTopUpConfig, topUpConfig, type ReceiptLog } from "@/lib/topup";

// What the buy-credits form needs to know. `config` is the USDG/ETH checkout,
// `token` the KRED one; `null` means that way of paying is switched off. The
// token's terms come from its contract; when the chain cannot be read they are
// `null` and the form says so instead of quoting a stale price.
export async function GET() {
  const config = topUpConfig();
  const tokenConfig = tokenTopUpConfig();
  const chainId = chains.mainnet.chain.id;
  const token =
    tokenConfig &&
    (await readTokenTerms(tokenConfig)
      .then((terms) => ({ ...tokenConfig, chainId, ...terms, tokensPerCredit: terms.tokensPerCredit.toString() }))
      .catch(() => ({ ...tokenConfig, chainId, tokensPerCredit: null, maxCreditsPerBuy: null, paused: null })));
  return Response.json({ config: config && { ...config, chainId }, token });
}

type Found = {
  credits: number;
  amount: bigint;
  network: "mainnet";
  token: string;
  symbol: string;
  decimals: number;
};

// The purchase the buyer made through one of Kredit's checkouts in these logs,
// priced by the server and never above what the contract recorded, so the two
// rates cannot drift in the buyer's favour.
async function findPurchase(logs: readonly ReceiptLog[], buyer: string): Promise<Found | null> {
  const config = topUpConfig();
  if (config) {
    const purchase = purchaseIn(logs, { checkout: config.checkout, token: config.token, buyer });
    if (purchase) {
      const credits = Math.min(creditsForPayment(purchase.amount, config), Number(purchase.credits));
      return { credits, amount: purchase.amount, network: config.network, token: config.token, symbol: config.symbol, decimals: config.decimals };
    }
  }
  const tokenConfig = tokenTopUpConfig();
  if (tokenConfig) {
    const purchase = purchaseIn(logs, { checkout: tokenConfig.checkout, token: tokenConfig.token, buyer });
    if (purchase) {
      const { tokensPerCredit } = await readTokenTerms(tokenConfig);
      const credits = Math.min(creditsForTokens(purchase.amount, tokensPerCredit), Number(purchase.credits));
      return { credits, amount: purchase.amount, network: tokenConfig.network, token: tokenConfig.token, symbol: tokenConfig.symbol, decimals: tokenConfig.decimals };
    }
  }
  return null;
}

// The user has paid through a checkout contract, in USDG, ETH or KRED; turn
// that transaction into credits.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  if (!topUpConfig() && !tokenTopUpConfig()) return Response.json({ error: "Buying credits is not open yet." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { hash?: unknown } | null;
  const hash = typeof body?.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(body.hash) ? (body.hash as Hash) : null;
  if (!hash) return Response.json({ error: "Send the transaction hash of your payment." }, { status: 400 });

  const client = publicClient("mainnet");
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

  // A checkout contract moved the wallet's USDG, KRED (or the USDG its ETH
  // bought) to the treasury and wrote what that bought.
  const found = await findPurchase(receipt.logs, session.address);
  if (!found || found.credits < 1) {
    return Response.json({ error: "No purchase from your wallet through Kredit's checkout was found in that transaction." }, { status: 400 });
  }

  try {
    const balance = await recordTopUp({ ...found, hash, address: session.address });
    return Response.json({ credits: found.credits, balance });
  } catch (error) {
    if (error instanceof TopUpUsedError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
