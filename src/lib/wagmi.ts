import { createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { base, robinhood } from "wagmi/chains";

// wagmi is kept for what it does well: contract reads and writes from the
// components (top-up, on-chain claim). Wallets themselves come from Privy, so
// there are no connectors here; @privy-io/wagmi feeds Privy's wallets in.
//
// Credits are only earned on Robinhood Chain. Base is listed so a wallet that
// lives there can still connect and sign in.
export const config = createConfig({
  chains: [robinhood, base],
  // Optional private RPCs (e.g. Alchemy). Without them the public RPCs are used.
  transports: {
    [robinhood.id]: http(process.env.NEXT_PUBLIC_RPC_MAINNET),
    [base.id]: http(),
  },
  ssr: true,
});

export const rewardChains = [robinhood] as const;

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
