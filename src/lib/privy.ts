import type { PrivyClientConfig } from "@privy-io/react-auth";
import { base, robinhood } from "wagmi/chains";

// The Privy app that signs people in. Public: it is baked into the browser
// bundle. The matching secret (PRIVY_APP_SECRET) stays on the server.
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

// One dialog for everyone: an email code, Google, or a wallet they already
// have. Someone who arrives without a wallet gets an embedded one, made by
// Privy at sign-up, and that address is their Kredit account.
export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "google", "wallet"],
  appearance: {
    theme: "light",
    accentColor: "#c2410c",
    walletChainType: "ethereum-only",
    showWalletLoginFirst: false,
  },
  embeddedWallets: {
    ethereum: { createOnLogin: "users-without-wallets" },
    showWalletUIs: true,
  },
  supportedChains: [robinhood, base],
  defaultChain: robinhood,
};
