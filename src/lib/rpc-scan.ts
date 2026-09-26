import { createPublicClient, http, type Address, type Hash, type Transport } from "viem";
import { chains, rpcUrl } from "./chain.ts";
import { ExplorerError } from "./explorer.ts";
import type { Network } from "./networks.ts";
import type { ScannedTx } from "./scoring.ts";

// Reads a wallet's history straight from an Alchemy RPC instead of the
// explorer. Alchemy indexes every transaction a wallet sent
// (alchemy_getAssetTransfers, with zero-value calls and contract deployments
// included), and the chain itself supplies the rest: status, fee, the deployed
// contract, the called method, and whether the target is a contract.

export const MAX_TXS = 1_000; // same window as the explorer scan
const PAGE_SIZE = 1_000;
const BATCH_SIZE = 50; // JSON-RPC calls per HTTP request
const TIMEOUT_MS = 20_000;

type Transfer = {
  hash: Hash;
  blockNum: `0x${string}`;
  metadata?: { blockTimestamp?: string };
};
type TransfersPage = { transfers: Transfer[]; pageKey?: string };

// Names for the most common 4-byte selectors, so a task reads "swap on ..."
// rather than "contract call". Anything else falls back to the raw selector,
// which the scorer shows as a plain contract call.
const METHODS: Record<string, string> = {
  "0xa9059cbb": "transfer",
  "0x095ea7b3": "approve",
  "0x23b872dd": "transferFrom",
  "0x42842e0e": "safeTransferFrom",
  "0xb88d4fde": "safeTransferFrom",
  "0xa22cb465": "setApprovalForAll",
  "0x40c10f19": "mint",
  "0x1249c58b": "mint",
  "0x6a627842": "mint",
  "0xa0712d68": "mint",
  "0x42966c68": "burn",
  "0xd0e30db0": "deposit",
  "0xb6b55f25": "deposit",
  "0x2e1a7d4d": "withdraw",
  "0x3ccfd60b": "withdraw",
  "0x4e71d92d": "claim",
  "0x379607f5": "claim",
  "0xa694fc3a": "stake",
  "0x2e17de78": "unstake",
  "0x38ed1739": "swap",
  "0x7ff36ab5": "swap",
  "0x18cbafe5": "swap",
  "0x414bf389": "swap",
  "0xc04b8d59": "swap",
  "0x04e45aaf": "swap",
  "0x3593564c": "swap",
  "0x5ae401dc": "multicall",
  "0xac9650d8": "multicall",
  "0xe8e33700": "addLiquidity",
  "0xf305d719": "addLiquidity",
  "0xbaa2abde": "removeLiquidity",
  "0x2f2ff15d": "grantRole",
  "0xf2fde38b": "transferOwnership",
};

export function methodName(input: string | undefined) {
  if (!input || input.length < 10) return null; // plain transfer, no calldata
  const selector = input.slice(0, 10).toLowerCase();
  return METHODS[selector] ?? selector;
}

// Alchemy hosts the only sender index we can reach for mainnet; other RPCs
// don't answer alchemy_* calls, so those networks keep using the explorer.
export function hasAlchemyIndex(network: Network["id"]) {
  return /alchemy\.com/i.test(rpcUrl(network) ?? "");
}

export type RpcScan = {
  txs: ScannedTx[];
  truncated: boolean;
  // Transactions the wallet sent that the index hasn't caught up with yet.
  // Usually the last few seconds of activity; they show on the next scan.
  unindexed: number;
};

const codeCache = new Map<string, boolean>(); // "network:address" -> is a contract

function scanClient(network: Network["id"], transport?: Transport) {
  return createPublicClient({
    chain: chains[network].chain,
    transport: transport ?? http(rpcUrl(network), { batch: { batchSize: BATCH_SIZE }, timeout: TIMEOUT_MS }),
  });
}

async function inChunks<T, R>(items: T[], size: number, run: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map(run))));
  }
  return results;
}

