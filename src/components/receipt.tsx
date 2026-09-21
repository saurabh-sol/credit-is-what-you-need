import { formatCredits } from "@/lib/format";

type ReceiptProps = {
  badge: string;
  subtitle: string;
  lines: { label: string; credits: number }[];
  total: number;
  emptyText?: string;
};

export function Receipt({ badge, subtitle, lines, total, emptyText }: ReceiptProps) {
  return (
    <div className="w-full max-w-sm drop-shadow-[0_0_40px_rgb(198_244_50/0.12)]">
      <div className="rounded-t-xl bg-fog px-6 pt-6 pb-4 font-mono text-sm text-ink">
        <div className="flex items-baseline justify-between">
          <p className="font-bold tracking-widest">FUEL RECEIPT</p>
          <p className="text-xs opacity-60">{badge}</p>
        </div>
        <p className="mt-1 text-xs opacity-60">{subtitle}</p>

        <ul className="mt-4 space-y-2 border-y border-dashed border-ink/30 py-4">
          {lines.length === 0 && <li className="opacity-60">{emptyText}</li>}
          {lines.map((line) => (
            <li key={line.label} className="flex justify-between gap-4">
              <span>{line.label}</span>
              <span className="shrink-0 font-semibold">
                {line.credits < 0 ? "−" : "+"}
                {formatCredits(Math.abs(line.credits))}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-baseline justify-between text-base font-bold">
          <span>TOTAL CREDITS</span>
          <span>{formatCredits(total)}</span>
        </div>
        <p className="mt-1 text-right text-xs opacity-60">
          ≈ ${(total / 1000).toFixed(2)} of AI usage
        </p>
      </div>
      <div className="receipt-edge h-2.5 bg-fog" />
    </div>
  );
}

const exampleLines = [
  { label: "Deployed a contract", credits: 500 },
  { label: "Swapped on a partner protocol", credits: 250 },
  { label: "12 contract interactions", credits: 600 },
  { label: "Reached 50 transactions", credits: 300 },
  { label: "Gas-Back (40% of gas spent)", credits: 84 },
  { label: "Builder Royalties (others used your contract)", credits: 1130 },
];

// An illustration for the landing page. Not real data.
export function ExampleReceipt() {
  return (
    <Receipt
      badge="EXAMPLE"
      subtitle="0x71C7…976F · Robinhood Chain"
      lines={exampleLines}
      total={exampleLines.reduce((sum, line) => sum + line.credits, 0)}
    />
  );
}
