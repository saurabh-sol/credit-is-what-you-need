"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { Address } from "viem";
import { createSiweMessage } from "viem/siwe";
import { useSignMessage } from "wagmi";

const SESSION_KEY = ["session"];

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

export function useSession() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { mutateAsync: signMessage } = useSignMessage();

  const session = useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      const response = await fetch("/api/auth/me");
      return (await response.json()) as { address: Address | null };
    },
  });

  const signIn = useMutation({
    mutationFn: async ({ address, chainId }: { address: Address; chainId: number }) => {
      const { nonce } = await (await fetch("/api/auth/nonce")).json();
      const message = createSiweMessage({
        address,
        chainId,
        nonce,
        domain: window.location.host,
        uri: window.location.origin,
        version: "1",
        statement:
          "Sign in to Kredit.This proves you own this wallet and costs no gas.",
      });
      const signature = await signMessage({ message });
      return post("/api/auth/verify", { message, signature });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(SESSION_KEY, data);
      // Signing in leads to the dashboard, unless the wallet was connected to
      // use the page the visitor is already on.
      const staysHere = ["/playground", "/docs"].includes(window.location.pathname);
      if (!staysHere) router.push("/dashboard");
    },
  });

  const signOut = useMutation({
    mutationFn: () => post("/api/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(SESSION_KEY, { address: null });
      router.push("/");
      router.refresh();
    },
  });

  return { address: session.data?.address ?? null, isLoading: session.isLoading, signIn, signOut };
}
