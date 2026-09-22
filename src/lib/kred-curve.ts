import type { Address } from "viem";
import { KRED_MAINNET } from "./topup.ts";

// Where KRED trades today: its launch curve, a bonding-curve contract (not a
// Uniswap pair) whose `getReserves()` returns a virtual ETH reserve and the
// KRED it holds. Their ratio is the spot price in ETH, which the admin script
// turns into a suggested tokens-per-credit rate; nothing on the buying path
// depends on it. Replace with a Uniswap pool once the token graduates.
export const KRED_CURVE_MAINNET = { address: "0x66f08963924b312cc1b749f257afe92db1e58e34" as Address, token: KRED_MAINNET.address } as const;

export const CURVE_ABI = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "ethReserve", type: "uint256" },
      { name: "tokenReserve", type: "uint256" },
    ],
  },
] as const;

// Token base units one credit is worth when a credit costs `usdgPerCredit`
// USDG units, the curve holds `ethReserve` wei against `tokenReserve` token
// units, and `usdgPerEth` is what a whole ETH fetches in USDG units.
export function tokensPerCreditFromCurve(input: { ethReserve: bigint; tokenReserve: bigint; usdgPerEth: bigint; usdgPerCredit: bigint }) {
  const { ethReserve, tokenReserve, usdgPerEth, usdgPerCredit } = input;
  if (ethReserve < BigInt(1) || usdgPerEth < BigInt(1)) return BigInt(0);
  // usd per credit / usd per token = (usdgPerCredit / 1e6) / ((ethReserve / tokenReserve) * usdgPerEth / 1e18 / 1e6)
  return (usdgPerCredit * tokenReserve * BigInt(10) ** BigInt(18)) / (ethReserve * usdgPerEth);
}
