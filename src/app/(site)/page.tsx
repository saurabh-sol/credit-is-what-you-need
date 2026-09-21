import Link from "next/link";
import { Fragment } from "react";
import { ApiDemo } from "@/components/api-demo";
import { Estimator } from "@/components/estimator";
import { ActivityIcon, ArrowRightIcon, ArrowUpRightIcon, CheckIcon, PlusIcon, SparkIcon, UsersIcon } from "@/components/icons";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { LoopBeam } from "@/components/landing/loop-beam";
import { ModelOrbit } from "@/components/landing/model-orbit";
import { SectionHeading } from "@/components/landing/section-heading";
import { HeaderFocus, KeyStatus, ModelStream, PromptBar, TaskFeed } from "@/components/live-bento";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { Tilt } from "@/components/motion/tilt";
import { ExampleReceipt } from "@/components/receipt";
import { TopUpTeaser } from "@/components/top-up-teaser";
import { WalletButton } from "@/components/wallet-button";
import { costExamples } from "@/lib/cost-examples";
import { formatCredits } from "@/lib/format";
import { GAS_BACK_PERCENT } from "@/lib/gasback";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { CREDITS_PER_USD, MARGIN, MIN_CREDITS_PER_REQUEST } from "@/lib/pricing";
import { ROYALTY_PERCENT } from "@/lib/royalties";
import { DAILY_TASK_CAP, MILESTONES, TASK_CREDITS } from "@/lib/scoring";

// Every number on this page is read from the rules that do the real scoring and
// billing, so the page can't drift from them.

// For the few pictures the shared icon family lacks, drawn to the same rules.
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0 fill-none stroke-current"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const proofPoints = ["No gas to sign in", "OpenAI-compatible", "Revoke keys anytime"];

// Places that speak the OpenAI API, mixed with what a Kredit key adds on top.
const compatibility = [
  "Cursor",
  "Balance in every response header",
  "Postman",
  `Gas-Back · ${GAS_BACK_PERCENT}% of gas`,
  "OpenAI Python SDK",
  "Builder Royalties",
  "OpenAI Node SDK",
  "curl",
];

const topMilestone = Math.max(...MILESTONES.map((milestone) => milestone.credits));

const earnings = [
  {
    icon: (
      <Glyph>
        <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9.5 9 5 9-5M3 17l9 5 9-5" />
      </Glyph>
    ),
    name: "Deploy a contract",
    text: "Every contract you deploy on Robinhood Chain is a task.",
    value: formatCredits(TASK_CREDITS.deploy),
    unit: "credits each",
  },
  {
    icon: <ActivityIcon />,
    name: "Contract interaction",
    text: "Any successful call to a contract counts.",
    value: formatCredits(TASK_CREDITS.contract_call),
    unit: "credits each",
  },
  {
    icon: <ArrowUpRightIcon />,
    name: "Transfer",
    text: "Plain transfers count too, at a smaller rate.",
    value: formatCredits(TASK_CREDITS.transfer),
    unit: "credits each",
  },
  {
    icon: (
      <Glyph>
        <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-1.8.8-3 1.8-4 .3 1.6 1.2 2.4 2.2 2.6C10.5 9 11 6 12 3Z" />
      </Glyph>
    ),
    name: "Gas-Back",
    text: "A share of the gas you spend comes back as AI credits.",
    value: `${GAS_BACK_PERCENT}%`,
    unit: "of your gas",
  },
  {
    icon: <UsersIcon />,
    name: "Builder Royalties",
    text: "When other people use a contract you deployed, you earn from their activity.",
    value: `${ROYALTY_PERCENT}%`,
    unit: "of their gas",
  },
  {
    icon: (
      <Glyph>
        <path d="M5 21V4m0 1h12l-2.5 4 2.5 4H5" />
      </Glyph>
    ),
    name: "Milestones",
    text: `One-time bonuses at ${MILESTONES.map((milestone) => milestone.txs).join(", ")} transactions.`,
    value: formatCredits(topMilestone),
    unit: "credits at most",
  },
];

