import type { PartnerRegistry } from "./scoring.ts";

export type NetworkId = "testnet" | "mainnet";

export type Network = {
  id: NetworkId;
  name: string;
  explorerUrl: string;
  explorerApi: string;
  partners: PartnerRegistry;
};

// Explorer APIs can be overridden from the environment, e.g. to point mainnet
// at a keyed Blockscout endpoint or your own indexer.
export const networks: Record<NetworkId, Network> = {
  testnet: {
    id: "testnet",
    name: "Robinhood Chain Testnet",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    explorerApi:
      process.env.EXPLORER_API_TESTNET ?? "https://explorer.testnet.chain.robinhood.com/api/v2",
    partners: {
      // Demo partner: the index basket from the Arbitrum Foundation tutorial.
      "0xc1940d5fd58ce735a44a53f910852b12250f6a14": { name: "Index Basket (demo)", credits: 250 },
    },
  },
  mainnet: {
    id: "mainnet",
    name: "Robinhood Chain",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    explorerApi: process.env.EXPLORER_API_MAINNET ?? "https://robinhoodchain.blockscout.com/api/v2",
    partners: {},
  },
};

export const isNetworkId = (value: unknown): value is NetworkId =>
  value === "testnet" || value === "mainnet";
