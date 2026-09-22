import { CountUp } from "@/components/motion/count-up";
import { formatCredits } from "@/lib/format";
import { REFERRAL_PERCENT } from "@/lib/referral-rules";
import { MILESTONES, TASK_CREDITS } from "@/lib/scoring";
import { streakBonus } from "@/lib/streaks";

// One wallet's month, as an illustration. Not real data, but every task value
// is read from the scoring rules so the picture can't drift from them.
const STREAK_DAYS = 12;
const streak = Array.from({ length: STREAK_DAYS }, (_, day) => streakBonus(day + 1)).reduce((sum, bonus) => sum + bonus, 0);

const sources = [
  { label: "Referrals", note: `${REFERRAL_PERCENT}% of 3 friends' claims`, credits: 1130 },
  { label: "Contract interactions", note: "12 calls", credits: 12 * TASK_CREDITS.contract_call },
  { label: "Streak bonus", note: `${STREAK_DAYS} days in a row`, credits: streak },
  { label: "Deployed a contract", note: "1 deploy", credits: TASK_CREDITS.deploy },
  { label: "Milestone", note: `${MILESTONES[1].txs} transactions`, credits: MILESTONES[1].credits },
  { label: "Partner protocol", note: "1 swap", credits: 250 },
];

const total = sources.reduce((sum, source) => sum + source.credits, 0);
const largest = Math.max(...sources.map((source) => source.credits));

// The rows fill in one after another once the card is looked at; the order is
// read by `.meter-row` in landing.css. The total counts up on its own.
const order = (index: number) => ({ "--i": index }) as React.CSSProperties;

export function CreditMeter() {
  return (
    <div className="card w-full max-w-sm p-6 shadow-[0_18px_40px_-18px_var(--shade)] sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Credit build-up</p>
        <span className="chip">Example</span>
      </div>
      <p className="mt-1 font-mono text-xs text-mist">0x71C7…976F · Robinhood Chain · 30 days</p>

      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-5xl font-semibold tracking-tight text-fog">
          <CountUp value={total} delay={300} />
        </span>
        <span className="text-sm text-mist">credits</span>
      </div>
      <p className="mt-1 font-mono text-xs text-mist">≈ ${(total / 1000).toFixed(2)} of AI usage</p>

      <ul className="mt-7 space-y-4">
        {sources.map((source, index) => (
          <li key={source.label} style={order(index)} className="meter-row">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-fog">
                {source.label}
                <span className="text-mist"> · {source.note}</span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-fog">+{formatCredits(source.credits)}</span>
            </div>
            <div className="meter-track mt-1.5">
              <span className="meter-bar" style={{ width: `${(source.credits / largest) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
