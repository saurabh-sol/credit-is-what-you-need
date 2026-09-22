import type { NetworkId } from "./networks.ts";
import { POOL_FEES, UNISWAP_MAINNET } from "./uniswap.ts";

// Buying credits at a fixed dollar price through the KreditCheckout contract.
// USDG (a dollar stablecoin) is the unit of account: `usdgPerCredit` base units
// buy one credit, 800 = $0.0008, so 1,000 credits cost $0.80. Two ways to pay,
// one rule: only what the contract recorded in a `Purchased` event counts.
//   - pay USDG: the contract moves exactly the price from the wallet to the treasury;
//   - pay ETH: the contract swaps it for USDG on Uniswap v3 with the treasury as
//     the recipient and credits whatever whole credits came out.
// The server reads the transaction's receipt and credits what it can prove.
// Pure logic lives here so the money rules are easy to test.

// USDG (Global Dollar) on Robinhood Chain, 6 decimals.
export const USDG_MAINNET = { address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", symbol: "USDG", decimals: 6 } as const;
export const DEFAULT_USDG_PER_CREDIT = 800; // $0.0008: 1,000 credits = $0.80

export type TopUpConfig = {
  network: NetworkId;
  checkout: string; // lowercase KreditCheckout address
  token: string; // lowercase USDG address
  treasury: string; // lowercase address that receives payments
  symbol: string;
  decimals: number;
  usdgPerCredit: number; // USDG base units per credit
  router: string; // Uniswap v3 SwapRouter02
  quoter: string; // Uniswap v3 QuoterV2, for the ETH price preview
  weth: string; // what the router wraps ETH into
  poolFee: number; // the WETH/USDG pool's fee tier
  maxCreditsPerBuy: number;
};

const isAddress = (value: string | undefined): value is string => /^0x[0-9a-fA-F]{40}$/.test(value ?? "");

// Top-ups stay switched off until the checkout contract and the treasury are set.
export function topUpConfig(env: Record<string, string | undefined> = process.env): TopUpConfig | null {
  const checkout = env.TOPUP_CHECKOUT_ADDRESS;
  const treasury = env.TOPUP_TREASURY_ADDRESS;
  if (!isAddress(checkout) || !isAddress(treasury)) return null;
  const usdgPerCredit = Number(env.TOPUP_USDG_PER_CREDIT ?? DEFAULT_USDG_PER_CREDIT);
  const poolFee = Number(env.TOPUP_POOL_FEE ?? 100);
  const maxCreditsPerBuy = Number(env.TOPUP_MAX_CREDITS_PER_BUY ?? 100_000);
  if (!Number.isInteger(usdgPerCredit) || usdgPerCredit < 1) return null;
  if (!(POOL_FEES as readonly number[]).includes(poolFee)) return null;
  if (!(maxCreditsPerBuy > 0)) return null;
  const token = env.TOPUP_USDG_ADDRESS;
  return {
    network: "mainnet",
    checkout: checkout.toLowerCase(),
    token: (isAddress(token) ? token : USDG_MAINNET.address).toLowerCase(),
    treasury: treasury.toLowerCase(),
    symbol: USDG_MAINNET.symbol,
    decimals: USDG_MAINNET.decimals,
    usdgPerCredit,
    router: UNISWAP_MAINNET.swapRouter02,
    quoter: UNISWAP_MAINNET.quoterV2,
    weth: UNISWAP_MAINNET.weth,
    poolFee,
    maxCreditsPerBuy,
  };
}

// The Kredit token (KRED) on Robinhood Chain, 18 decimals. It is still on
// its launch curve with no Uniswap pool, so KreditTokenCheckout sells credits
// for it at a rate the owner sets by hand (`tokensPerCredit`, read live from
// the contract) instead of a swap.
export const KRED_MAINNET = { address: "0x1b69ba93b8da9cf4cbc8f9c40e7ed25347f86dd1", symbol: "KRED", decimals: 18 } as const;

export type TokenTopUpConfig = {
  network: NetworkId;
  checkout: string; // lowercase KreditTokenCheckout address
  token: string; // lowercase address of the token it accepts
  treasury: string; // lowercase address that receives payments
  symbol: string;
  decimals: number;
};

// Paying with the token stays switched off until its checkout contract and the
// treasury are set. The token defaults to KRED; TOPUP_TOKEN_ADDRESS,
// TOPUP_TOKEN_SYMBOL and TOPUP_TOKEN_DECIMALS override it together.
export function tokenTopUpConfig(env: Record<string, string | undefined> = process.env): TokenTopUpConfig | null {
  const checkout = env.TOPUP_TOKEN_CHECKOUT_ADDRESS;
  const treasury = env.TOPUP_TREASURY_ADDRESS;
  if (!isAddress(checkout) || !isAddress(treasury)) return null;
  const token = env.TOPUP_TOKEN_ADDRESS;
  const custom = isAddress(token);
  const decimals = custom ? Number(env.TOPUP_TOKEN_DECIMALS ?? KRED_MAINNET.decimals) : KRED_MAINNET.decimals;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  return {
    network: "mainnet",
    checkout: checkout.toLowerCase(),
    token: (custom ? token : KRED_MAINNET.address).toLowerCase(),
    treasury: treasury.toLowerCase(),
    symbol: custom ? (env.TOPUP_TOKEN_SYMBOL?.trim() || "TOKEN") : KRED_MAINNET.symbol,
    decimals,
  };
}

// Whole credits for `amount` token base units at `tokensPerCredit` base units
// per credit, rounded down. Mirrors KreditTokenCheckout.creditsFor.
export function creditsForTokens(amount: bigint, tokensPerCredit: bigint) {
  if (tokensPerCredit < BigInt(1)) return 0;
  const credits = amount / tokensPerCredit;
  return credits > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(credits);
}

// Token base units that `credits` credits cost. Mirrors KreditTokenCheckout.costOf.
export function costInTokens(credits: number, tokensPerCredit: bigint) {
  return BigInt(credits) * tokensPerCredit;
}

export type ReceiptLog = { address: string; topics: readonly string[]; data: string };

const topicAddress = (topic: string) => `0x${topic.slice(-40)}`.toLowerCase();

// keccak256("Purchased(address,address,uint256,uint256,uint256)")
const PURCHASED_TOPIC = "0xb362243af1e2070d7d5bf8d713f2e0fab64203f1b71462afbe20572909788c5e";
const word = (data: string, index: number) => BigInt(`0x${data.slice(2 + index * 64, 2 + (index + 1) * 64)}`);

export type Purchase = { ethIn: bigint; amount: bigint; credits: bigint };

// The purchase the checkout contract recorded for `buyer` in these logs: how
// much ETH went in (zero for a USDG payment), how many USDG base units reached
// the treasury, and the credits the contract says that bought. Anything else
// (other contracts, other buyers, other tokens) counts for nothing. One
// transaction holds at most one purchase per buyer, so the first match wins.
export function purchaseIn(logs: readonly ReceiptLog[], want: { checkout: string; token: string; buyer: string }): Purchase | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== want.checkout.toLowerCase()) continue;
    if (log.topics.length !== 3 || log.topics[0].toLowerCase() !== PURCHASED_TOPIC) continue;
    if (topicAddress(log.topics[1]) !== want.buyer.toLowerCase()) continue;
    if (topicAddress(log.topics[2]) !== want.token.toLowerCase()) continue;
    if (log.data.length !== 2 + 3 * 64) continue;
    return { ethIn: word(log.data, 0), amount: word(log.data, 1), credits: word(log.data, 2) };
  }
  return null;
}

