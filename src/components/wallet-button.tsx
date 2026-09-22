"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useEffect } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { ArrowRightIcon } from "@/components/icons";
import { shortAddress } from "@/lib/format";
import { useSession } from "@/lib/use-session";

const primary = "btn-primary px-5 py-2.5 text-sm";

type WalletButtonProps = {
  label?: string;
  /** "account" (the header) shows who is signed in; "action" just points at the dashboard. */
  signedIn?: "account" | "action";
};

export function WalletButton({ label = "Connect wallet", signedIn = "action" }: WalletButtonProps) {
  // RainbowKit's dialog: pick a wallet, then sign one free message. It is offered
  // while no wallet is connected, and while one is connected but not yet signed in.
  const { openConnectModal } = useConnectModal();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const session = useSession();

  // If the user switches to another account, the old session no longer applies.
  const sessionAddress = session.address;
  const signOutNow = session.signOut.mutate;
  useEffect(() => {
    if (sessionAddress && address && sessionAddress.toLowerCase() !== address.toLowerCase()) {
      signOutNow();
    }
  }, [sessionAddress, address, signOutNow]);

  if (session.address && signedIn === "action") {
    return (
      <Link href="/dashboard" className={`${primary} group inline-flex items-center gap-2`}>
        Open dashboard
        <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
      </Link>
    );
  }

  if (session.address) {
    return (
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <Link
          href="/dashboard"
          className="flex items-center rounded-full border border-line bg-surface px-3 py-2 font-mono text-[0.8125rem] whitespace-nowrap text-fog transition hover:border-accent sm:px-4 sm:text-sm"
        >
          <span className="live-dot mr-2" />
          {shortAddress(session.address)}
        </Link>
        {/* On a phone the dashboard's sidebar has sign-out; the header keeps only what fits. */}
        <button
          onClick={() => {
            disconnect();
            session.signOut.mutate();
          }}
          className="hidden rounded-full px-3 py-2 text-sm whitespace-nowrap text-mist transition hover:text-fog md:inline-flex"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    // Not disabled while RainbowKit is still working out the connection: the button
    // would flash dim on every page load for the second that takes.
    <button className={primary} onClick={() => openConnectModal?.()}>
      {isConnected ? "Sign in" : label}
    </button>
  );
}