// Live vignettes. The grid is six columns wide; spans keep the rows uneven on purpose.
const bento = [
  {
    span: "md:col-span-4",
    live: <PromptBar />,
    title: "One key, whichever model fits",
    text: "Ask from Cursor, Postman or your own code. Kredit routes the call and takes the cost from your credits.",
  },
  {
    span: "md:col-span-2",
    live: <KeyStatus />,
    title: "Keys you can see and revoke",
    text: "One key per tool. Revoke any of them and it stops working on the next request.",
  },
  {
    span: "md:col-span-2",
    live: <TaskFeed />,
    title: "Every task counted",
    text: "Deployments, swaps, interactions and milestones, scored by public rules.",
  },
  {
    span: "md:col-span-4",
    live: <HeaderFocus />,
    title: "The bill arrives with the answer",
    text: "Two response headers tell your code what the call cost and what is left. No dashboard needed.",
  },
  {
    span: "md:col-span-6",
    live: <ModelStream />,
    title: "The makers you already use",
    text: "Reached through one OpenAI-compatible endpoint. Which models are on depends on the provider this server is connected to.",
  },
];

const dashboardPoints = [
  {
    title: "Focused pages",
    text: "Earning, keys, activity and credits each get a page of their own.",
  },
  {
    title: "Jump anywhere",
    text: (
      <>
        Press <kbd className="kbd">Cmd</kbd> <kbd className="kbd">K</kbd> or <kbd className="kbd">Ctrl</kbd>{" "}
        <kbd className="kbd">K</kbd> and go to any page by name.
      </>
    ),
  },
  {
    title: "Live balance everywhere",
    text: "Your credit balance stays in view on every page.",
  },
];

const stats = [
  { value: GAS_BACK_PERCENT, suffix: "%", label: "of your gas, back as credits" },
  { value: ROYALTY_PERCENT, suffix: "%", label: "of their gas, when others use your contract" },
  { value: TASK_CREDITS.deploy, suffix: "", label: "credits for every contract you deploy" },
  { value: CREDITS_PER_USD, suffix: "", label: "credits buy $1 of AI usage" },
];

const topUpPoints = [
  "You pay from your own wallet, straight to the treasury.",
  "The server credits only what the transaction receipt proves.",
  "Every top-up shows on the public distribution page.",
];

const faqs = [
  {
    question: "What is a credit worth?",
    answer: `${formatCredits(CREDITS_PER_USD)} credits pay for $1 of AI usage. Each call is charged by what the model's provider charged plus a ${Math.round(MARGIN * 100)}% service fee, with a ${MIN_CREDITS_PER_REQUEST}-credit minimum, and every response tells you what it cost and what is left.`,
  },
  {
    question: "Does connecting my wallet cost anything?",
    answer: "No. You sign one free message to prove the wallet is yours. There is no transaction and no gas.",
  },
  {
    question: "How are my credits calculated?",
    answer: `A deployed contract earns ${TASK_CREDITS.deploy} credits, a contract interaction ${TASK_CREDITS.contract_call} and a transfer ${TASK_CREDITS.transfer}. One-time bonuses land at ${MILESTONES.map((milestone) => milestone.txs).join(", ")} transactions. Failed transactions earn nothing, every transaction pays once, and task rewards are capped at ${formatCredits(DAILY_TASK_CAP)} credits per wallet per day.`,
  },
  {
    question: "Where can I spend them?",
    answer: "Anywhere that speaks the OpenAI API: Postman, Cursor, your own code. Point the base URL at Kredit and paste your key. The built-in kredit/echo model repeats your message and is billed by length like a real model, so you can test a key and see how charges behave.",
  },
  {
    question: "Can I buy credits instead of earning them?",
    answer: "Earning is the main way and costs nothing. Once top-ups are open you can also send the project token from your own wallet and receive credits when the chain confirms the payment. Every top-up is listed on the public distribution page.",
  },
  {
    question: "What if a key leaks?",
    answer: `Revoke it from your dashboard and it stops working at once. You can keep up to ${MAX_ACTIVE_KEYS} active keys, one per tool, so revoking one never breaks the others.`,
  },
  {
    question: "Is Kredit part of Robinhood?",
    answer: "No. Kredit is an independent project built on Robinhood Chain and is not affiliated with Robinhood.",
  },
];

