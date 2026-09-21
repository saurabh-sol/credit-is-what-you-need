import { ExampleReceipt } from "@/components/receipt";
import { WalletButton } from "@/components/wallet-button";

const ways = [
  {
    name: "On-chain record",
    text: "Submit your wallet. Every transaction, swap and deployment on Robinhood Chain is a task, and every task is worth credits.",
  },
  {
    name: "Gas-Back",
    text: "40% of the gas you spend comes back as AI credits. Automatic, on every transaction.",
  },
  {
    name: "Builder Royalties",
    text: "Deploy a contract. When other people use it, you earn credits from their activity. The chain pays its builders in AI.",
  },
  {
    name: "Budget Keys",
    text: "Create a child key with a spending limit for your agent, a teammate or a device. If it leaks, the damage is capped.",
  },
];

const steps = [
  ["Connect", "Connect the wallet you use on Robinhood Chain and sign one free message."],
  ["Scan", "We read your on-chain record and show a receipt: every task and what it earned."],
  ["Spend anywhere", "Claim your credits, copy your API key, and use it in Postman, Cursor or any MCP client."],
];

export default function Home() {
  return (
    <>
      <section className="glow">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.1fr_1fr] md:py-24">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-lime">
              AI credits on Robinhood Chain
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">
              Every task deserves <span className="text-lime">credits.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist">
              Fuel turns the work you already do on-chain into AI credits. No
              spin wheels, no luck. Earn them from your record, then spend them
              anywhere with a normal API key.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <WalletButton label="Connect and see your record" />
              <a href="#how" className="text-sm text-mist underline-offset-4 transition hover:text-fog hover:underline">
                How it works
              </a>
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <ExampleReceipt />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Four ways to earn</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {ways.map((way, index) => (
            <article key={way.name} className="rounded-2xl border border-line bg-surface p-6 transition hover:border-lime/60">
              <p className="font-mono text-xs text-lime">0{index + 1}</p>
              <h3 className="mt-2 text-lg font-semibold">{way.name}</h3>
              <p className="mt-2 leading-relaxed text-mist">{way.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {steps.map(([title, text], index) => (
              <li key={title}>
                <p className="grid size-9 place-items-center rounded-full border border-lime font-mono text-sm text-lime">
                  {index + 1}
                </p>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 leading-relaxed text-mist">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Spend them outside the platform</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-mist">
          Your key speaks the OpenAI API format, so it drops into tools you
          already use. Change the base URL, paste the key, done.
        </p>
        <pre className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface p-5 font-mono text-sm leading-relaxed">
          <code>
            <span className="text-lime">POST</span> /v1/chat/completions{"\n"}
            Authorization: Bearer fuel_sk_••••••••{"\n\n"}
            {`{ "model": "fuel/echo", "messages": [{ "role": "user", "content": "hi" }] }`}
          </code>
        </pre>
        <p className="mt-3 text-sm text-mist">The API is live: create a key on your dashboard. The MCP server arrives in a later phase.</p>
      </section>
    </>
  );
}
