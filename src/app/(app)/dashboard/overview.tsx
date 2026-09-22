"use client";

import { CountUp } from "@/components/motion/count-up";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { useKreditAccount } from "@/lib/use-kredit-account";

const dollars = (credits: number) => `≈ $${(credits / 1000).toFixed(2)} of AI usage`;

// The four numbers that answer "where do I stand?". Only the balance gets the accent.
export function KpiStrip() {
  const { data } = useKreditAccount();
  const blank = <span className="skeleton" aria-hidden>0,000</span>;

  return (
    <div className="kpi-strip animate-rise">
      <div className="kpi">
        <p className="kpi-label">
          <span className="live-dot" /> Credit balance
        </p>
        <p className="kpi-value text-accent">{data ? <CountUp value={data.balance} duration={900} /> : blank}</p>
        <p className="kpi-note">{data ? dollars(data.balance) : "Loading"}</p>
      </div>
      <div className="kpi">
        <p className="kpi-label">Earned, all time</p>
        <p className="kpi-value">{data ? <CountUp value={data.earned} duration={900} /> : blank}</p>
        <p className="kpi-note">{data ? dollars(data.earned) : "Loading"}</p>
      </div>
      <div className="kpi">
        <p className="kpi-label">Spent on AI</p>
        <p className="kpi-value">{data ? <CountUp value={data.spent} duration={900} /> : blank}</p>
        <p className="kpi-note">{data ? dollars(data.spent) : "Loading"}</p>
      </div>
      <div className="kpi">
        <p className="kpi-label">Active API keys</p>
        <p className="kpi-value">
          {data ? data.keys.length : blank}
          <span className="text-base font-normal text-mist"> / {MAX_ACTIVE_KEYS}</span>
        </p>
        <p className="kpi-note">{data?.keys.length ? "One per tool is a good habit" : "Create one to start spending"}</p>
      </div>
    </div>
  );
}
