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
  // The browser talks to the chains' public RPCs. The private RPC (Alchemy,
  // for the record scanner's index) stays on the server: shipping its key to
  // browsers spends its quota on every page view and breaks every read on the
  // site when the quota runs out.
  transports: {
    [robinhood.id]: http(),
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
