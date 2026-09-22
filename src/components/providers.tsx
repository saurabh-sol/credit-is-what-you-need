"use client";

import { lightTheme, RainbowKitAuthenticationProvider, RainbowKitProvider, type Theme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { WagmiProvider } from "wagmi";
import { sessionAdapter, useSession } from "@/lib/use-session";
import { config } from "@/lib/wagmi";

// RainbowKit's light theme, moved onto our palette and typeface so its dialogs
// look like the rest of the site. The colours are the tokens from globals.css,
// so a rebrand there carries over; the main button is black, like ours.
const base = lightTheme({
  accentColor: "var(--color-fog)",
  accentColorForeground: "var(--color-ink)",
  borderRadius: "large",
  overlayBlur: "small",
});
const theme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    modalBackground: "var(--color-surface)",
    modalBorder: "var(--color-line)",
    modalText: "var(--color-fog)",
    modalTextSecondary: "var(--color-mist)",
    modalTextDim: "var(--color-mist)",
    generalBorder: "var(--color-line)",
    generalBorderDim: "var(--color-line)",
    menuItemBackground: "var(--color-raised)",
    actionButtonSecondaryBackground: "var(--color-raised)",
    closeButtonBackground: "var(--color-raised)",
    closeButton: "var(--color-mist)",
    profileForeground: "var(--color-raised)",
    modalBackdrop: "rgb(2 1 0 / 0.45)",
  },
  fonts: { body: "var(--font-geist-sans), system-ui, sans-serif" },
};

// Connecting a wallet and proving it is yours are one flow: RainbowKit asks for
// the signature right after the wallet connects, through our sign-in endpoints.
function WalletKit({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const session = useSession();

  const adapter = useMemo(
    () =>
      sessionAdapter(queryClient, () => {
        // Signing in leads to the dashboard, unless the wallet was connected to
        // use the page the visitor is already on.
        const { pathname } = window.location;
        const staysHere = pathname === "/playground" || pathname === "/docs" || pathname.startsWith("/docs/");
        if (!staysHere) router.push("/dashboard");
      }),
    [queryClient, router],
  );
  const status = session.isLoading ? "loading" : session.address ? "authenticated" : "unauthenticated";

  return (
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      {/* "wide": the wallet list beside RainbowKit's "What is a Wallet?" panel, with
          a Get a Wallet link for visitors who have none. */}
      <RainbowKitProvider theme={theme} modalSize="wide" appInfo={{ appName: "Kredit" }}>
        {children}
      </RainbowKitProvider>
    </RainbowKitAuthenticationProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WalletKit>{children}</WalletKit>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
