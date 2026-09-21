import { TopUp } from "@/components/top-up";
import { costExamples } from "@/lib/cost-examples";
import { formatCredits } from "@/lib/format";
import { CREDITS_PER_USD, MARGIN, MIN_CREDITS_PER_REQUEST } from "@/lib/pricing";
import { PageHeader, Stack } from "../page-header";

export const metadata = { title: "Credits — Kredit" };

const rules = [
  [`${formatCredits(CREDITS_PER_USD)} credits`, "pay for $1 of AI usage"],
  [`+${Math.round(MARGIN * 100)}%`, "service fee on top of what the model's provider charges"],
  [`${MIN_CREDITS_PER_REQUEST} credit`, "is the least any request costs; failed requests are free"],
];

export default function Credits() {
  return (
    <>
      <PageHeader
        title="Credits"
        lede="How credits are priced, what a request costs, and how to buy more when your record has not earned enough."
      />

      <div className="kpi-strip animate-rise" style={{ "--kpis": 3 } as React.CSSProperties}>
        {rules.map(([value, text], index) => (
          <div key={text} className="kpi">
            <p className={`kpi-value ${index === 0 ? "text-accent" : ""}`}>{value}</p>
            <p className="kpi-note">{text}</p>
          </div>
        ))}
      </div>

      <section className="mt-10 animate-rise">
        <h2 className="section-label">
          What requests cost
          <span className="text-xs font-normal text-mist">Longer questions and longer answers cost more</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="grid-table min-w-[34rem]">
            <thead>
              <tr>
                <th>Request</th>
                <th>Size</th>
                <th className="num">Tokens in / out</th>
                <th className="num">Credits</th>
                <th className="num">≈ USD</th>
              </tr>
            </thead>
            <tbody>
              {costExamples.map((example) => (
                <tr key={example.name}>
                  <td className="font-medium">{example.name}</td>
                  <td className="text-mist">{example.detail}</td>
                  <td className="num text-mist">
                    {formatCredits(example.inputTokens)} / {formatCredits(example.outputTokens)}
                  </td>
                  <td className="num">{formatCredits(example.credits)}</td>
                  <td className="num text-mist">${example.usd.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-mist">
          Worked out by the same pricing function that bills you. When a provider reports the exact price of a call,
          that price is used instead. Every response also carries <span className="font-mono text-fog">x-kredit-credits-charged</span> and{" "}
          <span className="font-mono text-fog">x-kredit-balance</span>, so your code always knows what a call cost.
        </p>
      </section>

      <div className="mt-10">
        <Stack>
          <TopUp />
        </Stack>
      </div>
    </>
  );
}
