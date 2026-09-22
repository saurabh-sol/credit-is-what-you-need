import type { Address } from "viem";
import { publicClient } from "./chain.ts";
import { TOKEN_CHECKOUT_ABI } from "./token-checkout-abi.ts";
import type { TokenTopUpConfig } from "./topup.ts";

// What KreditTokenCheckout says right now: the owner reprices it by hand as
// the token moves, so the server reads the terms from the chain rather than
// from the environment. Server only.
export type TokenTerms = { tokensPerCredit: bigint; maxCreditsPerBuy: number; paused: boolean };

export async function readTokenTerms(config: TokenTopUpConfig): Promise<TokenTerms> {
  const client = publicClient(config.network);
  const address = config.checkout as Address;
  const [tokensPerCredit, maxCreditsPerBuy, paused] = await Promise.all([
    client.readContract({ abi: TOKEN_CHECKOUT_ABI, address, functionName: "tokensPerCredit" }),
    client.readContract({ abi: TOKEN_CHECKOUT_ABI, address, functionName: "maxCreditsPerBuy" }),
    client.readContract({ abi: TOKEN_CHECKOUT_ABI, address, functionName: "paused" }),
  ]);
  const cap = maxCreditsPerBuy > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(maxCreditsPerBuy);
  return { tokensPerCredit, maxCreditsPerBuy: cap, paused };
}
