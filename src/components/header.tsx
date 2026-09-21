import Link from "next/link";
import { WalletButton } from "@/components/wallet-button";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-md bg-lime font-mono text-sm font-bold text-ink">
            F
          </span>
          Fuel
        </Link>
        <WalletButton />
      </div>
    </header>
  );
}
