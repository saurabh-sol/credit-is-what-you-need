import { scanAddress } from "./explorer.ts";
import type { Network } from "./networks.ts";
import { getEthUsdCentsOrNull } from "./price.ts";
import { buildReceipt } from "./scoring.ts";

const CACHE_MS = 60_000;
const cache = new Map<string, { expires: number; value: Awaited<ReturnType<typeof load>> }>();

async function load(network: Network, address: string) {
  const [{ txs, truncated }, ethUsdCents] = await Promise.all([
    scanAddress(network, address),
    getEthUsdCentsOrNull(),
  ]);
  // The price is kept with the scan so the claim pays what the receipt showed.
  return { receipt: buildReceipt(txs, network.partners, ethUsdCents), truncated, ethUsdCents };
}

// A scan costs several explorer requests, so reuse it for a minute. Claiming
// right after scanning then pays out exactly what the receipt showed.
export async function scanRecord(network: Network, address: string) {
  const key = `${network.id}:${address.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await load(network, address);
  cache.set(key, { expires: Date.now() + CACHE_MS, value });
  return value;
}