// `transport` lets tests feed a fake RPC (viem's `custom`).
export async function scanAddressRpc(network: Network, address: string, transport?: Transport): Promise<RpcScan> {
  const client = scanClient(network.id, transport);
  const wallet = address.toLowerCase() as Address;

  try {
    // 1. Every transaction the wallet sent, newest first, straight from the index.
    const seen = new Map<Hash, string>(); // hash -> ISO timestamp
    let pageKey: string | undefined;
    let truncated = false;
    do {
      const page = (await client.request({
        method: "alchemy_getAssetTransfers" as never,
        params: [
          {
            fromBlock: "0x0",
            toBlock: "latest",
            fromAddress: wallet,
            category: ["external"],
            excludeZeroValue: false, // contract calls and deployments carry no value
            withMetadata: true,
            order: "desc",
            maxCount: `0x${PAGE_SIZE.toString(16)}`,
            ...(pageKey && { pageKey }),
          },
        ] as never,
      })) as TransfersPage;
      for (const transfer of page.transfers) {
        if (seen.size >= MAX_TXS) {
          truncated = true;
          break;
        }
        if (!seen.has(transfer.hash)) seen.set(transfer.hash, transfer.metadata?.blockTimestamp ?? "");
      }
      pageKey = truncated ? undefined : page.pageKey;
    } while (pageKey);

    // 2. What happened in each: status, fee, and the contract it deployed.
    const hashes = [...seen.keys()];
    const details = await inChunks(hashes, BATCH_SIZE, async (hash) => {
      const [tx, receipt] = await Promise.all([
        client.getTransaction({ hash }),
        client.getTransactionReceipt({ hash }).catch(() => null), // null while pending
      ]);
      return { hash, tx, receipt };
    });

    // 3. Which targets are contracts (remembered across scans; code rarely changes).
    const targets = [...new Set(details.map(({ tx }) => tx.to?.toLowerCase()).filter((to): to is Address => !!to))];
    const unknown = targets.filter((to) => !codeCache.has(`${network.id}:${to}`));
    await inChunks(unknown, BATCH_SIZE, async (to) => {
      const code = await client.getCode({ address: to });
      codeCache.set(`${network.id}:${to}`, !!code && code !== "0x");
    });

    const txs: ScannedTx[] = [];
    for (const { hash, tx, receipt } of details) {
      if (!receipt || tx.from.toLowerCase() !== wallet) continue;
      const to = tx.to?.toLowerCase() ?? null;
      txs.push({
        hash,
        timestamp: seen.get(hash) || new Date().toISOString(),
        ok: receipt.status === "success",
        to,
        toIsContract: to ? (codeCache.get(`${network.id}:${to}`) ?? false) : false,
        toName: (to && network.partners[to]?.name) ?? null,
        method: methodName(tx.input),
        createdContract: receipt.contractAddress?.toLowerCase() ?? null,
        feeWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
        valueWei: tx.value.toString(),
      });
    }

    // The nonce says how many transactions the wallet has really sent.
    const nonce = truncated ? txs.length : await client.getTransactionCount({ address: wallet });
    return { txs, truncated, unindexed: Math.max(0, nonce - txs.length) };
  } catch (error) {
    if (error instanceof ExplorerError) throw error;
    // Alchemy answers every call with a 429 once the month's quota is spent;
    // say so instead of "unknown RPC error".
    const text = error instanceof Error ? `${error.message}\n${(error as { details?: string }).details ?? ""}` : "";
    if (/capacity limit|\b429\b/i.test(text)) {
      throw new ExplorerError(
        `${network.name} scanning is paused: the chain index (Alchemy) has used its monthly quota. It comes back when the quota resets or the plan is upgraded.`,
      );
    }
    const detail = error instanceof Error ? error.message.split("\n")[0] : "";
    throw new ExplorerError(`Could not read ${network.name} right now. Try again in a moment.${detail ? ` (${detail})` : ""}`);
  }
}
