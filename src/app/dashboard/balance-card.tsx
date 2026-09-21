"use client";

import { CountUp } from "@/components/motion/count-up";
import { useFuelAccount } from "@/lib/use-fuel-account";

export function BalanceCard() {
  const { data } = useFuelAccount();
  return (
    <section className="card overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-[radial-gradient(closest-side,rgb(198_244_50/0.16),transparent)]"
      />
      <h2 className="flex items-center gap-2 text-sm text-mist">
        <span className="live-dot" /> Credit balance
      </h2>
      <p className="mt-2 font-mono text-4xl font-semibold text-lime">
        {data ? <CountUp value={data.balance} duration={1200} /> : <span className="skeleton" aria-hidden>0,000</span>}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-mist">
        {data && data.balance > 0
          ? `≈ $${(data.balance / 1000).toFixed(2)} of AI usage. Spend it with an API key below.`
          : "Scan your record below and claim what you have earned."}
      </p>
    </section>
  );
}
