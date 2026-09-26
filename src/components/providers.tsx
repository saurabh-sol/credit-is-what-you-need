"use client";

import { PrivyProvider, useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet, WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WagmiProvider as PlainWagmiProvider } from "wagmi";
import { PRIVY_APP_ID, privyConfig } from "@/lib/privy";
import { post, SESSION_KEY, useSession, type Session } from "@/lib/use-session";
import { config } from "@/lib/wagmi";

// Keeps the server session in step with the Privy login.
//
// Privy says who the person is; the server only trusts that once it has seen
// Privy's access token, so after a login (or on a return visit whose cookie
// has expired) the token and the wallet address go to /api/auth/privy, which
// answers with the session cookie. Signing out of Kredit also signs out of
// Privy, and a Privy logout elsewhere ends the Kredit session here.
function SessionBridge({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const privy = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const session = useSession();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const fresh = useRef(false);

  // A login that just happened leads to the dashboard, unless the person was
  // signing in to keep using the page they are on.
  useLogin({
    onComplete: ({ wasAlreadyAuthenticated }) => {
      if (!wasAlreadyAuthenticated) fresh.current = true;
    },
  });

  // Privy's wallet list includes the embedded wallet once it exists, which for
  // a brand-new email user is a moment after login. The first wallet in the
  // list is the one Privy considers current.
  const wallet = wallets[0]?.address ?? null;

  useEffect(() => {
    if (!privy.ready || session.isLoading || busy.current) return;

    if (privy.authenticated && !session.address && wallet) {
      busy.current = true;
      (async () => {
        const token = await privy.getAccessToken();
        if (!token) throw new Error("Privy gave no access token");
        const data = (await post("/api/auth/privy", { token, address: wallet })) as Session;
        queryClient.setQueryData(SESSION_KEY, data);
        setError(null);
        if (fresh.current) {
          fresh.current = false;
          const { pathname } = window.location;
          const staysHere = pathname === "/playground" || pathname === "/docs" || pathname.startsWith("/docs/");
          if (!staysHere) router.push("/dashboard");
        }
      })()
        .catch((caught: Error) => setError(caught.message))
        .finally(() => {
          busy.current = false;
        });
      return;
    }

    if (!privy.authenticated && session.address) {
      // Privy was signed out (another tab, or the login expired): end the
      // server session too, so the two never disagree about who this is.
      busy.current = true;
      post("/api/auth/logout")
        .then(() => queryClient.setQueryData(SESSION_KEY, { address: null }))
        .catch(() => {})
        .finally(() => {
          busy.current = false;
        });
    }
  }, [privy, privy.ready, privy.authenticated, wallet, session.address, session.isLoading, queryClient, router]);

  // Transactions must come from the signed-in address, so that wallet is the
  // active one for wagmi whenever Privy has it connected.
  useEffect(() => {
    if (!session.address) return;
    const match = wallets.find((candidate) => candidate.address.toLowerCase() === session.address!.toLowerCase());
    if (match && wallet && match.address !== wallet) setActiveWallet(match);
  }, [session.address, wallets, wallet, setActiveWallet]);

  return (
    <>
      {error && (
        <p role="alert" className="fixed inset-x-0 top-16 z-50 mx-auto w-fit rounded-full border border-line bg-surface px-4 py-2 text-sm text-fog shadow">
          Sign-in did not finish: {error}
        </p>
      )}
      {children}
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // Without an app id (a build or a dev server with no NEXT_PUBLIC_PRIVY_APP_ID)
  // the site still renders; only signing in is off. Privy's hooks answer with
  // "not ready" outside its provider, and the sign-in button says so.
  if (!PRIVY_APP_ID) {
    return (
      <QueryClientProvider client={queryClient}>
        <PlainWagmiProvider config={config}>{children}</PlainWagmiProvider>
      </QueryClientProvider>
    );
  }

  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>
          <SessionBridge>{children}</SessionBridge>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