const headline = ["Your", "on-chain", "activity", "has"];

// Delay for the hero's entrance sequence, one beat per element.
const beat = (index: number) => ({ animationDelay: `${index * 90}ms` });

const quietLink = "group inline-flex items-center gap-1.5 text-sm text-mist transition hover:text-fog";
const quietArrow = "size-3.5 transition-transform duration-300 group-hover:translate-x-1";

export default function Home() {
  return (
    <>
      {/* Pulled up under the sticky header (4rem), so the background runs behind it. */}
      <section className="relative isolate -mt-16 overflow-hidden pt-16">
        <div className="hero-bg -z-10 [--focus:50%_74%] md:[--focus:75%_54%]" aria-hidden>
          <div className="backdrop-light" />
          <div className="dot-field" />
        </div>

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.05fr_1fr] md:py-24 lg:gap-16 lg:py-28">
          <div>
            {/* Sized so each half of the sentence holds one line beside the orbit; phones wrap on their own. */}
            <h1 className="text-4xl font-semibold leading-[1.06] tracking-tight text-balance sm:text-5xl">
              {headline.map((word, index) => (
                <Fragment key={word}>
                  <span style={beat(index + 1)} className="inline-block animate-rise">
                    {word}&nbsp;
                  </span>
                  {word === "activity" && <br className="hidden lg:block" />}
                </Fragment>
              ))}
              <span style={beat(headline.length + 1)} className="inline-block animate-rise">
                <span className="text-shine">purchasing power</span>
              </span>
            </h1>
            <p style={beat(6)} className="mt-6 max-w-[52ch] animate-rise text-lg leading-relaxed text-mist">
              Kredit turns your on-chain reputation and activity into AI credits
              you can spend across models, agents and APIs.
            </p>
            <div style={beat(8)} className="mt-9 flex animate-rise flex-wrap items-center gap-x-6 gap-y-4">
              <WalletButton label="Connect and see your record" />
              <a href="#how" className={quietLink}>
                How it works
                <ArrowRightIcon className={quietArrow} />
              </a>
            </div>
            <ul style={beat(10)} className="mt-10 flex animate-rise flex-wrap gap-x-6 gap-y-2 text-sm text-mist">
              {proofPoints.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <CheckIcon className="size-4 text-accent" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div style={beat(5)} className="animate-rise">
            <ModelOrbit />
          </div>
        </div>
      </section>

      <section aria-label="Where a Kredit key works" className="border-y border-line bg-surface/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 md:flex-row md:items-center md:gap-10">
          <p className="shrink-0 text-sm text-mist">Works wherever the OpenAI API works</p>
          <div className="marquee min-w-0 flex-1">
            {/* Slower than the default: this is a footnote to the hero, not a ticker. */}
            <div className="marquee-track font-mono text-xs uppercase tracking-widest text-mist" style={{ animationDuration: "56s" }}>
              {[0, 1].map((copy) => (
                <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0">
                  {compatibility.map((item) => (
                    <li key={item} className="flex items-center whitespace-nowrap">
                      <span className="px-6">{item}</span>
                      <SparkIcon className="size-3 text-accent" />
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-24 md:py-32">
        <SectionHeading eyebrow="How it works" title="From wallet activity to any model">
          Three steps and one free signature. The work you already did on-chain does the rest.
        </SectionHeading>
        <div className="mt-16">
          <LoopBeam />
        </div>
      </section>

      <section id="earn" className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-x-16 gap-y-14 px-4 py-24 md:grid-cols-[0.85fr_1.15fr] md:py-32">
          {/* Reads second on a phone, where the explanation should come first. */}
          <Reveal variant="mark" className="print-on-view order-last flex justify-center md:order-first md:justify-start">
            <Tilt className="w-full max-w-sm">
              <ExampleReceipt />
            </Tilt>
          </Reveal>

          <div>
            <SectionHeading eyebrow="Earn" title="What your record earns">
              Credits come from what you actually do on-chain, never from luck.
              The rules are public and the same for every wallet.
            </SectionHeading>
            <ul className="mt-10 border-t border-line">
              {earnings.map((way, index) => (
                <Reveal as="li" key={way.name} delay={index * 60} className="entity group items-start gap-4 py-4">
                  <span className="entity-icon mt-0.5 transition-colors duration-300 group-hover:text-accent">{way.icon}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[0.9375rem] font-medium text-fog">{way.name}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-mist">{way.text}</p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="block font-mono text-base font-semibold tabular-nums text-fog">{way.value}</span>
                    <span className="block text-xs text-mist">{way.unit}</span>
                  </p>
                </Reveal>
              ))}
            </ul>
            <Reveal delay={120}>
              <p className="mt-6 max-w-[60ch] text-sm leading-relaxed text-mist">
                Task rewards are capped at {formatCredits(DAILY_TASK_CAP)} credits per wallet per day.
                Failed transactions earn nothing, and every transaction pays once.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="live" className="mx-auto max-w-6xl px-4 py-24 md:py-32">
        <SectionHeading eyebrow="Watch it work" title="From a transaction to a model's answer">
          Your record earns the credits, your key spends them, and every response
          tells you what is left. The numbers below are examples.
        </SectionHeading>
        {/* minmax(0, 1fr): without it the one phone column grows as wide as the logo marquee inside it. */}
        <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-10 md:grid-cols-6">
          {bento.map((tile, index) => (
            <Reveal key={tile.title} delay={index * 90} className={tile.span}>
              <div className={`card flex flex-col justify-center overflow-hidden p-7 ${tile.span === "md:col-span-6" ? "py-9" : "min-h-64"}`}>
                {tile.live}
              </div>
              <h3 className="mt-5 font-semibold">{tile.title}</h3>
              <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-mist">{tile.text}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10">
          <Link href="/docs#models" className={quietLink}>
            See which models this server can reach
            <ArrowRightIcon className={quietArrow} />
          </Link>
        </Reveal>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-x-16 gap-y-14 px-4 py-24 md:py-32 lg:grid-cols-[0.85fr_1.3fr]">
          <div>
            <SectionHeading eyebrow="The dashboard" title="A dashboard that stays out of your way">
              Once you connect, four numbers tell you where you stand. Everything else is one step away.
            </SectionHeading>
            <ul className="mt-10 border-t border-line">
              {dashboardPoints.map((point, index) => (
                <Reveal as="li" key={point.title} delay={index * 80} className="flex items-start gap-3 border-b border-line/60 py-4">
                  <CheckIcon className="mt-1 size-4 text-accent" />
                  <div>
                    <h3 className="text-[0.9375rem] font-medium text-fog">{point.title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-mist">{point.text}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
          <Reveal delay={150} className="min-w-0">
            <DashboardPreview />
          </Reveal>
        </div>
      </section>

      <section id="estimate" className="mx-auto max-w-6xl px-4 py-24 md:py-32">
        <SectionHeading eyebrow="Estimate" title="See what your record could earn">
          Drag the sliders. The receipt updates with the real scoring rules,
          daily cap and milestones included.
        </SectionHeading>
        <Reveal delay={120} className="mt-14">
          <Estimator />
        </Reveal>
      </section>

      <section id="api" className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl items-start gap-x-16 gap-y-14 px-4 py-24 md:py-32 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <SectionHeading eyebrow="Build" title="One key, in the tools you already use">
              Your key speaks the OpenAI API format, so it drops into tools you
              already use. Change the base URL, paste the key, done.
            </SectionHeading>
            <Reveal delay={240} className="mt-8 flex flex-wrap gap-3">
              <Link href="/docs" className="btn-ghost px-5 py-2.5 text-sm">
                Read the API docs
              </Link>
              <Link href="/playground" className="btn-ghost px-5 py-2.5 text-sm">
                Open the playground
              </Link>
            </Reveal>

            <Reveal delay={120} className="mt-14">
              <h3 className="section-label">
                What requests cost
                <span className="text-xs font-normal text-mist">Credits</span>
              </h3>
              <ul>
                {costExamples.map((example) => (
                  <li key={example.name} className="flex items-baseline justify-between gap-4 border-b border-line/60 py-3 text-sm">
                    <span className="min-w-0">
                      {example.name}
                      <span className="ml-3 hidden text-mist sm:inline">{example.detail}</span>
                    </span>
                    <span className="font-mono tabular-nums">{formatCredits(example.credits)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 max-w-[60ch] text-sm leading-relaxed text-mist">
                Longer questions and longer answers cost more. Every response carries{" "}
                <span className="font-mono text-xs text-fog">x-kredit-credits-charged</span> and{" "}
                <span className="font-mono text-xs text-fog">x-kredit-balance</span>, so your code always knows what a call cost.
              </p>
            </Reveal>
          </div>
          <Reveal delay={150} className="min-w-0 lg:sticky lg:top-24">
            <ApiDemo />
          </Reveal>
        </div>
      </section>

      <section aria-label="Kredit in four numbers" className="mx-auto max-w-6xl px-4 pt-24 md:pt-32">
        <Reveal>
          <dl className="kpi-strip">
            {stats.map((stat, index) => (
              <div key={stat.label} className="kpi flex flex-col-reverse justify-end gap-3 p-5 sm:p-7">
                <dt className="max-w-[24ch] text-sm leading-relaxed text-mist">{stat.label}</dt>
                <dd className={`kpi-value mt-0 text-3xl leading-none sm:text-4xl lg:text-5xl ${index === 0 ? "text-accent" : ""}`}>
                  <CountUp value={stat.value} />
                  {stat.suffix}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      <section id="buy" className="mx-auto max-w-6xl px-4 py-24 md:py-32">
        <div className="grid items-center gap-x-16 gap-y-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <SectionHeading eyebrow="Need more?" title="Top up with the project token">
              Earning comes first, and it is free. When a big job needs more than your
              record has earned, send tokens from your own wallet and the credits land
              as soon as the chain confirms. Nothing is approved, locked or held.
            </SectionHeading>
            <Reveal delay={260}>
              <ul className="mt-8 space-y-3 text-sm text-mist">
                {topUpPoints.map((point) => (
                  <li key={point} className="flex items-start gap-2.5">
                    <CheckIcon className="mt-0.5 size-4 text-accent" />
                    {point}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={150}>
            <TopUpTeaser />
          </Reveal>
        </div>
      </section>

      <section id="faq" className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-x-16 gap-y-12 px-4 py-24 md:py-32 lg:grid-cols-[1fr_1.6fr]">
          <div className="self-start lg:sticky lg:top-24">
            <SectionHeading eyebrow="FAQ" title="Questions, answered">
              The short version of how credits are earned, priced and spent.
            </SectionHeading>
            <Reveal delay={240} className="mt-6">
              <Link href="/docs" className={quietLink}>
                The API docs have the rest
                <ArrowRightIcon className={quietArrow} />
              </Link>
            </Reveal>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {faqs.map((faq, index) => (
              <Reveal key={faq.question} delay={index * 60}>
                <details className="faq group" name="faq">
                  <summary className="flex items-center justify-between gap-6 py-5 text-base font-medium transition hover:text-accent sm:text-lg">
                    {faq.question}
                    <span
                      aria-hidden
                      className="chevron grid size-8 shrink-0 place-items-center rounded-full border border-line text-mist group-open:border-accent/50 group-open:text-accent"
                    >
                      <PlusIcon />
                    </span>
                  </summary>
                  <p className="max-w-[60ch] pb-6 leading-relaxed text-mist">{faq.answer}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-24 md:py-32">
        <Reveal className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-2xl border border-line bg-surface px-6 py-16 sm:px-12 md:py-20">
          <div className="hero-bg -z-10 [--focus:100%_0%]" aria-hidden>
            <div className="dot-field" />
          </div>
          <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="max-w-[18ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
                Your record is already worth <span className="text-shine">something.</span>
              </h2>
              <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-mist">
                Connect your wallet, sign one free message, and see the receipt.
              </p>
            </div>
            <div className="shrink-0">
              <WalletButton label="Connect and see your record" />
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
