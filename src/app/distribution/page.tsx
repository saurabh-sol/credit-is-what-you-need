import { TextReveal } from "@/components/motion/text-reveal";
import { distribution } from "@/lib/distribution";
import { Board } from "./board";

export const metadata = { title: "Distribution — Fuel" };
// Read from the ledger on every visit; the board then keeps itself fresh.
export const dynamic = "force-dynamic";

export default function DistributionPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 pb-24">
      <header className="max-w-3xl">
        <p className="eyebrow animate-rise">Distribution</p>
        <TextReveal
          as="h1"
          text="Where every credit went."
          className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
        />
        <p style={{ animationDelay: "250ms" }} className="mt-6 max-w-[60ch] animate-rise text-lg leading-relaxed text-mist">
          Credits are handed out by rules, not by us, so the full list is public: each
          wallet, what it earned, where that came from, and any tokens it paid for more.
          Spending stays private. Set a display name on your dashboard if you would
          rather not be a row of hex.
        </p>
      </header>
      <Board initial={distribution()} />
    </div>
  );
}
