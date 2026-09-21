import { isNetworkId, type NetworkId } from "./networks.ts";

// Buying credits with the project's own token. The user sends tokens straight
// to the treasury; the server then reads the transaction's receipt and credits
// what it can prove. Pure logic lives here so the money rules are easy to test.

export type TopUpConfig = {
  network: NetworkId;
  token: string; // lowercase ERC-20 address
  treasury: string; // lowercase address that receives payments
  symbol: string;
  decimals: number;
  creditsPerToken: number;
};

const isAddress = (value: string | undefined): value is string => /^0x[0-9a-fA-F]{40}$/.test(value ?? "");

// Top-ups stay switched off until the token, the treasury and a price are set.
export function topUpConfig(env: Record<string, string | undefined> = process.env): TopUpConfig | null {
  const token = env.TOPUP_TOKEN_ADDRESS;
  const treasury = env.TOPUP_TREASURY_ADDRESS;
  const creditsPerToken = Number(env.TOPUP_CREDITS_PER_TOKEN);
  const decimals = Number(env.TOPUP_TOKEN_DECIMALS ?? 18);
  const network = env.TOPUP_NETWORK ?? "mainnet";
  if (!isAddress(token) || !isAddress(treasury) || !isNetworkId(network)) return null;
  if (!(creditsPerToken > 0) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  return {
    network,
    token: token.toLowerCase(),
    treasury: treasury.toLowerCase(),
    symbol: env.TOPUP_TOKEN_SYMBOL?.trim() || "TOKEN",
    decimals,
    creditsPerToken,
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
