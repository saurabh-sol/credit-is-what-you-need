"use client";

import { formatCredits } from "@/lib/format";
import { useFuelAccount } from "@/lib/use-fuel-account";

export function BalanceCard() {
  const { data } = useFuelAccount();
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-sm text-mist">Credit balance</h2>
      <p className="mt-2 font-mono text-4xl font-semibold text-lime">
        {data ? formatCredits(data.balance) : "…"}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-mist">
        {data && data.balance > 0
          ? `≈ $${(data.balance / 1000).toFixed(2)} of AI usage. Spend it with an API key below.`
          : "Scan your record below and claim what you have earned."}
      </p>
    </section>
  );
}
