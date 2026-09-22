import { CountUp } from "@/components/motion/count-up";
import { formatCredits } from "@/lib/format";

type ReceiptProps = {
  badge: string;
  subtitle: string;
  lines: { label: string; credits: number }[];
  total: number;
  emptyText?: string;
  /** "print" feeds the receipt in line by line; "live" just lets the total and bars move as they change. */
  animated?: "print" | "live";
};

// Where a row sits in the print order; read by `.receipt-print .print-line` / `.print-bar`.
const printOrder = (index: number) => ({ "--i": index }) as React.CSSProperties;

export function Receipt({ badge, subtitle, lines, total, emptyText, animated }: ReceiptProps) {
  // The total starts counting as the header inks in (timings mirror globals.css).
  const totalDelay = 300;
  const largest = Math.max(1, ...lines.map((line) => Math.abs(line.credits)));

  return (
    <div
      className={`card w-full max-w-sm p-6 shadow-[0_18px_40px_-18px_var(--shade)] sm:p-7 ${
        animated === "print" ? "receipt-print" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Kredit receipt</p>
        <span className="chip">{badge}</span>
      </div>
      <p className="mt-1 font-mono text-xs text-mist">{subtitle}</p>

      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-5xl font-semibold tracking-tight text-fog">
          {animated === "print" && <CountUp value={total} delay={totalDelay} />}
          {animated === "live" && <CountUp value={total} duration={500} />}
          {!animated && formatCredits(total)}
        </span>
        <span className="text-sm text-mist">credits</span>
      </div>
      <p className="mt-1 font-mono text-xs text-mist">≈ ${(total / 1000).toFixed(2)} of AI usage</p>

      <ul className="mt-7 space-y-4">
        {lines.length === 0 && <li className="text-sm text-mist">{emptyText}</li>}
        {lines.map((line, index) => {
          const deduction = line.credits < 0;
          return (
            <li key={line.label} style={printOrder(index)} className="print-line">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={`min-w-0 truncate ${deduction ? "text-mist" : "text-fog"}`}>{line.label}</span>
                <span className={`shrink-0 font-mono text-xs tabular-nums ${deduction ? "text-mist" : "text-fog"}`}>
                  {deduction ? "−" : "+"}
                  {formatCredits(Math.abs(line.credits))}
                </span>
              </div>
              <div className="meter-track mt-1.5">
                <span
                  className={`receipt-bar print-bar ${deduction ? "receipt-bar-dim" : ""}`}
                  style={{ width: `${(Math.abs(line.credits) / largest) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
