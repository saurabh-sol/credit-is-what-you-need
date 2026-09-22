import { createPublicClient, http } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";
import type { NetworkId } from "./networks.ts";

// Read-only access to Robinhood Chain from the server. The RPC can be swapped
// for a private one (or a local anvil in tests) through the environment.
export const chains = {
  testnet: { chain: robinhoodTestnet, rpc: process.env.NEXT_PUBLIC_RPC_TESTNET },
  mainnet: { chain: robinhood, rpc: process.env.NEXT_PUBLIC_RPC_MAINNET },
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
