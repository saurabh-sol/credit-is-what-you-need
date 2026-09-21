"use client";

import { ApiKeys } from "@/app/dashboard/api-keys";
import { KeyIcon } from "@/components/icons";
import { WalletButton } from "@/components/wallet-button";
import { useSession } from "@/lib/use-session";

// Claim a key right where the docs are. Signed-out visitors get the way in.
export function KeyPanel() {
  const session = useSession();

  if (session.address) return <ApiKeys />;

  return (
    <section className="card relative overflow-hidden p-7">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 -right-20 size-64 rounded-full bg-[radial-gradient(closest-side,rgb(198_244_50/0.12),transparent)]"
      />
      <span className="grid size-11 place-items-center rounded-xl border border-line bg-raised text-lime">
        <KeyIcon className="size-5" />
      </span>
      <h3 className="mt-5 text-xl font-semibold">Claim your API key</h3>
      <p className="mt-2 max-w-md leading-relaxed text-mist">
        Connect the wallet you use on Robinhood Chain and sign one free message.
        Your key is created here and shown once, so copy it somewhere safe.
      </p>
      <div className="mt-6">
        <WalletButton label="Connect to get a key" />
      </div>
    </section>
  );
}
