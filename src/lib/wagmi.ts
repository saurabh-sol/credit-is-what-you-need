import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  imTokenWallet,
  injectedWallet,
  ledgerWallet,
  metaMaskWallet,
  okxWallet,
  omniWallet,
  rabbyWallet,
  rainbowWallet,
  safeWallet,
  trustWallet,
  uniswapWallet,
  walletConnectWallet,
  zerionWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { base, robinhood } from "wagmi/chains";

// From https://cloud.reown.com. Wallets that pair by QR code or deep link
// (Rainbow, Trust, Ledger, WalletConnect itself) cannot be created without it.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// The smart wallet and the Coinbase Wallet app both sit behind this one entry.
coinbaseWallet.preference = "all";

// The wallet list, in the order people see it. Wallets installed in the browser
// are detected and listed on their own, above these groups.
const groups = projectId
  ? [
      { groupName: "Popular", wallets: [rainbowWallet, coinbaseWallet, metaMaskWallet, walletConnectWallet] },
      {
        groupName: "More",
        wallets: [
          trustWallet,
          rabbyWallet,
          okxWallet,
          zerionWallet,
          uniswapWallet,
          omniWallet,
          imTokenWallet,
          ledgerWallet,
          safeWallet,
          injectedWallet,
        ],
      },
    ]
  : // Without a project ID, only wallets that need no pairing service. Anything else would throw on load.
    [{ groupName: "Popular", wallets: [injectedWallet, coinbaseWallet] }];

const connectors = connectorsForWallets(groups, { appName: "Kredit", projectId: projectId ?? "unset" });

// Credits are only earned on Robinhood Chain. Base is listed so a Coinbase smart
// wallet (which lives on Base) can connect and sign in.
export const config = createConfig({
  chains: [robinhood, base],
  connectors,
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
