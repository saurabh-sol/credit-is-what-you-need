import { CountUp } from "@/components/motion/count-up";
import { formatCredits } from "@/lib/format";

type ReceiptProps = {
  badge: string;
  subtitle: string;
  lines: { label: string; credits: number }[];
  total: number;
  emptyText?: string;
  /** "print" feeds the receipt out line by line; "live" just lets the total tick as it changes. */
  animated?: "print" | "live";
};

// Where a row sits in the print order; read by `.receipt-print .print-line`.
const printOrder = (index: number) => ({ "--i": index }) as React.CSSProperties;

export function Receipt({ badge, subtitle, lines, total, emptyText, animated }: ReceiptProps) {
  // The total starts counting as its row inks in (timings mirror globals.css).
  const totalDelay = 900 + lines.length * 110;

  return (
    <div className="w-full max-w-sm drop-shadow-[0_0_40px_rgb(198_244_50/0.12)]">
      <div className={animated === "print" ? "receipt-print" : undefined}>
        <div className="rounded-t-xl bg-fog px-6 pt-6 pb-4 font-mono text-sm text-ink">
          <div className="flex items-baseline justify-between">
            <p className="font-bold tracking-widest">KREDIT RECEIPT</p>
            <p className="text-xs opacity-60">{badge}</p>
          </div>
          <p className="mt-1 text-xs opacity-60">{subtitle}</p>

          <ul className="mt-4 space-y-2 border-y border-dashed border-ink/30 py-4">
            {lines.length === 0 && <li className="opacity-60">{emptyText}</li>}
            {lines.map((line, index) => (
              <li key={line.label} style={printOrder(index)} className="print-line flex justify-between gap-4">
                <span>{line.label}</span>
                <span className="shrink-0 font-semibold">
                  {line.credits < 0 ? "−" : "+"}
                  {formatCredits(Math.abs(line.credits))}
                </span>
              </li>
            ))}
          </ul>

          <div style={printOrder(lines.length)} className="print-line">
            <div className="mt-4 flex items-baseline justify-between text-base font-bold">
              <span>TOTAL CREDITS</span>
              <span>
                {animated === "print" && <CountUp value={total} delay={totalDelay} />}
                {animated === "live" && <CountUp value={total} duration={500} />}
                {!animated && formatCredits(total)}
              </span>
            </div>
            <p className="mt-1 text-right text-xs opacity-60">
              ≈ ${(total / 1000).toFixed(2)} of AI usage
            </p>
          </div>
        </div>
        <div className="receipt-edge h-2.5 bg-fog" />
      </div>
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
      animated="print"
      badge="EXAMPLE"
      subtitle="0x71C7…976F · Robinhood Chain"
      lines={exampleLines}
      total={exampleLines.reduce((sum, line) => sum + line.credits, 0)}
    />
  );
}
