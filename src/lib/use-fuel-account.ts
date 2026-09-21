"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiKeyInfo, LedgerEntry } from "@/lib/ledger";

export const ACCOUNT_KEY = ["account"];

export type AccountResponse = {
  address: string;
  balance: number;
  keys: ApiKeyInfo[];
  activity: LedgerEntry[];
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const useFuelAccount = () =>
  useQuery({ queryKey: ACCOUNT_KEY, queryFn: () => api<AccountResponse>("/api/account") });
