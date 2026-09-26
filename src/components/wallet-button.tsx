"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { shortAddress } from "@/lib/format";
import { PRIVY_APP_ID } from "@/lib/privy";
import { useSession } from "@/lib/use-session";

const primary = "btn-primary px-5 py-2.5 text-sm";

type WalletButtonProps = {
  label?: string;
  /** "account" (the header) shows who is signed in; "action" just points at the dashboard. */
  signedIn?: "account" | "action";
};

export function WalletButton({ label = "Sign in", signedIn = "action" }: WalletButtonProps) {
  // Privy's dialog: an email code, Google, or a wallet. Once it is done the
  // session bridge in providers.tsx turns the login into a Kredit session.
  const privy = usePrivy();
  const session = useSession();
  // Privy is done but the server session is still being made.
  const finishing = privy.ready && privy.authenticated && !session.address && !session.isLoading;

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
          onClick={() => session.signOut.mutate()}
          className="hidden rounded-full px-3 py-2 text-sm whitespace-nowrap text-mist transition hover:text-fog md:inline-flex"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (!PRIVY_APP_ID) {
    return (
      <button className={primary} disabled title="Set NEXT_PUBLIC_PRIVY_APP_ID to turn sign-in on">
        Sign-in not configured
      </button>
    );
  }

  return (
    // Not disabled while Privy is still loading: the button would flash dim on
    // every page load for the second that takes.
    <button className={primary} onClick={() => privy.login()} disabled={finishing}>
      {finishing ? "Signing in…" : label}
    </button>
  );
}
