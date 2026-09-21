import { createConfig, http } from "wagmi";
import { base, robinhood, robinhoodTestnet } from "wagmi/chains";
import { baseAccount, injected } from "wagmi/connectors";

// Credits are only earned on Robinhood Chain. Base is listed so Base Account
// (a smart wallet that lives on Base) can connect and sign in.
export const config = createConfig({
  chains: [robinhoodTestnet, robinhood, base],
  connectors: [injected(), baseAccount({ appName: "Fuel" })],
  // Optional private RPCs (e.g. Alchemy). Without them the public RPCs are used.
  transports: {
    [robinhoodTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_TESTNET),
    [robinhood.id]: http(process.env.NEXT_PUBLIC_RPC_MAINNET),
    [base.id]: http(),
  },
  ssr: true,
});

export const rewardChains = [robinhoodTestnet, robinhood] as const;

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
