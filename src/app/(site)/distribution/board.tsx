"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, CloseIcon, SearchIcon, WalletIcon } from "@/components/icons";
import { CountUp } from "@/components/motion/count-up";
import type { Distribution } from "@/lib/distribution";
import { formatCredits, shortAddress } from "@/lib/format";
import { CREDITS_PER_USD } from "@/lib/pricing";
import { api } from "@/lib/use-fuel-account";
import { useSession } from "@/lib/use-session";
import { ago, SkeletonRow, sources, tokens, usd, WalletRow } from "./wallet-row";

// The server sends at most this many rows, so a wallet missing from a full list may simply sit below it.
const BOARD_LIMIT = 100;
const REFRESH_MS = 20_000; // new claims show up on their own

const load = (query: string) => api<Distribution>(`/api/distribution?q=${encodeURIComponent(query)}`);
const count = (wallets: number) => `${formatCredits(wallets)} ${wallets === 1 ? "wallet" : "wallets"}`;

export function Board({ initial }: { initial: Distribution }) {
  const session = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());

  // The whole board is always kept fresh: it gives the totals, every rank and the visitor's own row.
  const board = useQuery({ queryKey: ["distribution", ""], queryFn: () => load(""), initialData: initial, refetchInterval: REFRESH_MS });
  const found = useQuery({
    queryKey: ["distribution", query],
    queryFn: () => load(query),
    enabled: query !== "",
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
  });

  // "/" jumps to the search box, unless the visitor is already typing somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { totals, active } = board.data;
  // A short list is repeated so the strip still fills its width and loops without a gap.
  const ticker = Array.from({ length: Math.ceil(8 / Math.max(active.length, 1)) }, (_, repeat) =>
    active.map((wallet) => ({ ...wallet, repeat })),
  ).flat();
  const ranks = new Map(board.data.wallets.map((wallet, index) => [wallet.address, index + 1]));
  const share = (earned: number) => (totals.credits > 0 ? (earned / totals.credits) * 100 : 0);

  const rows = query ? found.data?.wallets : board.data.wallets;
  const failed = query ? found.isError && !found.data : false;
  const stale = query ? found.isPlaceholderData : false;

  const me = session.address?.toLowerCase();
  const mine = me ? board.data.wallets.find((wallet) => wallet.address.toLowerCase() === me) : undefined;
  const notEarnedYet = Boolean(me) && !mine && board.data.wallets.length < BOARD_LIMIT;

  const paidIn = tokens(totals.tokensPaid).join(" + ");
  const kpis = [
    { label: "Wallets", value: <CountUp value={totals.wallets} />, note: "have earned credits", accent: true },
    { label: "Credits distributed", value: <CountUp value={totals.credits} />, note: "from every source" },
    { label: "Value handed out", value: usd(totals.credits), note: `of AI usage, at ${formatCredits(CREDITS_PER_USD)} credits per $1` },
    { label: "Tokens paid in", value: paidIn || "—", note: paidIn ? "for extra credits" : "No token top-ups yet", long: paidIn.length > 12 },
  ];

  const clear = () => {
    setSearch("");
    input.current?.focus();
  };

  return (
    <>
      <dl className="kpi-strip mt-8" style={{ "--kpis": kpis.length } as React.CSSProperties}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className="kpi min-w-0">
            <dt className="kpi-label">{kpi.label}</dt>
            <dd
              title={typeof kpi.value === "string" ? kpi.value : undefined}
              className={`kpi-value truncate ${kpi.accent ? "text-lime" : ""} ${kpi.long ? "text-lg leading-8" : ""}`}
            >
              {kpi.value}
            </dd>
            <dd className="kpi-note">{kpi.note}</dd>
          </div>
        ))}
      </dl>

      {active.length > 0 && (
        <div className="mt-4 flex items-center gap-4 border-y border-line/60 py-2 text-xs text-mist">
          <span className="flex shrink-0 items-center gap-2">
            <span className="live-dot" /> Most active
          </span>
          <div className="marquee min-w-0 flex-1" aria-label="Most active wallets">
            <div className="marquee-track">
              {[0, 1].map((copy) => (
                <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0">
                  {ticker.map((wallet) => (
                    <li
                      key={`${wallet.address}-${wallet.repeat}`}
                      aria-hidden={wallet.repeat > 0}
                      className="flex items-center gap-1.5 px-4 whitespace-nowrap"
                    >
                      <span className="text-fog">{wallet.name ?? shortAddress(wallet.address)}</span>
                      claimed
                      <span className="font-mono text-fog tabular-nums">+{formatCredits(wallet.claimed)}</span>
                      {wallet.used > 0 && (
                        <>
                          used
                          <span className="font-mono text-fog tabular-nums">{formatCredits(wallet.used)}</span>
                        </>
                      )}
                      <span className="text-mist/70" suppressHydrationWarning>
                        {ago(wallet.lastActiveAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </div>
      )}

      {notEarnedYet && (
        <div className="panel mt-6 px-4">
          <div className="entity flex-wrap">
            <span className="entity-icon">
              <WalletIcon className="size-4" />
            </span>
            <p className="min-w-0 flex-1 basis-56 text-mist">
              <span className="text-fog">Your wallet has not earned yet.</span> Scan your record to join the list.
            </p>
            <Link href="/dashboard/earn" className="btn-sm">
              Scan your record <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <label className="field flex h-9 w-full items-center gap-2 rounded-lg py-0 pr-2 pl-3 text-[0.8125rem] focus-within:border-lime/60 focus-within:shadow-[0_0_0_3px_rgb(198_244_50/0.12)] sm:w-80">
          <SearchIcon className={`size-4 shrink-0 text-mist ${found.isFetching && query ? "breathe" : ""}`} />
          <input
            ref={input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              setSearch("");
              event.currentTarget.blur();
            }}
            placeholder="Search a name or 0x address"
            aria-label="Search wallets"
            aria-keyshortcuts="/"
            className="w-full min-w-0 bg-transparent outline-none placeholder:text-mist focus-visible:outline-none"
          />
          {search ? (
            <button type="button" onClick={clear} aria-label="Clear search" className="grid size-5 shrink-0 place-items-center rounded text-mist transition-colors hover:text-fog">
              <CloseIcon className="size-3.5" />
            </button>
          ) : (
            <kbd className="kbd shrink-0" aria-hidden>
              /
            </kbd>
          )}
        </label>

        <ul className="hidden items-center gap-x-4 text-xs text-mist lg:flex">
          {sources.map((source) => (
            <li key={source.kind} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-xs ${source.shade}`} /> {source.label}
            </li>
          ))}
        </ul>

        <p className="text-xs text-mist tabular-nums sm:ml-auto lg:ml-0" aria-live="polite">
          {query && rows
            ? `${formatCredits(rows.length)} of ${count(totals.wallets)}`
            : totals.wallets > board.data.wallets.length
              ? `Top ${board.data.wallets.length} of ${count(totals.wallets)}`
              : count(totals.wallets)}
          {board.isError && " · could not refresh, showing the last list"}
        </p>
      </div>

      <div className="mt-4">
        {failed ? (
          <div className="empty" role="alert">
            <strong>Could not search the list</strong>
            The server did not answer. Your connection may have dropped.
            <div className="mt-4">
              <button type="button" onClick={() => found.refetch()} className="btn-sm">
                Search again
              </button>
            </div>
          </div>
        ) : rows?.length === 0 && query ? (
          <div className="empty">
            <strong>No wallet matches that.</strong>
            Check the spelling, or paste the full address.
            <div className="mt-4">
              <button type="button" onClick={clear} className="btn-sm">
                Clear search
              </button>
            </div>
          </div>
        ) : rows?.length === 0 ? (
          <div className="empty">
            <strong>Be the first to earn credits</strong>
            Nobody has claimed yet. The first wallet to scan its record and claim shows up here, at the top.
            <div className="mt-4">
              <Link href="/dashboard/earn" className="btn-sm btn-sm-primary">
                Earn credits
              </Link>
            </div>
          </div>
        ) : (
          // Below lg the table scrolls sideways; from lg up its header sticks under the site header instead.
          <div className={`transition-opacity max-lg:overflow-x-auto ${stale ? "opacity-60" : ""}`} aria-busy={!rows || stale}>
            <table className="grid-table min-w-[60rem] lg:[&_th]:top-16">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Wallet</th>
                  <th className="num">Credits earned</th>
                  <th className="num">Worth</th>
                  <th className="num">Share</th>
                  <th>Sources</th>
                  <th>Paid in</th>
                  <th className="text-right">Last earned</th>
                </tr>
              </thead>
              <tbody>
                {!rows && Array.from({ length: 6 }, (_, index) => <SkeletonRow key={index} />)}
                {!query && mine && <WalletRow key="you" wallet={mine} rank={ranks.get(mine.address) ?? null} share={share(mine.earned)} you />}
                {rows?.map((wallet) => (
                  <WalletRow key={wallet.address} wallet={wallet} rank={ranks.get(wallet.address) ?? null} share={share(wallet.earned)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-mist">
        Rather not be a row of hex?{" "}
        <Link href="/dashboard" className="text-fog underline decoration-line underline-offset-4 transition-colors hover:decoration-mist">
          Set a display name on your dashboard
        </Link>
        . Spending never appears here.
      </p>
    </>
  );
}
