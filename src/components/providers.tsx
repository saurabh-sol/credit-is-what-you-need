"use client";

import { darkTheme, RainbowKitAuthenticationProvider, RainbowKitProvider, type Theme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { WagmiProvider } from "wagmi";
import { sessionAdapter, useSession } from "@/lib/use-session";
import { config } from "@/lib/wagmi";

// RainbowKit's dark theme, moved onto our palette and typeface so its dialogs
// look like the rest of the site.
const base = darkTheme({ accentColor: "#c6f432", accentColorForeground: "#0b0f0c", borderRadius: "large", overlayBlur: "small" });
const theme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    modalBackground: "#111713",
    modalBorder: "#263228",
    modalText: "#e9f0e6",
    modalTextSecondary: "#8fa08f",
    modalTextDim: "#8fa08f",
    generalBorder: "#263228",
    generalBorderDim: "#263228",
    menuItemBackground: "#182019",
    actionButtonSecondaryBackground: "#182019",
    closeButtonBackground: "#182019",
    closeButton: "#8fa08f",
    profileForeground: "#182019",
    modalBackdrop: "rgb(0 0 0 / 0.7)",
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
        const staysHere = ["/playground", "/docs"].includes(window.location.pathname);
        if (!staysHere) router.push("/dashboard");
      }),
    [queryClient, router],
  );
  const status = session.isLoading ? "loading" : session.address ? "authenticated" : "unauthenticated";

  return (
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      <RainbowKitProvider theme={theme} modalSize="compact" appInfo={{ appName: "Kredit" }}>
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
