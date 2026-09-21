import { ApiDemo } from "@/components/api-demo";
import { Estimator } from "@/components/estimator";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { Spotlight } from "@/components/motion/spotlight";
import { Tilt } from "@/components/motion/tilt";
import { ExampleReceipt } from "@/components/receipt";
import { WalletButton } from "@/components/wallet-button";
import { GAS_BACK_PERCENT } from "@/lib/gasback";
import { CREDITS_PER_USD } from "@/lib/pricing";
import { ROYALTY_PERCENT } from "@/lib/royalties";
import { DAILY_TASK_CAP, MILESTONES, TASK_CREDITS } from "@/lib/scoring";

// Each icon is the inside of a 24×24 stroked <svg>.
const ways = [
  {
    name: "On-chain record",
    text: "Submit your wallet. Every transaction, swap and deployment on Robinhood Chain is a task, and every task is worth credits.",
    icon: <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  },
  {
    name: "Gas-Back",
    text: "40% of the gas you spend comes back as AI credits. Automatic, on every transaction.",
    icon: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-1.8.8-3 1.8-4 .3 1.6 1.2 2.4 2.2 2.6C10.5 9 11 6 12 3Z" />,
  },
  {
    name: "Builder Royalties",
    text: "Deploy a contract. When other people use it, you earn credits from their activity. The chain pays its builders in AI.",
    icon: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9.5 9 5 9-5M3 17l9 5 9-5" />,
  },
  {
    name: "Budget Keys",
    text: "Create a child key with a spending limit for your agent, a teammate or a device. If it leaks, the damage is capped.",
    icon: (
      <>
        <circle cx="7.5" cy="15.5" r="4.5" />
        <path d="M10.7 12.3 20 3m-4 4 3 3m-6-1 2.5 2.5" />
      </>
    ),
  },
];

const steps = [
  ["Connect", "Connect the wallet you use on Robinhood Chain and sign one free message."],
  ["Scan", "We read your on-chain record and show a receipt: every task and what it earned."],
  ["Spend anywhere", "Claim your credits, copy your API key, and use it in Postman, Cursor or any MCP client."],
];

const highlights = [
  "OpenAI-compatible API",
  "Gas-Back · 40% of gas",
  "Builder Royalties",
  "Revocable API keys",
  "Works in Postman",
  "Works in Cursor",
  "One free signature to start",
  "Balance in every response header",
];

// The numbers come straight from the scoring rules, so the page can't drift from them.
const stats = [
  { value: GAS_BACK_PERCENT, suffix: "%", label: "of your gas, back as credits" },
  { value: ROYALTY_PERCENT, suffix: "%", label: "of their gas, when others use your contract" },
  { value: TASK_CREDITS.deploy, suffix: "", label: "credits for every contract you deploy" },
  { value: CREDITS_PER_USD, suffix: "", label: "credits buy $1 of AI usage" },
];

const thousands = (value: number) => value.toLocaleString("en-US");

const faqs = [
  {
    question: "What is a credit worth?",
    answer: `${thousands(CREDITS_PER_USD)} credits pay for $1 of AI usage. Each call is charged by what the model actually cost, with a 1-credit minimum, and every response tells you what it cost and what is left.`,
  },
  {
    question: "Does connecting my wallet cost anything?",
    answer: "No. You sign one free message to prove the wallet is yours. There is no transaction and no gas.",
  },
  {
    question: "How are my credits calculated?",
    answer: `A deployed contract earns ${TASK_CREDITS.deploy} credits, a contract interaction ${TASK_CREDITS.contract_call} and a transfer ${TASK_CREDITS.transfer}. One-time bonuses land at ${MILESTONES.map((milestone) => milestone.txs).join(", ")} transactions. Failed transactions earn nothing, every transaction pays once, and task rewards are capped at ${thousands(DAILY_TASK_CAP)} credits per wallet per day.`,
  },
  {
    question: "Where can I spend them?",
    answer: "Anywhere that speaks the OpenAI API: Postman, Cursor, your own code. Point the base URL at Fuel and paste your key. The built-in fuel/echo model lets you test a key for the minimum charge.",
  },
  {
    question: "What if a key leaks?",
    answer: "Revoke it from your dashboard and it stops working at once. You can keep several keys, one per tool, so revoking one never breaks the others.",
  },
  {
    question: "Is Fuel part of Robinhood?",
    answer: "No. Fuel is an independent project built on Robinhood Chain and is not affiliated with Robinhood.",
  },
];

