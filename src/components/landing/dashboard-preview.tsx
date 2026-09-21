"use client";

import { memo, useEffect, useState } from "react";
import { CountUp } from "@/components/motion/count-up";
import { prefersReducedMotion, useInView } from "@/components/motion/use-in-view";
import { costExamples } from "@/lib/cost-examples";
import { formatCredits } from "@/lib/format";
import { GAS_BACK_PERCENT } from "@/lib/gasback";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { CREDITS_PER_USD } from "@/lib/pricing";
import { MILESTONES, TASK_CREDITS } from "@/lib/scoring";

type Entry = { kind: string; detail: string; amount: number };

// A spend row priced by the real pricing function, like the dashboard's own examples.
const spend = (example: (typeof costExamples)[number]): Entry => ({
  kind: "Spent",
  detail: example.name.toLowerCase(),
  amount: -example.credits,
});

// An invented ledger, replayed in order. Rates and prices still come from the real rules.
const entries: Entry[] = [
  { kind: "Tasks", detail: "37 tasks on testnet", amount: 37 * TASK_CREDITS.contract_call },
  { kind: "Gas-Back", detail: `${GAS_BACK_PERCENT}% of gas spent`, amount: 84 },
  spend(costExamples[2]),
  { kind: "Royalties", detail: "2 contracts, 61 calls", amount: 1130 },
  spend(costExamples[1]),
  { kind: "Milestone", detail: `Reached ${MILESTONES[1].txs} transactions`, amount: MILESTONES[1].credits },
  spend(costExamples[3]),
  { kind: "Tasks", detail: "1 deployment, 4 interactions", amount: TASK_CREDITS.deploy + 4 * TASK_CREDITS.contract_call },
];

const START = { earned: 12_480, spent: 3_120 };
const ROWS = 4;
const ACTIVE_KEYS = 3;
const ages = ["just now", "2 minutes ago", "5 minutes ago", "9 minutes ago"];
// Start over after a dozen laps, so a tab left open never counts into the millions.
const RESET_AFTER = entries.length * 12;

const entryAt = (position: number) => entries[((position % entries.length) + entries.length) % entries.length];

// Where the account stands once the first `count` entries have landed.
function totalsAfter(count: number) {
  let { earned, spent } = START;
  for (let index = 0; index < count; index++) {
    const { amount } = entryAt(index);
    if (amount > 0) earned += amount;
    else spent -= amount;
  }
  return { earned, spent, balance: earned - spent };
}

const dollars = (credits: number) => `≈ $${(credits / CREDITS_PER_USD).toFixed(2)}`;

// The signed-in overview, in miniature. A new ledger entry lands every few
// seconds and the three totals move with it, so the numbers always add up.
export const DashboardPreview = memo(function DashboardPreview() {
  const [ref, inView] = useInView<HTMLElement>("0px 0px -20% 0px");
  const [count, setCount] = useState(0);

  // Wait until the frame is on screen, so the first entry is seen arriving.
  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    const timer = setInterval(() => setCount((landed) => (landed + 1) % RESET_AFTER), 2500);
    return () => clearInterval(timer);
  }, [inView]);

  const totals = totalsAfter(count);
  // Rows that stay mounted swap between two identical animations to slide down again.
  const shift = count === 0 ? "" : count % 2 ? "preview-row-a" : "preview-row-b";

  return (
    <figure ref={ref} className="panel overflow-hidden shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)]" aria-label="A preview of the Fuel dashboard with example numbers">
      <div aria-hidden>
        <div className="flex items-center gap-3 border-b border-line bg-raised/60 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
          </div>
          <p className="mx-auto truncate rounded-md border border-line bg-ink/60 px-3 py-0.5 font-mono text-[0.6875rem] text-mist sm:px-8">
            fuel / overview
          </p>
          <span className="chip">Example</span>
        </div>

        <div className="bg-ink p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold tracking-tight">Overview</p>
            <span className="chip">
              <span className="live-dot" />
              <span className="text-fog tabular-nums">{formatCredits(totals.balance)}</span> credits
            </span>
          </div>

          <div className="kpi-strip mt-4">
            <div className="kpi px-4">
              <p className="kpi-label">Balance</p>
              <p className="kpi-value text-xl text-lime sm:text-2xl">
                <CountUp value={totals.balance} duration={700} />
              </p>
              <p className="kpi-note">{dollars(totals.balance)}</p>
            </div>
            <div className="kpi px-4">
              <p className="kpi-label">Earned</p>
              <p className="kpi-value text-xl sm:text-2xl">
                <CountUp value={totals.earned} duration={700} />
              </p>
              <p className="kpi-note">{dollars(totals.earned)}</p>
            </div>
            <div className="kpi px-4">
              <p className="kpi-label">Spent</p>
              <p className="kpi-value text-xl sm:text-2xl">
                <CountUp value={totals.spent} duration={700} />
              </p>
              <p className="kpi-note">{dollars(totals.spent)}</p>
            </div>
            <div className="kpi px-4">
              <p className="kpi-label">Active keys</p>
              <p className="kpi-value text-xl sm:text-2xl">
                {ACTIVE_KEYS}
                <span className="text-sm font-normal text-mist"> / {MAX_ACTIVE_KEYS}</span>
              </p>
              <p className="kpi-note">One per tool</p>
            </div>
          </div>

          <p className="section-label mt-6">
            Recent activity
            <span className="text-xs font-normal text-mist">Newest first</span>
          </p>
          {/* A new row slides out from under the column headings, which sit above the rows. */}
          <div className="overflow-hidden">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Detail</th>
                  <th className="hidden sm:table-cell">When</th>
                  <th className="num">Credits</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: ROWS }, (_, row) => {
                  const entry = entryAt(count - 1 - row);
                  return (
                    // Keyed by when the entry landed, so a row keeps its identity as it moves down.
                    <tr key={count - row} className={row === 0 && count > 0 ? "preview-row-new" : shift}>
                      <td>
                        <span className="chip">{entry.kind}</span>
                      </td>
                      <td className="w-full max-w-0 truncate text-mist">{entry.detail}</td>
                      <td className="hidden whitespace-nowrap text-mist sm:table-cell">{ages[row]}</td>
                      <td className={`num ${entry.amount > 0 ? "text-fog" : "text-mist"}`}>
                        {entry.amount > 0 ? "+" : "−"}
                        {formatCredits(Math.abs(entry.amount))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </figure>
  );
});
