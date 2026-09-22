import { createPublicClient, http } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";
import type { NetworkId } from "./networks.ts";

// Read-only access to Robinhood Chain from the server. The RPC can be swapped
// for a private one (or a local anvil in tests) through the environment:
// RPC_* is server-only, NEXT_PUBLIC_RPC_* is shared with the browser.
export function rpcUrl(network: NetworkId): string | undefined {
  return network === "mainnet"
    ? process.env.RPC_MAINNET || process.env.NEXT_PUBLIC_RPC_MAINNET || undefined
    : process.env.RPC_TESTNET || process.env.NEXT_PUBLIC_RPC_TESTNET || undefined;
}

export const chains = {
  testnet: { chain: robinhoodTestnet, rpc: rpcUrl("testnet") },
  mainnet: { chain: robinhood, rpc: rpcUrl("mainnet") },
} satisfies Record<NetworkId, { chain: typeof robinhood | typeof robinhoodTestnet; rpc: string | undefined }>;

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