const headline = ["Every", "task", "deserves"];

// Delay for the hero's entrance sequence, one beat per element.
const beat = (index: number) => ({ animationDelay: `${index * 90}ms` });

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <Reveal>
      <p className="font-mono text-xs uppercase tracking-widest text-lime">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-mist">{children}</p>}
    </Reveal>
  );
}

export default function Home() {
  return (
    <>
      <section className="relative isolate -mt-16 overflow-hidden pt-16">
        <div className="hero-bg -z-10" aria-hidden>
          <div className="aurora aurora-a" />
          <div className="aurora aurora-b" />
          <div className="grid-lines" />
          <div className="grain" />
        </div>

        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 md:grid-cols-[1.1fr_1fr] md:py-28">
          <div>
            <p
              style={beat(0)}
              className="inline-flex animate-rise items-center gap-2.5 rounded-full border border-lime/25 bg-lime/5 px-3.5 py-1.5 font-mono text-xs uppercase tracking-widest text-lime"
            >
              <span className="live-dot" />
              AI credits on Robinhood Chain
            </p>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-balance sm:text-7xl">
              {headline.map((word, index) => (
                <span key={word} style={beat(index + 1)} className="inline-block animate-rise">
                  {word}&nbsp;
                </span>
              ))}
              <span style={beat(4)} className="inline-block animate-rise">
                <span className="text-shine">credits.</span>
              </span>
            </h1>
            <p style={beat(6)} className="mt-6 max-w-xl animate-rise text-lg leading-relaxed text-mist">
              Fuel turns the work you already do on-chain into AI credits. No
              spin wheels, no luck. Earn them from your record, then spend them
              anywhere with a normal API key.
            </p>
            <div style={beat(8)} className="mt-9 flex animate-rise flex-wrap items-center gap-5">
              <WalletButton label="Connect and see your record" />
              <a href="#how" className="group text-sm text-mist transition hover:text-fog">
                How it works{" "}
                <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
              </a>
            </div>
            <ul style={beat(10)} className="mt-10 flex animate-rise flex-wrap gap-x-6 gap-y-2 text-sm text-mist">
              {["No gas to sign in", "OpenAI-compatible", "Revoke keys anytime"].map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <svg viewBox="0 0 16 16" className="size-3.5 fill-none stroke-lime stroke-2" aria-hidden>
                    <path d="m3 8.5 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-center md:justify-end">
            <div className="w-full max-w-sm animate-float">
              <Tilt>
                <ExampleReceipt />
              </Tilt>
            </div>
          </div>
        </div>

        <div className="marquee border-y border-line/70 bg-surface/40 py-4 backdrop-blur-sm">
          <div className="marquee-track font-mono text-xs uppercase tracking-widest text-mist">
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0">
                {highlights.map((item) => (
                  <li key={item} className="flex items-center whitespace-nowrap">
                    <span className="px-6">{item}</span>
                    <span className="text-lime">✦</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </section>

      <section id="earn" className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <SectionHeading eyebrow="Earn" title="Four ways to earn">
          Credits come from what you actually do on-chain, never from luck.
        </SectionHeading>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {ways.map((way, index) => (
            <Reveal key={way.name} delay={index * 90} className="h-full">
              <Spotlight className="card card-lift group h-full p-7">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl border border-line bg-raised text-lime transition duration-500 group-hover:border-lime/50 group-hover:shadow-[0_0_24px_-4px_rgb(198_244_50/0.5)]">
                    <svg
                      viewBox="0 0 24 24"
                      className="size-5 fill-none stroke-current stroke-[1.6]"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      {way.icon}
                    </svg>
                  </span>
                  <span className="font-mono text-xs text-mist transition group-hover:text-lime">0{index + 1}</span>
                </div>
                <h3 className="mt-6 text-xl font-semibold">{way.name}</h3>
                <p className="mt-2 leading-relaxed text-mist">{way.text}</p>
              </Spotlight>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 md:pb-28">
        <Reveal>
          <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse justify-end gap-2 bg-ink p-7 transition-colors duration-500 hover:bg-surface">
                <dt className="text-sm leading-relaxed text-mist">{stat.label}</dt>
                <dd className="font-mono text-4xl font-semibold tracking-tight text-lime sm:text-5xl">
                  <CountUp value={stat.value} />
                  {stat.suffix}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      <section id="how" className="relative border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <SectionHeading eyebrow="Three steps" title="How it works" />
          <Reveal variant="mark" className="relative mt-14">
            <div className="absolute top-5 right-0 left-0 hidden h-px bg-line md:block" aria-hidden>
              <div className="timeline-line h-full bg-gradient-to-r from-lime via-lime to-transparent" />
            </div>
            <ol className="relative grid gap-10 md:grid-cols-3">
              {steps.map(([title, text], index) => (
                <Reveal as="li" key={title} delay={index * 220}>
                  <p
                    style={{ "--dot-delay": `${300 + index * 450}ms` } as React.CSSProperties}
                    className="step-dot grid size-10 place-items-center rounded-full border border-lime font-mono text-sm"
                  >
                    {index + 1}
                  </p>
                  <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                  <p className="mt-2 max-w-xs leading-relaxed text-mist">{text}</p>
                </Reveal>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      <section id="estimate" className="mx-auto max-w-6xl px-4 pt-20 md:pt-28">
        <SectionHeading eyebrow="Estimate" title="See what your record could earn">
          Drag the sliders. The receipt updates with the real scoring rules,
          daily cap and milestones included.
        </SectionHeading>
        <Reveal delay={120} className="mt-12">
          <Estimator />
        </Reveal>
      </section>

      <section id="api" className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.25fr]">
          <div>
            <SectionHeading eyebrow="Spend" title="Spend them outside the platform">
              Your key speaks the OpenAI API format, so it drops into tools you
              already use. Change the base URL, paste the key, done.
            </SectionHeading>
            <Reveal delay={120}>
              <p className="mt-6 text-sm leading-relaxed text-mist">
                The API is live: create a key on your dashboard. The MCP server
                arrives in a later phase.
              </p>
            </Reveal>
          </div>
          <Reveal delay={150} className="min-w-0">
            <ApiDemo />
          </Reveal>
        </div>
      </section>

      <section id="faq" className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:py-28 lg:grid-cols-[1fr_1.6fr]">
          <SectionHeading eyebrow="FAQ" title="Questions, answered" />
          <div className="divide-y divide-line border-y border-line">
            {faqs.map((faq, index) => (
              <Reveal key={faq.question} delay={index * 60}>
                <details className="faq group" name="faq">
                  <summary className="flex items-center justify-between gap-6 py-5 text-lg font-medium transition hover:text-lime">
                    {faq.question}
                    <span
                      aria-hidden
                      className="chevron grid size-8 shrink-0 place-items-center rounded-full border border-line font-mono text-lime group-open:border-lime/50"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-6 leading-relaxed text-mist">{faq.answer}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 md:py-28">
        <Reveal className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl border border-lime/20 bg-surface px-6 py-16 text-center md:py-20">
          <div className="hero-bg -z-10" aria-hidden>
            <div className="aurora aurora-a" />
            <div className="grid-lines" />
            <div className="grain" />
          </div>
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Your record is already worth <span className="text-shine">something.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-mist">
            Connect your wallet, sign one free message, and see the receipt.
          </p>
          <div className="mt-8 flex justify-center">
            <WalletButton label="Connect and see your record" />
          </div>
        </Reveal>
      </section>
    </>
  );
}
