import { scanAddress } from "./explorer.ts";
import type { Network } from "./networks.ts";
import { buildReceipt } from "./scoring.ts";

const CACHE_MS = 60_000;
const cache = new Map<string, { expires: number; value: Awaited<ReturnType<typeof load>> }>();

async function load(network: Network, address: string) {
  const { txs, truncated } = await scanAddress(network, address);
  return { receipt: buildReceipt(txs, network.partners), truncated };
}

// A scan costs several explorer requests, so reuse it for a minute. Claiming
// right after scanning then pays out exactly what the receipt showed.
export async function scanRecord(network: Network, address: string) {
  const key = `${network.id}:${address.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await load(network, address);
  for (const [stale, entry] of cache) if (entry.expires <= Date.now()) cache.delete(stale);
  cache.set(key, { expires: Date.now() + CACHE_MS, value });
  return value;
}
