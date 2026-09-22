import type { Network } from "./networks.ts";
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
  value?: string; // wei the transaction sent along
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
      `${network.name} scanning isn't set up yet: its explorer blocks server requests. Set an Alchemy RPC (see .env.example).`,
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
        valueWei: typeof item.value === "string" ? item.value : undefined,
      });
    }
    cursor = result.next_page_params;
    if (!cursor) break;
  }

  return { txs, truncated };
}
