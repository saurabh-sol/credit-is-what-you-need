"use client";

import { formatCredits } from "@/lib/format";
import { useFuelAccount } from "@/lib/use-fuel-account";

const kindLabel: Record<string, string> = { claim: "Claimed", milestone: "Milestone", gasback: "Gas-Back", royalty: "Royalties", spend: "Spent" };

export function Activity() {
  const { data } = useFuelAccount();
  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">Activity</h2>
      {!data || data.activity.length === 0 ? (
        <p className="mt-3 text-sm text-mist">Claims and spending will show up here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {data.activity.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate">
                  {kindLabel[entry.kind] ?? entry.kind} · <span className="text-mist">{entry.memo}</span>
                </p>
                <p className="font-mono text-xs text-mist">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>
              <span className={`shrink-0 font-mono ${entry.amount < 0 ? "text-fog" : "text-lime"}`}>
                {entry.amount < 0 ? "−" : "+"}
                {formatCredits(Math.abs(entry.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
