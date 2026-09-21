"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { CopyButton } from "@/components/code-block";
import { SearchIcon } from "@/components/icons";
import { Identicon } from "@/components/identicon";
import { CountUp } from "@/components/motion/count-up";
import type { Distribution, EarningKind, TokenPaid } from "@/lib/distribution";
import { formatCredits, shortAddress } from "@/lib/format";
import { formatTokenAmount } from "@/lib/topup";
import { api } from "@/lib/use-fuel-account";

const sources: { kind: EarningKind; label: string; shade: string }[] = [
  { kind: "claim", label: "Tasks", shade: "bg-lime" },
  { kind: "milestone", label: "Milestones", shade: "bg-lime/75" },
  { kind: "gasback", label: "Gas-Back", shade: "bg-lime/55" },
  { kind: "royalty", label: "Royalties", shade: "bg-lime/35" },
  { kind: "topup", label: "Bought", shade: "bg-fog/40" },
];
const sourceLabel = Object.fromEntries(sources.map((source) => [source.kind, source.label]));

const usd = (credits: number) => `$${(credits / 1000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tokens = (paid: TokenPaid[]) => paid.map((token) => `${formatTokenAmount(BigInt(token.amount), token.decimals)} ${token.symbol}`);

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of [["day", 86_400], ["hour", 3_600], ["minute", 60]] as const) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function Board({ initial }: { initial: Distribution }) {
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());
  const { data = initial, isFetching } = useQuery({
    queryKey: ["distribution", query],
    queryFn: () => api<Distribution>(`/api/distribution?q=${encodeURIComponent(query)}`),
    initialData: query ? undefined : initial,
    placeholderData: keepPreviousData,
    refetchInterval: 20_000, // new claims show up on their own
  });
  const { totals, wallets, recent } = data;

  const stats = [
    { label: "wallets have earned credits", value: <CountUp value={totals.wallets} /> },
    { label: "credits distributed", value: <CountUp value={totals.credits} /> },
    { label: "of AI usage handed out", value: usd(totals.credits) },
    {
      label: totals.tokensPaid.length ? "paid in for extra credits" : "token top-ups so far",
      value: totals.tokensPaid.length ? tokens(totals.tokensPaid).join(" + ") : "0",
    },
  ];

  return (
    <>
      <dl className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col-reverse justify-end gap-2 bg-ink p-6">
            <dt className="text-sm leading-relaxed text-mist">{stat.label}</dt>
            <dd className="truncate font-mono text-3xl font-semibold tracking-tight text-lime">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {recent.length > 0 && (
        <div className="marquee mt-6 rounded-full border border-line bg-surface/60 py-2.5" aria-label="Latest earnings">
          <div className="marquee-track text-sm">
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0">
                {recent.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 px-5 whitespace-nowrap text-mist">
                    <span className="size-1.5 rounded-full bg-lime breathe" />
                    <span className="text-fog">{entry.name ?? shortAddress(entry.address)}</span>
                    {sourceLabel[entry.kind] ?? entry.kind}
                    <span className="font-mono text-lime">+{formatCredits(entry.amount)}</span>
                    <span suppressHydrationWarning>{ago(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      )}

      <div className="mt-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Every wallet, biggest earners first</h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist">
            {sources.map((source) => (
              <li key={source.kind} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-sm ${source.shade}`} /> {source.label}
              </li>
            ))}
          </ul>
        </div>
        <label className="field flex w-full items-center gap-2 sm:w-72">
          <SearchIcon className={`size-4 text-mist ${isFetching && query ? "breathe" : ""}`} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search a name or 0x address"
            aria-label="Search wallets"
            className="w-full bg-transparent placeholder:text-mist focus:outline-none"
          />
        </label>
      </div>

      <div className="card mt-5 overflow-x-auto">
        {wallets.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-lg font-medium">{query ? "No wallet matches that." : "Nobody has claimed yet."}</p>
            <p className="mx-auto mt-2 max-w-sm leading-relaxed text-mist">
              {query
                ? "Check the spelling, or paste the full address."
                : "The first wallet to scan its record and claim will show up here, at the top."}
            </p>
            {!query && (
              <Link href="/dashboard" className="btn-primary mt-6 inline-flex px-5 py-2.5 text-sm">
                Be the first
              </Link>
            )}
          </div>
        ) : (
          <table className="data-table min-w-[46rem]">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Wallet</th>
                <th className="text-right">Credits earned</th>
                <th className="text-right">Worth</th>
                <th>Where it came from</th>
                <th>Paid in</th>
                <th className="text-right">Last earned</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((wallet, index) => (
                <tr key={wallet.address} style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
                  <td className="font-mono text-mist">{index + 1}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <Identicon address={wallet.address} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{wallet.name ?? shortAddress(wallet.address)}</p>
                        <p className="flex items-center gap-1 font-mono text-xs text-mist">
                          <span title={wallet.address}>{shortAddress(wallet.address)}</span>
                          <CopyButton text={wallet.address} label="" className="-my-1 px-1" />
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-right font-mono font-semibold text-lime">{formatCredits(wallet.earned)}</td>
                  <td className="text-right font-mono text-mist">{usd(wallet.earned)}</td>
                  <td>
                    <div
                      className="flex h-1.5 w-40 overflow-hidden rounded-full bg-raised"
                      title={sources
                        .filter((source) => wallet.bySource[source.kind] > 0)
                        .map((source) => `${source.label} ${formatCredits(wallet.bySource[source.kind])}`)
                        .join(" · ")}
                    >
                      {sources.map((source) => (
                        <span
                          key={source.kind}
                          style={{ width: `${(wallet.bySource[source.kind] / wallet.earned) * 100}%` }}
                          className={`bar-grow ${source.shade}`}
                        />
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-mist">
                      {sources
                        .filter((source) => wallet.bySource[source.kind] > 0)
                        .map((source) => source.label)
                        .join(", ")}
                    </p>
                  </td>
                  <td className="font-mono text-xs whitespace-nowrap text-mist">
                    {wallet.tokensPaid.length ? tokens(wallet.tokensPaid).join(", ") : "—"}
                  </td>
                  <td className="text-right text-xs whitespace-nowrap text-mist" suppressHydrationWarning>
                    {ago(wallet.lastEarnedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
