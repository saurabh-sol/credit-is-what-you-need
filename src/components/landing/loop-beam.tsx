import { CheckIcon, CoinsIcon, SparkIcon, WalletIcon } from "@/components/icons";
import { ProviderLogo } from "@/components/model-logo";
import { Reveal } from "@/components/motion/reveal";
import { formatCredits } from "@/lib/format";
import { featuredProviders } from "@/lib/providers";
import { TASK_CREDITS } from "@/lib/scoring";

// Small illustrations of what each stage hands you. Not real data, but the credit
// values are read from the scoring rules so they can't drift from them.
const receiptLines = [
  { label: "Deployed a contract", credits: TASK_CREDITS.deploy },
  { label: "Contract interaction", credits: TASK_CREDITS.contract_call },
];
const receiptTotal = receiptLines.reduce((sum, line) => sum + line.credits, 0);

const makers = featuredProviders.slice(0, 5);

function SignedProof() {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-fog">0x71C7…976F</span>
        <span className="flex shrink-0 items-center gap-1.5 text-accent">
          <CheckIcon className="size-3.5" />
          Signed
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span>Network</span>
        <span className="truncate text-fog">Robinhood Chain</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-dashed border-line pt-2.5">
        <span>Gas paid</span>
        <span className="tabular-nums text-fog">0 ETH</span>
      </div>
    </>
  );
}

function ReceiptProof() {
  return (
    <>
      <ul className="space-y-1.5">
        {receiptLines.map((line) => (
          <li key={line.label} className="flex items-baseline justify-between gap-3">
            <span className="truncate">{line.label}</span>
            <span className="shrink-0 tabular-nums text-fog">+{formatCredits(line.credits)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-dashed border-line pt-2.5">
        <span>Claimable</span>
        <span className="tabular-nums font-semibold text-accent">{formatCredits(receiptTotal)}</span>
      </div>
    </>
  );
}

function ModelProof() {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-fog">kredit_sk_9fQk…h2Lw</span>
        <span className="shrink-0">API key</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span>Works in</span>
        <span className="truncate text-fog">Cursor, curl, SDKs</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-dashed border-line pt-2.5">
        <span className="flex items-center gap-2.5 text-fog">
          {makers.map((maker) => (
            <ProviderLogo key={maker.name} logo={maker.logo} className="size-4" />
          ))}
        </span>
        <span className="shrink-0">and more</span>
      </div>
    </>
  );
}

const stages = [
  {
    icon: WalletIcon,
    title: "Wallet activity",
    text: "Connect the wallet you use on Robinhood Chain and sign one free message.",
    proof: <SignedProof />,
  },
  {
    icon: CoinsIcon,
    title: "Credits",
    text: "Kredit scans your record, shows a receipt for every task, and you claim the total.",
    proof: <ReceiptProof />,
  },
  {
    icon: SparkIcon,
    title: "Any model",
    text: "Spend with an API key in the tools you already use, or straight in the playground.",
    proof: <ModelProof />,
  },
];

// Three stages joined by a line, with a light that keeps travelling along it and
// lights each stage, and the card hanging under it, as it passes. The motion is all
// CSS (see `.loop` in landing.css), timed from one shared duration, so the light and
// the stages can never drift apart.
// It starts when the row scrolls into view, which is all <Reveal> is here for.
export function LoopBeam() {
  return (
    <Reveal variant="mark" className="loop">
      <div className="loop-track" aria-hidden>
        <span className="loop-beam" />
      </div>
      <ol className="relative grid gap-8 md:grid-cols-3 md:gap-6">
        {stages.map((stage, index) => (
          <Reveal as="li" key={stage.title} delay={index * 160} className="h-full">
            <div className="flex h-full gap-5 md:flex-col md:gap-6" style={{ "--stage": index } as React.CSSProperties}>
              <span className="loop-tile">
                <stage.icon className="size-5" />
                <span className="loop-lit">
                  <stage.icon className="size-5" />
                </span>
              </span>
              <div className="loop-card card card-lift flex min-w-0 flex-1 flex-col p-6">
                <p className="loop-numeral" aria-hidden>
                  0{index + 1}
                </p>
                <p className="font-mono text-xs text-mist">Step {index + 1}</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">{stage.title}</h3>
                <p className="mt-2 mb-6 max-w-xs leading-relaxed text-mist">{stage.text}</p>
                <div className="loop-proof mt-auto" aria-hidden>
                  {stage.proof}
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </ol>
    </Reveal>
  );
}
