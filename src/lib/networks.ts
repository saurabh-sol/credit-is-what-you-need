import type { PartnerRegistry } from "./scoring.ts";

// Kredit runs on Robinhood Chain mainnet only. NetworkId stays a named type
// because ledger rows, claims and receipts all say which network they came from.
export type NetworkId = "mainnet";

export type Network = {
  id: NetworkId;
  name: string;
  explorerUrl: string;
  explorerApi: string;
  partners: PartnerRegistry;
};

// The explorer API can be overridden from the environment, e.g. to point at a
// keyed Blockscout endpoint or your own indexer. With an Alchemy RPC set, the
// scanner reads history from the chain instead (src/lib/rpc-scan.ts).
export const networks: Record<NetworkId, Network> = {
  mainnet: {
    id: "mainnet",
    name: "Robinhood Chain",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    explorerApi: process.env.EXPLORER_API_MAINNET ?? "https://robinhoodchain.blockscout.com/api/v2",
    partners: {},
  },
};

export const MAINNET = networks.mainnet;

export const isNetworkId = (value: unknown): value is NetworkId => value === "mainnet";
