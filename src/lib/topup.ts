import type { NetworkId } from "./networks.ts";
import { POOL_FEES, UNISWAP_MAINNET } from "./uniswap.ts";

// Buying credits with the project's own token. Two ways in, one rule: only
// tokens that provably reached the treasury count.
//   - send tokens straight to the treasury (an ERC-20 transfer), or
//   - pay ETH to the KreditSwapBuy contract, which swaps it for the token on
//     Uniswap v3 with the treasury as the recipient and emits `Purchased`.
// The server reads the transaction's receipt and credits what it can prove.
// Pure logic lives here so the money rules are easy to test.

// How to buy with ETH: the swap contract and the pool it trades through.
export type SwapConfig = {
  address: string; // lowercase KreditSwapBuy address
  router: string; // Uniswap v3 SwapRouter02
  quoter: string; // Uniswap v3 QuoterV2, for the price preview
  weth: string; // what the router wraps ETH into
  poolFee: number; // the WETH/token pool's fee tier
  maxCreditsPerBuy: number;
};

export type TopUpConfig = {
  network: NetworkId;
  token: string; // lowercase ERC-20 address
  treasury: string; // lowercase address that receives payments
  symbol: string;
  decimals: number;
  creditsPerToken: number;
  swap: SwapConfig | null; // null = only direct token transfers
};

const isAddress = (value: string | undefined): value is string => /^0x[0-9a-fA-F]{40}$/.test(value ?? "");

// Top-ups stay switched off until the token, the treasury and a price are set.
export function topUpConfig(env: Record<string, string | undefined> = process.env): TopUpConfig | null {
  const token = env.TOPUP_TOKEN_ADDRESS;
  const treasury = env.TOPUP_TREASURY_ADDRESS;
  const creditsPerToken = Number(env.TOPUP_CREDITS_PER_TOKEN);
  const decimals = Number(env.TOPUP_TOKEN_DECIMALS ?? 18);
  const network: NetworkId = "mainnet";
  if (!isAddress(token) || !isAddress(treasury)) return null;
  if (!(creditsPerToken > 0) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  return {
    network,
    token: token.toLowerCase(),
    treasury: treasury.toLowerCase(),
    symbol: env.TOPUP_TOKEN_SYMBOL?.trim() || "TOKEN",
    decimals,
    creditsPerToken,
    swap: swapConfig(env),
  };
}

// Paying with ETH needs the KreditSwapBuy address; the pool fee tier and the
// cap default to what the contract is deployed with.
export function swapConfig(env: Record<string, string | undefined> = process.env): SwapConfig | null {
  const address = env.TOPUP_SWAP_ADDRESS;
  if (!isAddress(address)) return null;
  const poolFee = Number(env.TOPUP_POOL_FEE ?? 3000);
  const maxCreditsPerBuy = Number(env.TOPUP_MAX_CREDITS_PER_BUY ?? 100_000);
  if (!(POOL_FEES as readonly number[]).includes(poolFee)) return null;
  if (!(maxCreditsPerBuy > 0)) return null;
  return {
    address: address.toLowerCase(),
    router: UNISWAP_MAINNET.swapRouter02,
    quoter: UNISWAP_MAINNET.quoterV2,
    weth: UNISWAP_MAINNET.weth,
    poolFee,
    maxCreditsPerBuy,
  };
}

export type ReceiptLog = { address: string; topics: readonly string[]; data: string };

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const topicAddress = (topic: string) => `0x${topic.slice(-40)}`.toLowerCase();

// How many base units of `token` moved from `payer` to `treasury` in these logs.
// Anything else in the transaction (other tokens, other senders) counts for nothing.
export function paymentIn(logs: readonly ReceiptLog[], want: { token: string; treasury: string; payer: string }) {
  let total = BigInt(0);
  for (const log of logs) {
    if (log.address.toLowerCase() !== want.token.toLowerCase()) continue;
    if (log.topics.length !== 3 || log.topics[0].toLowerCase() !== TRANSFER_TOPIC) continue;
    if (topicAddress(log.topics[1]) !== want.payer.toLowerCase()) continue;
    if (topicAddress(log.topics[2]) !== want.treasury.toLowerCase()) continue;
    total += BigInt(log.data);
  }
  return total;
}

// keccak256("Purchased(address,address,uint256,uint256,uint256)")
const PURCHASED_TOPIC = "0xb362243af1e2070d7d5bf8d713f2e0fab64203f1b71462afbe20572909788c5e";
const word = (data: string, index: number) => BigInt(`0x${data.slice(2 + index * 64, 2 + (index + 1) * 64)}`);

export type Purchase = { ethIn: bigint; amount: bigint; credits: bigint };

// The purchase the swap contract recorded for `buyer` in these logs: how much
// ETH went in, how many base units of `token` reached the treasury, and the
// credits the contract says that bought. Anything else (other contracts, other
// buyers, other tokens) counts for nothing. One transaction holds at most one
// purchase per buyer, so the first match wins.
export function purchaseIn(logs: readonly ReceiptLog[], want: { swap: string; token: string; buyer: string }): Purchase | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== want.swap.toLowerCase()) continue;
    if (log.topics.length !== 3 || log.topics[0].toLowerCase() !== PURCHASED_TOPIC) continue;
    if (topicAddress(log.topics[1]) !== want.buyer.toLowerCase()) continue;
    if (topicAddress(log.topics[2]) !== want.token.toLowerCase()) continue;
    if (log.data.length !== 2 + 3 * 64) continue;
    return { ethIn: word(log.data, 0), amount: word(log.data, 1), credits: word(log.data, 2) };
  }
  return null;
}

// Whole credits only, rounded down: a payment never buys more than it paid for.
export function creditsForPayment(amount: bigint, config: Pick<TopUpConfig, "decimals" | "creditsPerToken">) {
  // The price may be fractional (e.g. 2.5 credits per token), so scale it to an integer first.
  const PRICE_SCALE = 1_000_000;
  const price = BigInt(Math.round(config.creditsPerToken * PRICE_SCALE));
  const credits = (amount * price) / (BigInt(10) ** BigInt(config.decimals) * BigInt(PRICE_SCALE));
  return credits > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(credits);
}

// "12.5" -> base units. Returns null for anything that is not a plain positive decimal.
export function parseTokenAmount(text: string, decimals: number) {
  const match = /^(\d{1,30})(?:\.(\d+))?$/.exec(text.trim());
  if (!match || (match[2]?.length ?? 0) > decimals) return null;
  const units = BigInt(match[1] + (match[2] ?? "").padEnd(decimals, "0"));
  return units > BigInt(0) ? units : null;
}

export function formatTokenAmount(units: bigint, decimals: number, maxFraction = 4) {
  const base = BigInt(10) ** BigInt(decimals);
  const whole = (units / base).toLocaleString("en-US");
  const fraction = (units % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
