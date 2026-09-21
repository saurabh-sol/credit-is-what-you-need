"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CopyButton } from "@/components/code-block";
import { PlayIcon, TerminalIcon } from "@/components/icons";
import { Identicon } from "@/components/identicon";
import { CountUp } from "@/components/motion/count-up";
import { shortAddress } from "@/lib/format";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { api, useFuelAccount } from "@/lib/use-fuel-account";

// Who is signed in, and the way to the two places credits get spent.
export function DashboardHeader({ address }: { address: string }) {
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<{ name: string | null }>("/api/profile") });

  return (
    <header className="flex flex-wrap items-center justify-between gap-6">
      <div className="flex min-w-0 items-center gap-4">
        <Identicon address={address} className="size-14" />
        <div className="min-w-0">
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight">
            {profile.data?.name ?? "Your wallet is verified"}
          </h1>
          <p className="mt-1 flex items-center gap-1 font-mono text-sm text-mist">
            <span className="hidden break-all sm:inline">{address}</span>
            <span className="sm:hidden">{shortAddress(address)}</span>
            <CopyButton text={address} label="" className="-my-1" />
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link href="/playground" className="btn-ghost px-4 py-2 text-sm">
          <PlayIcon className="size-3.5 text-lime" /> Playground
        </Link>
        <Link href="/docs" className="btn-ghost px-4 py-2 text-sm">
          <TerminalIcon className="text-lime" /> API docs
        </Link>
      </div>
    </header>
  );
}

const dollars = (credits: number) => `≈ $${(credits / 1000).toFixed(2)} of AI usage`;

// The four numbers that answer "where do I stand?" at a glance.
export function StatRow() {
  const { data } = useFuelAccount();
  const blank = <span className="skeleton" aria-hidden>0,000</span>;

  const tiles = [
    { label: "Earned, all time", value: data && <CountUp value={data.earned} duration={1200} />, note: data ? dollars(data.earned) : "" },
    { label: "Spent on AI", value: data && <CountUp value={data.spent} duration={1200} />, note: data ? dollars(data.spent) : "" },
    {
      label: "Active API keys",
      value: data && (
        <>
          {data.keys.length}
          <span className="text-lg text-mist"> / {MAX_ACTIVE_KEYS}</span>
        </>
      ),
      note: data?.keys.length ? "Revoke any of them below" : "Create your first one below",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
      <section className="card relative overflow-hidden p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-[radial-gradient(closest-side,rgb(198_244_50/0.16),transparent)]"
        />
        <h2 className="flex items-center gap-2 text-sm text-mist">
          <span className="live-dot" /> Credit balance
        </h2>
        <p className="mt-2 font-mono text-4xl font-semibold text-lime">
          {data ? <CountUp value={data.balance} duration={1200} /> : blank}
        </p>
        <p className="mt-2 text-sm text-mist">
          {data && data.balance > 0 ? dollars(data.balance) : "Scan your record below and claim what you have earned."}
        </p>
      </section>

      {tiles.map((tile) => (
        <section key={tile.label} className="card p-6">
          <h2 className="text-sm text-mist">{tile.label}</h2>
          <p className="mt-2 font-mono text-3xl font-semibold text-fog">{tile.value ?? blank}</p>
          <p className="mt-2 text-sm text-mist">{tile.note}</p>
        </section>
      ))}
    </div>
  );
}