// Whole credits for `amount` USDG base units, rounded down: a payment never
// buys more than it paid for. Mirrors KreditCheckout.creditsFor.
export function creditsForPayment(amount: bigint, config: Pick<TopUpConfig, "usdgPerCredit">) {
  const credits = amount / BigInt(config.usdgPerCredit);
  return credits > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(credits);
}

// USDG base units that `credits` credits cost. Mirrors KreditCheckout.costOf.
export function costOfCredits(credits: number, config: Pick<TopUpConfig, "usdgPerCredit">) {
  return BigInt(credits) * BigInt(config.usdgPerCredit);
}

// "$0.80" for 1,000 credits at 800 per credit.
export function formatUsd(units: bigint, decimals = USDG_MAINNET.decimals) {
  const dollars = Number(units) / 10 ** decimals;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: dollars < 0.1 ? 4 : 2 })}`;
}

// "1000" -> 1000. Returns null for anything that is not a plain positive whole number.
export function parseCredits(text: string) {
  const match = /^\d{1,12}$/.exec(text.trim().replace(/,/g, ""));
  if (!match) return null;
  const credits = Number(match[0]);
  return credits > 0 ? credits : null;
}

export function formatTokenAmount(units: bigint, decimals: number, maxFraction = 4) {
  const base = BigInt(10) ** BigInt(decimals);
  const whole = (units / base).toLocaleString("en-US");
  const fraction = (units % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
