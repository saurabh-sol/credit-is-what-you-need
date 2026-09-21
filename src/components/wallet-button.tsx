"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { WalletIcon } from "@/components/icons";
import { shortAddress } from "@/lib/format";
import { useSession } from "@/lib/use-session";

const primary = "btn-primary px-5 py-2.5 text-sm";

const walletHints: Record<string, string> = {
  coinbaseWalletSDK: "App or extension",
  baseAccount: "Passkey",
  injected: "Browser",
};

// Detected wallets bring their own icon (EIP-6963); the built-in ones are drawn here.
function WalletLogo({ id, icon }: { id: string; icon?: string }) {
  const frame = "grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg";
  if (id === "coinbaseWalletSDK") {
    return (
      <span className={`${frame} bg-[#0052ff]`} aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5">
          <circle cx="12" cy="12" r="8" fill="#fff" />
          <rect x="9" y="9" width="6" height="6" rx="1.2" fill="#0052ff" />
        </svg>
      </span>
    );
  }
  if (id === "baseAccount") {
    return (
      <span className={`${frame} bg-fog`} aria-hidden>
        <span className="size-4 rounded-[3px] bg-[#0000ff]" />
      </span>
    );
  }
  if (icon) {
    // A data URI supplied by the wallet itself, so next/image has nothing to optimize.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className={`${frame} bg-fog/5 object-contain p-1`} />;
  }
  return (
    <span className={`${frame} border border-line text-mist`} aria-hidden>
      <WalletIcon />
    </span>
  );
}

export function WalletButton({ label = "Connect wallet" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const { address, isConnected } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const session = useSession();

  // If the user switches to another account, the old session no longer applies.
  const sessionAddress = session.address;
  const signOutNow = session.signOut.mutate;
  useEffect(() => {
    if (sessionAddress && address && sessionAddress.toLowerCase() !== address.toLowerCase()) {
      signOutNow();
    }
  }, [sessionAddress, address, signOutNow]);

  if (session.address) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-full border border-line bg-surface px-4 py-2 font-mono text-sm text-fog transition hover:border-lime"
        >
          <span className="live-dot mr-2" />
          {shortAddress(session.address)}
        </Link>
        <button
          onClick={() => {
            disconnect();
            session.signOut.mutate();
          }}
          className="rounded-full px-3 py-2 text-sm text-mist transition hover:text-fog"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <button className={primary} onClick={() => setOpen(true)}>
        {isConnected ? "Sign in" : label}
      </button>
      {open && <WalletModal onClose={() => setOpen(false)} />}
    </>
  );
}

function WalletModal({ onClose }: { onClose: () => void }) {
  const { address, chainId, isConnected, connector: active } = useConnection();
  const { mutate: connect, isPending, variables, error: connectError } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { signIn } = useSession();
  const allConnectors = useConnectors();

  // Wallets announce themselves (EIP-6963); hide the generic fallback when they do.
  // The Coinbase extension also announces itself; the Coinbase Wallet connector
  // already covers it (plus the mobile app), so it is listed once.
  const detected = allConnectors.some((c) => c.type === "injected" && c.id !== "injected");
  const connectors = allConnectors.filter(
    (c) => !(detected && c.id === "injected") && c.id !== "com.coinbase.wallet",
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const error = connectError ?? signIn.error;

  // Portal to <body>: the header's backdrop blur would otherwise trap the overlay.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex animate-overlay-in items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect wallet"
        className="card w-full max-w-sm animate-modal-in p-6 shadow-[0_40px_100px_-20px_rgb(0_0_0/0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-mono text-xs uppercase tracking-widest text-lime">
          Step {isConnected ? "2" : "1"} of 2
        </p>

        {!isConnected ? (
          <>
            <h2 className="mt-2 text-xl font-semibold">Choose a wallet</h2>
            <ul className="mt-5 space-y-2">
              {connectors.map((connector) => (
                <li key={connector.uid}>
                  <button
                    disabled={isPending}
                    onClick={() => connect({ connector })}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-raised px-4 py-3 text-left transition duration-300 hover:translate-x-1 hover:border-lime active:scale-[0.99] disabled:opacity-60"
                  >
                    <WalletLogo id={connector.id} icon={connector.icon} />
                    <span className="flex-1 font-medium">
                      {connector.id === "injected" ? "Browser wallet" : connector.name}
                    </span>
                    <span className="text-xs text-mist">
                      {isPending && variables?.connector === connector
                        ? "Waiting…"
                        : (walletHints[connector.id] ?? "Detected")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-mist">
              Credits come from your Robinhood Chain history, so pick the wallet
              you use there. Base Account can sign in, but it has no Robinhood
              Chain history yet.
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-2 text-xl font-semibold">Prove it&apos;s yours</h2>
            <p className="mt-2 text-sm leading-relaxed text-mist">
              Sign one message with{" "}
              <span className="font-mono text-fog">{address && shortAddress(address)}</span>
              {active ? ` (${active.name})` : ""}. No gas, no transaction. It stops
              anyone else from claiming your on-chain record.
            </p>
            <button
              disabled={signIn.isPending || !address || !chainId}
              onClick={() => address && chainId && signIn.mutate({ address, chainId }, { onSuccess: onClose })}
              className={`${primary} mt-5 w-full`}
            >
              {signIn.isPending ? "Check your wallet…" : "Sign message"}
            </button>
            <button
              onClick={() => disconnect()}
              className="mt-3 w-full text-sm text-mist transition hover:text-fog"
            >
              Use a different wallet
            </button>
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {"shortMessage" in error ? String(error.shortMessage) : error.message}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
