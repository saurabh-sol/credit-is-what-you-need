"use client";

import { ApiKeys } from "@/app/(app)/dashboard/api-keys";
import { KeyIcon } from "@/components/icons";
import { WalletButton } from "@/components/wallet-button";
import { useSession } from "@/lib/use-session";

const steps = ["Connect the wallet you use on Robinhood Chain.", "Sign one free message.", "Copy your key. It is shown once."];

// Claim a key right where the docs are. Signed-out visitors get the way in.
export function KeyPanel() {
  const session = useSession();

  // Until the session answers, hold the space so the page does not jump.
  if (session.isLoading) {
    return (
      <div className="panel p-5" aria-busy="true" aria-label="Checking whether you are signed in">
        <span className="skeleton block h-4 w-40" />
        <span className="skeleton mt-3 block h-3 w-full" />
        <span className="skeleton mt-2 block h-3 w-2/3" />
        <span className="skeleton mt-5 block h-9 w-44 rounded-full" />
      </div>
    );
  }

  // The dashboard's key manager, calmed down to sit among the docs.
  if (session.address) {
    return (
      <div className="[&_.card]:rounded-xl [&_.card]:bg-surface [&_.card]:bg-none [&_.card]:shadow-none">
        <ApiKeys />
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center gap-3">
        <span className="entity-icon">
          <KeyIcon className="size-4" />
        </span>
        <h3 className="text-sm font-medium text-fog">Connect a wallet to create your key</h3>
      </div>
      <ol className="mt-4 space-y-2 text-[0.8125rem] leading-relaxed text-mist">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="w-4 shrink-0 font-mono text-xs leading-[1.375rem] text-mist/70 tabular-nums">{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-5">
        <WalletButton label="Connect to get a key" />
      </div>
    </div>
  );
}
