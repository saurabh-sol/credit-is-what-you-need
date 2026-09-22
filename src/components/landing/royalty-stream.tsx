"use client";

import { useEffect, useRef, useState } from "react";
import { CountUp } from "@/components/motion/count-up";
import { prefersReducedMotion, useInView } from "@/components/motion/use-in-view";
import { formatCredits, shortAddress } from "@/lib/format";
import { CREDITS_PER_USD } from "@/lib/pricing";
import { ROYALTY_PERCENT } from "@/lib/royalties";

// Builder Royalties, the part of Kredit nobody else has: other people use a
// contract you deployed, and a share of the gas they pay lands in your balance
// as AI credits. This card shows that happening, one call at a time.
//
// An illustration for the landing page. Not real data. The fees are what a
// call on an L2 really costs, in US cents, so the credits per call stay honest:
// small, and worth having because they never stop.
const contract = "0x9aC4e1D2b7F0a3c8E5d6B1f2A9c0D3e4F5a6e17B";

const callers = [
  { from: "0x3fA17c0b9E42d8A1f5C6b7D8e9F0a1B2c3D4c2e0", method: "swap", feeCents: 4.2 },
  { from: "0x8B0c4dE1f2A3b4C5d6E7f8A9b0C1d2E3f4A5b1c4", method: "mint", feeCents: 2.6 },
  { from: "0xD41e9f7A8b6C5d4E3f2A1b0C9d8E7f6A5b4c7d1a", method: "swap", feeCents: 3.9 },
  { from: "0x27C6a1B2c3D4e5F6a7B8c9D0e1F2a3B4c5D6e9f3", method: "stake", feeCents: 5.4 },
  { from: "0xA9e2B3c4D5e6F7a8B9c0D1e2F3a4B5c6D7e8f0b7", method: "claim", feeCents: 1.8 },
  { from: "0x5cD8e9F0a1B2c3D4e5F6a7B8c9D0e1F2a3B4c6e2", method: "swap", feeCents: 4.7 },
  { from: "0xE13f4A5b6C7d8E9f0A1b2C3d4E5f6A7b8C9d0a5f", method: "addLiquidity", feeCents: 7.3 },
  { from: "0x6aB7c8D9e0F1a2B3c4D5e6F7a8B9c0D1e2F3a4d8", method: "swap", feeCents: 3.1 },
  { from: "0xF04a5B6c7D8e9F0a1B2c3D4e5F6a7B8c9D0e1b9c", method: "mint", feeCents: 2.2 },
  { from: "0x1bE2f3A4b5C6d7E8f9A0b1C2d3E4f5A6b7C8d3e6", method: "unstake", feeCents: 4.9 },
  { from: "0xC8d9E0f1A2b3C4d5E6f7A8b9C0d1E2f3A4b5c9a1", method: "swap", feeCents: 3.6 },
  { from: "0x92A3b4C5d6E7f8A9b0C1d2E3f4A5b6C7d8E9f2c5", method: "claim", feeCents: 1.5 },
];

// The rule from src/lib/royalties.ts, in cents: your share of the gas they paid, as credits.
const creditsFor = (feeCents: number) =>
  Math.round(((feeCents / 100) * CREDITS_PER_USD * ROYALTY_PERCENT) / 100);

// What the contract had already earned before the reader arrived.
const earlier = { credits: 1_184, calls: 212, wallets: 38 };

const VISIBLE = 5;
const TICK_MS = 1500;

type Row = { id: number; caller: (typeof callers)[number] };

const rowAt = (id: number): Row => ({ id, caller: callers[id % callers.length] });

// The same 5×5 mirrored mark the app draws for a wallet, so every caller gets its own face.
function CallerMark({ address }: { address: string }) {
  const hex = address.toLowerCase().replace(/^0x/, "");
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      const mirrored = column < 3 ? column : 4 - column;
      cells.push(parseInt(hex[row * 3 + mirrored], 16) % 2 === 0);
    }
  }
  return (
    <svg viewBox="0 0 5 5" aria-hidden className="size-4 shrink-0 text-accent-2" shapeRendering="crispEdges">
      {cells.map((on, index) =>
        on ? <rect key={index} x={index % 5} y={Math.floor(index / 5)} width="1" height="1" fill="currentColor" /> : null,
      )}
    </svg>
  );
}

export function RoyaltyStream() {
  const [ref, inView] = useInView<HTMLDivElement>("0px");
  // Newest call first. The first VISIBLE rows exist before any JavaScript runs.
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: VISIBLE }, (_, index) => rowAt(VISIBLE - 1 - index)),
  );
  const next = useRef(VISIBLE);
  // Every address in `callers` is distinct, so the first rows are VISIBLE new wallets.
  const seen = useRef(new Set(callers.slice(0, VISIBLE).map((caller) => caller.from)));
  const [wallets, setWallets] = useState(earlier.wallets + VISIBLE);
  const [calls, setCalls] = useState(earlier.calls + VISIBLE);
  const [credits, setCredits] = useState(
    earlier.credits + rows.reduce((sum, row) => sum + creditsFor(row.caller.feeCents), 0),
  );

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    const timer = setInterval(() => {
      const row = rowAt(next.current++);
      setRows((current) => [row, ...current].slice(0, VISIBLE));
      setCalls((current) => current + 1);
      setCredits((current) => current + creditsFor(row.caller.feeCents));
      if (!seen.current.has(row.caller.from)) {
        seen.current.add(row.caller.from);
        setWallets((current) => current + 1);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [inView]);

  return (
    <div ref={ref} className="w-full max-w-sm drop-shadow-[0_24px_40px_var(--shade)]">
      <div className="rounded-xl bg-fog px-6 pt-6 pb-5 font-mono text-sm text-ink">
        <div className="flex items-baseline justify-between">
          <p className="font-bold tracking-widest">BUILDER ROYALTIES</p>
          <p className="flex items-center gap-2 text-xs opacity-60">
            <span className="live-dot" />
            EXAMPLE
          </p>
        </div>
        <p className="mt-1 text-xs opacity-60">Your contract {shortAddress(contract)} · Robinhood Chain</p>

        <ul aria-live="off" className="mt-4 space-y-2 overflow-hidden border-y border-dashed border-ink/30 py-4">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className={`flex items-center gap-2.5 whitespace-nowrap ${index === 0 && row.id >= VISIBLE ? "royalty-row-new" : ""}`}
            >
              <CallerMark address={row.caller.from} />
              <span className="shrink-0">{shortAddress(row.caller.from)}</span>
              <span className="min-w-0 flex-1 truncate opacity-60">{row.caller.method}()</span>
              <span className="shrink-0 text-xs opacity-60">${(row.caller.feeCents / 100).toFixed(3)}</span>
              <span className="w-[4ch] shrink-0 text-right font-semibold text-accent-2">
                +{creditsFor(row.caller.feeCents)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-baseline justify-between text-base font-bold">
          <span>ROYALTIES EARNED</span>
          <CountUp value={credits} duration={500} />
        </div>
        <p className="mt-1 text-right text-xs opacity-60">≈ ${(credits / CREDITS_PER_USD).toFixed(2)} of AI usage</p>
        <p className="mt-3 text-xs tabular-nums opacity-60">
          {ROYALTY_PERCENT}% of their gas · {formatCredits(calls)} calls · {wallets} wallets
        </p>
      </div>
    </div>
  );
}
