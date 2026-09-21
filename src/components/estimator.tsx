"use client";

import { useState } from "react";
import { Receipt } from "@/components/receipt";
import { buildReceipt, type ScannedTx } from "@/lib/scoring";

const fields = [
  { id: "deploys", label: "Contracts deployed", max: 10 },
  { id: "calls", label: "Contract interactions", max: 200 },
  { id: "transfers", label: "Transfers", max: 200 },
  { id: "days", label: "Spread over days", max: 60, min: 1 },
] as const;

type Inputs = Record<(typeof fields)[number]["id"], number>;

// Invents a wallet history that matches the sliders, spread evenly over the
// chosen days, so the real scoring rules (daily cap, milestones) apply to it.
function imagineHistory({ deploys, calls, transfers, days }: Inputs): ScannedTx[] {
  const kinds = [
    ...Array<"deploy">(deploys).fill("deploy"),
    ...Array<"call">(calls).fill("call"),
    ...Array<"transfer">(transfers).fill("transfer"),
  ];
  return kinds.map((kind, index) => ({
    hash: `0x${index}`,
    timestamp: new Date(Date.UTC(2026, 0, 1 + (index % days))).toISOString(),
    ok: true,
    to: kind === "deploy" ? null : "0x0",
    toIsContract: kind === "call",
    toName: null,
    method: null,
    createdContract: kind === "deploy" ? "0x0" : null,
    feeWei: "0",
  }));
}

export function Estimator() {
  const [inputs, setInputs] = useState<Inputs>({ deploys: 1, calls: 24, transfers: 30, days: 14 });
  const receipt = buildReceipt(imagineHistory(inputs));

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
      <div className="card p-7">
        <div className="space-y-7">
          {fields.map((field) => {
            const min = "min" in field ? field.min : 0;
            const value = inputs[field.id];
            return (
              <label key={field.id} className="block">
                <span className="flex items-baseline justify-between">
                  <span className="text-sm text-mist">{field.label}</span>
                  <span className="font-mono text-lg font-semibold tabular-nums text-fog">{value}</span>
                </span>
                <input
                  type="range"
                  min={min}
                  max={field.max}
                  value={value}
                  onChange={(event) => setInputs({ ...inputs, [field.id]: Number(event.target.value) })}
                  style={{ "--fill": `${((value - min) / (field.max - min)) * 100}%` } as React.CSSProperties}
                  className="slider mt-3 w-full"
                />
              </label>
            );
          })}
        </div>
        <p className="mt-7 border-t border-line pt-5 text-xs leading-relaxed text-mist">
          This runs the same scoring rules as the real scanner, on an imagined
          history. Gas-Back, partner protocols and Builder Royalties come on top.
        </p>
      </div>

      <div className="flex justify-center lg:justify-end">
        <Receipt
          animated="live"
          badge="ESTIMATE"
          subtitle="Your wallet · Robinhood Chain"
          lines={receipt.lines}
          total={receipt.total}
          emptyText="Move a slider to add some activity."
        />
      </div>
    </div>
  );
}
