"use client";

import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { Address } from "viem";
import { createSiweMessage } from "viem/siwe";

const SESSION_KEY = ["session"];

type Session = { address: Address | null };

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

const fetchSession = async () => (await (await fetch("/api/auth/me")).json()) as Session;

// How RainbowKit's "verify your wallet" step talks to our sign-in endpoints.
// `onSignedIn` runs once the server has accepted the signature.
export function sessionAdapter(queryClient: QueryClient, onSignedIn: () => void) {
  return createAuthenticationAdapter({
    getNonce: async () => (await (await fetch("/api/auth/nonce")).json()).nonce,
    createMessage: ({ nonce, address, chainId }) =>
      createSiweMessage({
        address,
        chainId,
        nonce,
        domain: window.location.host,
        uri: window.location.origin,
        version: "1",
        statement: "Sign in to Kredit. This proves you own this wallet and costs no gas.",
      }),
    verify: async ({ message, signature }) => {
      try {
        queryClient.setQueryData(SESSION_KEY, await post("/api/auth/verify", { message, signature }));
        onSignedIn();
        return true;
      } catch {
        return false;
      }
    },
    signOut: async () => {
      await post("/api/auth/logout");
      queryClient.setQueryData(SESSION_KEY, { address: null });
    },
  });
}

export function useSession() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const session = useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession });

  const signOut = useMutation({
    mutationFn: () => post("/api/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(SESSION_KEY, { address: null });
      router.push("/");
      router.refresh();
    },
  });

  return { address: session.data?.address ?? null, isLoading: session.isLoading, signOut };
}
