import { CoinsIcon, SparkIcon, WalletIcon } from "@/components/icons";
import { Reveal } from "@/components/motion/reveal";

const stages = [
  {
    icon: WalletIcon,
    title: "Wallet activity",
    text: "Connect the wallet you use on Robinhood Chain and sign one free message.",
  },
  {
    icon: CoinsIcon,
    title: "Credits",
    text: "Fuel scans your record, shows a receipt for every task, and you claim the total.",
  },
  {
    icon: SparkIcon,
    title: "Any model",
    text: "Spend with an API key in the tools you already use, or straight in the playground.",
  },
];

// Three stages joined by a line, with a light that keeps travelling along it and
// lights each stage as it passes. The motion is all CSS (see `.loop` in landing.css),
// timed from one shared duration, so the light and the stages can never drift apart.
// It starts when the row scrolls into view, which is all <Reveal> is here for.
export function LoopBeam() {
  return (
    <Reveal variant="mark" className="loop">
      <div className="loop-track" aria-hidden>
        <span className="loop-beam" />
      </div>
      <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
        {stages.map((stage, index) => (
          <Reveal as="li" key={stage.title} delay={index * 160} className="flex gap-5 md:block">
            <span className="loop-tile">
              <stage.icon className="size-5" />
              <span className="loop-lit" style={{ "--stage": index } as React.CSSProperties}>
                <stage.icon className="size-5" />
              </span>
            </span>
            <div className="md:mt-7">
              <p className="font-mono text-xs text-mist">0{index + 1}</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">{stage.title}</h3>
              <p className="mt-2 max-w-xs leading-relaxed text-mist">{stage.text}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </Reveal>
  );
}
