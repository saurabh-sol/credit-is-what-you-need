import { scanAddress } from "./explorer.ts";
import type { Network } from "./networks.ts";
import { hasAlchemyIndex, scanAddressRpc } from "./rpc-scan.ts";
import { receiptsConfig } from "./receipts.ts";
import { buildReceipt, type ScannedTx } from "./scoring.ts";

const CACHE_MS = 60_000;
const cache = new Map<string, { expires: number; value: Awaited<ReturnType<typeof load>> }>();

// Where a wallet's history comes from: the RPC's own index when the network
// runs on Alchemy (the public mainnet explorer blocks servers), otherwise the
// Blockscout explorer.
export async function scanWallet(network: Network, address: string) {
  if (hasAlchemyIndex(network.id)) return scanAddressRpc(network, address);
  const { txs, truncated } = await scanAddress(network, address);
  return { txs, truncated, unindexed: 0 };
}

// Calls to the KreditReceipts contract are how credits get claimed; they are
// not work Kredit pays for, or every claim would fund the next one.
export const isOwnContractCall = (tx: ScannedTx, contract: string | undefined) =>
  Boolean(contract) && tx.to?.toLowerCase() === contract;

async function load(network: Network, address: string) {
  const { txs, truncated, unindexed } = await scanWallet(network, address);
  const own = receiptsConfig(network.id)?.contract;
  const scored = txs.filter((tx) => !isOwnContractCall(tx, own));
  // `txs` (every transaction, failed ones too) is what the wallet-age rule reads.
  return { receipt: buildReceipt(scored, network.partners), truncated, unindexed, txs };
}

// A scan costs several requests, so reuse it for a minute. Claiming right
// after scanning then pays out exactly what the receipt showed.
export async function scanRecord(network: Network, address: string) {
  const key = `${network.id}:${address.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await load(network, address);
  for (const [stale, entry] of cache) if (entry.expires <= Date.now()) cache.delete(stale);
  cache.set(key, { expires: Date.now() + CACHE_MS, value });
  return value;
}
