"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRightIcon, CoinsIcon } from "@/components/icons";
import { formatCredits } from "@/lib/format";
import type { TopUpConfig } from "@/lib/topup";
import { api } from "@/lib/use-kredit-account";

// The landing page's view of top-ups: the real price when buying is open, and
// an honest "not yet" when it is not.
export function TopUpTeaser() {
  const { data } = useQuery({
    queryKey: ["topup-config"],
    queryFn: () => api<{ config: TopUpConfig | null }>("/api/topup"),
    staleTime: 600_000,
  });
  const config = data?.config;

  return (
    <div className="card relative overflow-hidden p-7">
      <div className="flex items-center justify-between">
        <span className="grid size-11 place-items-center rounded-xl border border-line bg-raised text-accent">
          <CoinsIcon className="size-5" />
        </span>
        <span className="chip">
          <span className={`size-1.5 rounded-full ${config ? "bg-accent" : "bg-mist"} breathe`} />
          {config ? "Open now" : data ? "Opening soon" : "Checking"}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4 font-mono">
        <div>
          <p className="text-2xl font-semibold text-fog sm:text-3xl">{config ? formatCredits(Math.round(1 / config.creditsPerToken)) : "1"}</p>
          <p className="mt-1 text-xs text-mist">{config?.symbol ?? "project token"}{config?.swap ? ", paid in ETH" : ""}</p>
        </div>
        <ArrowRightIcon className="size-5 text-accent" />
        <div className="text-right">
          <p className="text-2xl font-semibold text-accent sm:text-3xl">{config ? "1" : "credits"}</p>
          <p className="mt-1 text-xs text-mist">{config ? "credit · $0.001 of AI usage" : "price set at launch"}</p>
        </div>
      </div>

      <Link href="/dashboard/credits"className="btn-ghost mt-8 w-full justify-center px-5 py-2.5 text-sm">
        {config ? "Buy credits on your dashboard" : "Open your dashboard"}
      </Link>
    </div>
  );
}
