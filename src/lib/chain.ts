import { createPublicClient, http } from "viem";
import { robinhood } from "viem/chains";
import type { NetworkId } from "./networks.ts";

// Read-only access to Robinhood Chain from the server. The RPC can be swapped
// for a private one (or a local anvil in tests) through the environment:
// RPC_MAINNET is server-only, NEXT_PUBLIC_RPC_MAINNET is shared with the browser.
export function rpcUrl(network: NetworkId = "mainnet"): string | undefined {
  void network; // one network today; the parameter keeps call sites explicit
  return process.env.RPC_MAINNET || process.env.NEXT_PUBLIC_RPC_MAINNET || undefined;
}

export const chains = {
  mainnet: { chain: robinhood, rpc: rpcUrl("mainnet") },
} satisfies Record<NetworkId, { chain: typeof robinhood; rpc: string | undefined }>;

const clients = new Map<NetworkId, ReturnType<typeof createPublicClient>>();

export function publicClient(network: NetworkId) {
  let client = clients.get(network);
  if (!client) {
    const { chain, rpc } = chains[network];
    client = createPublicClient({ chain, transport: http(rpc || undefined) });
    clients.set(network, client);
  }
  return client;
}
