import type { Network } from "./networks.ts";
import type { ContractCall } from "./royalties.ts";
import type { ScannedTx } from "./scoring.ts";

const PAGE_LIMIT = 20; // Blockscout returns 50 per page, so up to 1,000 transactions
const TIMEOUT_MS = 15_000;

export class ExplorerError extends Error {}

type BlockscoutTx = {
  hash: string;
  from: { hash: string };
  timestamp: string;
  status: "ok" | "error" | null;
  to: { hash: string; is_contract: boolean; name: string | null } | null;
  method: string | null;
  created_contract: { hash: string } | null;
  fee: { value: string | null } | null;
};

type Page = { items: BlockscoutTx[]; next_page_params: Record<string, unknown> | null };

async function fetchPage(
  network: Network,
  address: string,
  direction: "from" | "to",
  cursor: Page["next_page_params"],
) {
  const url = new URL(`${network.explorerApi}/addresses/${address}/transactions`);
  url.searchParams.set("filter", direction);
  for (const [key, value] of Object.entries(cursor ?? {})) {
    if (key !== "filter") url.searchParams.set(key, String(value));
  }
  if (process.env.BLOCKSCOUT_API_KEY) url.searchParams.set("apikey", process.env.BLOCKSCOUT_API_KEY);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ExplorerError(`Could not reach the ${network.name} explorer. Try again in a moment.`);
  }

  // A brand new wallet is simply unknown to the explorer.
  if (response.status === 404) return { items: [], next_page_params: null } satisfies Page;
  const isJson = response.headers.get("content-type")?.includes("application/json");
  if (response.status === 403) {
    // Bot protection on the public explorer. See .env.example for the fix.
    throw new ExplorerError(
      `${network.name} scanning isn't set up yet: its explorer blocks server requests. Use Testnet for now.`,
    );
  }
  if (!response.ok || !isJson) {
    throw new ExplorerError(
      `The ${network.name} explorer refused the request (HTTP ${response.status}).`,
    );
  }
  return (await response.json()) as Page;
}

export async function scanAddress(network: Network, address: string) {
  const txs: ScannedTx[] = [];
  let cursor: Page["next_page_params"] = null;
  let truncated = false;

  for (let page = 0; ; page++) {
    if (page === PAGE_LIMIT) {
      truncated = true;
      break;
    }
    const result: Page = await fetchPage(network, address, "from", cursor); // only what this wallet did itself
    for (const item of result.items) {
      if (item.status === null) continue; // still pending
      txs.push({
        hash: item.hash,
        timestamp: item.timestamp,
        ok: item.status === "ok",
        to: item.to?.hash ?? null,
        toIsContract: item.to?.is_contract ?? false,
        toName: item.to?.name ?? null,
        method: item.method,
        createdContract: item.created_contract?.hash ?? null,
        feeWei: item.fee?.value ?? "0",
      });
    }
    cursor = result.next_page_params;
    if (!cursor) break;
  }

  return { txs, truncated };
}

async function getJson<T>(network: Network, path: string): Promise<T | null> {
  const url = new URL(`${network.explorerApi}${path}`);
  if (process.env.BLOCKSCOUT_API_KEY) url.searchParams.set("apikey", process.env.BLOCKSCOUT_API_KEY);
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ExplorerError(`Could not reach the ${network.name} explorer. Try again in a moment.`);
  }
  if (response.status === 404 || response.status === 422) return null;
  if (!response.ok) throw new ExplorerError(`The ${network.name} explorer refused the request (HTTP ${response.status}).`);
  return (await response.json()) as T;
}

// Who deployed a contract, according to the explorer. A contract made by a
// factory reports the factory as its creator, so it never matches a wallet.
export async function getContractCreation(network: Network, contract: string) {
  const info = await getJson<{
    is_contract: boolean;
    creator_address_hash: string | null;
    creation_transaction_hash: string | null;
  }>(network, `/addresses/${contract}`);
  if (!info?.is_contract || !info.creator_address_hash || !info.creation_transaction_hash) return null;
  const tx = await getJson<{ timestamp: string }>(network, `/transactions/${info.creation_transaction_hash}`);
  return { creator: info.creator_address_hash, deployedAt: tx?.timestamp ?? new Date().toISOString() };
}

const CALL_PAGE_LIMIT = 10; // up to 500 calls per contract per scan

// Calls other wallets made to a contract, newest first. `isPaid` lets the scan
// stop early: once a page contains a call that already paid out, everything
// older was handled by an earlier claim.
export async function scanContractCalls(
  network: Network,
  contract: string,
  isPaid: (hashes: string[]) => Set<string>,
) {
  const calls: ContractCall[] = [];
  let cursor: Page["next_page_params"] = null;

  for (let page = 0; page < CALL_PAGE_LIMIT; page++) {
    const result: Page = await fetchPage(network, contract, "to", cursor);
    const settled = result.items.filter((item) => item.status !== null);
    for (const item of settled) {
      calls.push({
        hash: item.hash,
        from: item.from.hash,
        ok: item.status === "ok",
        feeWei: item.fee?.value ?? "0",
      });
    }
    cursor = result.next_page_params;
    if (!cursor || isPaid(settled.map((item) => item.hash)).size > 0) break;
  }
  return calls;
}
