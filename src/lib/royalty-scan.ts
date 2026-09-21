import { scanContractCalls } from "./explorer.ts";
import { listContracts, markChecked, paidRoyaltyHashes, rememberContracts, type ContractUsage } from "./ledger.ts";
import type { Network } from "./networks.ts";
import { getEthUsdCents } from "./price.ts";
import { scanRecord } from "./record.ts";

const MAX_CONTRACTS = 60; // per scan; the rest wait for the next one
const PARALLEL = 6;
const CACHE_MS = 60_000;

export const ROYALTIES_OFF =
  "Builder Royalties are paid on mainnet only. Testnet gas is free, so there is nothing to share.";

type RoyaltyScan = { usage: ContractUsage[]; ethUsdCents: bigint; skippedContracts: number };
const cache = new Map<string, { expires: number; value: RoyaltyScan }>();

// Finds the contracts this wallet deployed (from its record, plus any remembered
// from earlier scans) and reads the calls other people made to them.
export async function scanRoyalties(network: Network, builder: string): Promise<RoyaltyScan> {
  const key = `${network.id}:${builder.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const [{ receipt }, ethUsdCents] = await Promise.all([scanRecord(network, builder), getEthUsdCents()]);
  rememberContracts(builder, network.id, receipt.tasks);

  const contracts = listContracts(builder, network.id);
  const batch = contracts.slice(0, MAX_CONTRACTS).map((contract) => contract.address);
  const usage: ContractUsage[] = [];
  for (let i = 0; i < batch.length; i += PARALLEL) {
    const group = batch.slice(i, i + PARALLEL);
    const results = await Promise.all(
      group.map((contract) =>
        scanContractCalls(network, contract, (hashes) => paidRoyaltyHashes(network.id, hashes)),
      ),
    );
    group.forEach((contract, index) => usage.push({ contract, calls: results[index] }));
  }
  markChecked(network.id, batch);

  const value = { usage, ethUsdCents, skippedContracts: Math.max(0, contracts.length - MAX_CONTRACTS) };
  for (const [stale, entry] of cache) if (entry.expires <= Date.now()) cache.delete(stale);
  cache.set(key, { expires: Date.now() + CACHE_MS, value });
  return value;
}

export const forgetRoyaltyScan = (network: Network, builder: string) =>
  cache.delete(`${network.id}:${builder.toLowerCase()}`);
