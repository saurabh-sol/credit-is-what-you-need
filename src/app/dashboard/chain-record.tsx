"use client";

import { formatEther, type Address } from "viem";
import { useBalance, useTransactionCount } from "wagmi";
import { rewardChains } from "@/lib/wagmi";

// Live numbers straight from Robinhood Chain: a first look at the record
// the scanner will turn into credits.
export function ChainRecord({ address }: { address: Address }) {
  return (
    <section className="h-full rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-sm text-mist">Your Robinhood Chain record, live</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {rewardChains.map((chain) => (
          <ChainCard key={chain.id} address={address} chainId={chain.id} name={chain.name} />
        ))}
      </div>
    </section>
  );
}

function ChainCard({
  address,
  chainId,
  name,
}: {
  address: Address;
  chainId: (typeof rewardChains)[number]["id"];
  name: string;
}) {
  const txCount = useTransactionCount({ address, chainId });
  const balance = useBalance({ address, chainId });

  const show = (value: string | undefined, query: { isError: boolean }) =>
    query.isError ? "unavailable" : (value ?? "…");

  return (
    <div className="rounded-xl border border-line bg-raised p-4">
      <p className="text-sm font-medium">{name}</p>
      <dl className="mt-3 space-y-2 font-mono text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-mist">Transactions sent</dt>
          <dd>{show(txCount.data?.toString(), txCount)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-mist">ETH balance</dt>
          <dd>
            {show(
              balance.data && Number(formatEther(balance.data.value)).toFixed(5),
              balance,
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
