"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { Identicon } from "@/components/identicon";
import { ModelLogo } from "@/components/model-logo";
import type { DistributionRow, EarningKind, ModelUsed, TokenPaid } from "@/lib/distribution";
import { formatCredits, shortAddress } from "@/lib/format";
import { CREDITS_PER_USD } from "@/lib/pricing";
import { providerOf } from "@/lib/providers";
import { formatTokenAmount } from "@/lib/topup";

// Earned credits share one colour at falling strength; bought credits stand apart.
export const sources: { kind: EarningKind; label: string; shade: string }[] = [
  { kind: "claim", label: "Tasks", shade: "bg-accent/80" },
  { kind: "milestone", label: "Milestones", shade: "bg-accent/55" },
  { kind: "streak", label: "Streaks", shade: "bg-accent/35" },
  { kind: "referral", label: "Referrals", shade: "bg-accent/20" },
  { kind: "topup", label: "Bought", shade: "bg-fog/35" },
];

export const usd = (credits: number) =>
  `$${(credits / CREDITS_PER_USD).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const tokens = (paid: TokenPaid[]) =>
  paid.map((token) => `${formatTokenAmount(BigInt(token.amount), token.decimals)} ${token.symbol}`);

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const units = [["year", 31_536_000], ["month", 2_592_000], ["day", 86_400], ["hour", 3_600], ["minute", 60]] as const;

export function ago(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

const plural = (count: number, word: string) => `${formatCredits(count)} ${word}${count === 1 ? "" : "s"}`;

// "openai/gpt-4o-mini · 1,200 credits · 3 calls"
const describeModel = (used: ModelUsed) => `${used.model} · ${plural(used.credits, "credit")} · ${plural(used.calls, "call")}`;

// Marks for the models a wallet has spent on, one per maker so no mark repeats,
// the maker that took the most credits first. Hover a mark for its models.
export function ModelStack({ models, max = 4 }: { models: ModelUsed[]; max?: number }) {
  if (models.length === 0) return null;
  const makers = new Map<string, ModelUsed[]>();
  for (const used of models) {
    const maker = providerOf(used.model)?.name ?? "Kredit";
    makers.set(maker, [...(makers.get(maker) ?? []), used]);
  }
  const shown = [...makers].slice(0, max);
  const hidden = [...makers].slice(max).flatMap(([, list]) => list);
  return (
    <ul className="flex items-center" aria-label={`Models used: ${models.map((used) => used.model).join(", ")}`}>
      {shown.map(([maker, list]) => (
        <li
          key={maker}
          title={`${maker}\n${list.map(describeModel).join("\n")}`}
          className="-ml-1.5 grid size-6 place-items-center rounded-full border border-line bg-surface text-fog first:ml-0"
        >
          <ModelLogo model={list[0].model} className="size-3.5" />
        </li>
      ))}
      {hidden.length > 0 && (
        <li
          title={hidden.map(describeModel).join("\n")}
          className="-ml-1.5 grid h-6 min-w-6 place-items-center rounded-full border border-line bg-surface px-1 font-mono text-[0.625rem] text-mist"
        >
          +{makers.size - shown.length}
        </li>
      )}
    </ul>
  );
}

// Icon only, so it carries its own name for screen readers.
function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Address copied" : "Copy address"}
      onClick={async () => {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className={`grid size-5 place-items-center rounded transition-colors ${copied ? "text-accent" : "text-mist/70 hover:text-fog"}`}
    >
      {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
    </button>
  );
}

type WalletRowProps = {
  wallet: DistributionRow;
  /** Place on the full board; null when the wallet sits below the rows we were sent. */
  rank: number | null;
  /** Percent of every credit ever handed out. */
  share: number;
  you?: boolean;
};

export function WalletRow({ wallet, rank, share, you }: WalletRowProps) {
  const earnedFrom = sources.filter((source) => wallet.bySource[source.kind] > 0);
  const breakdown = earnedFrom.map((source) => `${source.label} ${formatCredits(wallet.bySource[source.kind])}`).join(" · ");
  const short = shortAddress(wallet.address);

  return (
    <tr className={you ? "bg-accent/[0.04]" : undefined}>
      <td className="num w-12 text-mist">{rank ?? "—"}</td>
      <td>
        <div className="flex items-center gap-3">
          <Identicon address={wallet.address} className="size-7" />
          <div className="min-w-0 leading-4">
            <p className="flex items-center gap-2">
              <span className={`truncate text-fog ${wallet.name ? "font-medium" : "font-mono"}`} title={wallet.address}>
                {wallet.name ?? short}
              </span>
              {you && <span className="chip py-0 text-[0.625rem] leading-4 text-accent">You</span>}
              {!wallet.name && <CopyAddress address={wallet.address} />}
            </p>
            {/* An unnamed wallet already shows its address above; saying it twice adds nothing. */}
            {wallet.name && (
              <p className="flex items-center gap-1 font-mono text-xs text-mist">
                <span title={wallet.address}>{short}</span>
                <CopyAddress address={wallet.address} />
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="num font-medium text-fog">{formatCredits(wallet.earned)}</td>
      <td className="num text-mist">{usd(wallet.earned)}</td>
      <td className="num text-mist">{share.toFixed(1)}%</td>
      <td>
        <div className="flex items-center gap-3">
          <div role="img" aria-label={breakdown} title={breakdown} className="flex h-1 w-24 shrink-0 overflow-hidden rounded-full bg-raised">
            {sources.map((source) => (
              <span
                key={source.kind}
                style={{ width: `${(wallet.bySource[source.kind] / wallet.earned) * 100}%` }}
                className={`bar-grow ${source.shade}`}
              />
            ))}
          </div>
          <span className="max-w-44 truncate text-xs text-mist">{earnedFrom.map((source) => source.label).join(", ")}</span>
        </div>
      </td>
      <td>
        {wallet.used > 0 ? (
          <div className="flex items-center justify-end gap-2.5">
            <span className="num font-mono text-fog tabular-nums">{formatCredits(wallet.used)}</span>
            <ModelStack models={wallet.models} />
          </div>
        ) : (
          <span className="block text-right text-mist">—</span>
        )}
      </td>
      <td className="font-mono text-xs whitespace-nowrap text-mist">
        {wallet.tokensPaid.length ? tokens(wallet.tokensPaid).join(", ") : "—"}
      </td>
      <td className="text-right text-xs whitespace-nowrap text-mist" suppressHydrationWarning>
        {ago(wallet.lastEarnedAt)}
      </td>
    </tr>
  );
}

// Stands in for a row while the first search result is on its way.
export function SkeletonRow() {
  return (
    <tr aria-hidden>
      <td className="num">
        <span className="skeleton h-3 w-4" />
      </td>
      <td>
        <div className="flex items-center gap-3">
          <span className="skeleton size-7" />
          <span className="skeleton h-3 w-32" />
        </div>
      </td>
      {["w-16", "w-12", "w-10"].map((width) => (
        <td key={width} className="num">
          <span className={`skeleton h-3 ${width}`} />
        </td>
      ))}
      <td>
        <span className="skeleton h-1.5 w-40" />
      </td>
      <td>
        <div className="flex items-center justify-end gap-2.5">
          <span className="skeleton h-3 w-10" />
          <span className="skeleton size-6 rounded-full" />
        </div>
      </td>
      <td>
        <span className="skeleton h-3 w-14" />
      </td>
      <td className="num">
        <span className="skeleton h-3 w-16" />
      </td>
    </tr>
  );
}
