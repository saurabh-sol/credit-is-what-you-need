import { distribution } from "@/lib/distribution";
import { Board } from "./board";

export const metadata = { title: "Distribution — Fuel" };
// Read from the ledger on every visit; the board then keeps itself fresh.
export const dynamic = "force-dynamic";

export default function DistributionPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-24">
      <header>
        <p className="eyebrow">Distribution</p>
        <h1 className="page-title mt-3">Where every credit went</h1>
        <p className="page-lede">
          Credits are handed out by rules, not by us, so the full list is public: each wallet, what it earned, where
          that came from, and any tokens it paid for more. Spending shows only as one total per wallet, never what it
          went on.
        </p>
      </header>
      <Board initial={distribution()} />
    </div>
  );
}
