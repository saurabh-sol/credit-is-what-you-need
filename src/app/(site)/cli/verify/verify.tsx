"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { WalletButton } from "@/components/wallet-button";
import { api } from "@/lib/use-kredit-account";
import { useSession } from "@/lib/use-session";

type Status = { code: string; host: string | null; approved: boolean; expired: boolean };
type Approved = { address: string; keyName: string; host: string | null };

const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8).replace(/^(.{4})(.+)$/, "$1-$2");

export function Verify({ initialCode }: { initialCode: string }) {
  const session = useSession();
  const [code, setCode] = useState(clean(initialCode));
  const complete = code.replace("-", "").length === 8;
  const signedIn = Boolean(session.address);

  const status = useQuery({
    queryKey: ["cli-login", code],
    queryFn: () => api<Status>(`/api/cli/login/${code}/approve`),
    enabled: signedIn && complete,
    retry: false,
  });
  const approve = useMutation({ mutationFn: () => api<Approved>(`/api/cli/login/${code}/approve`, { method: "POST" }) });

  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm leading-relaxed text-mist">
        A terminal running <code>kredit login</code> showed this code. Approving it makes an API key for that terminal
        in your wallet&apos;s name; you can revoke it any time under{" "}
        <Link href="/dashboard/keys" className="text-fog underline decoration-line underline-offset-4">
          API keys
        </Link>
        . The terminal never sees your wallet.
      </p>

      <label className="block">
        <span className="text-xs text-mist">Code</span>
        <input
          value={code}
          onChange={(event) => setCode(clean(event.target.value))}
          spellCheck={false}
          autoCapitalize="characters"
          placeholder="ABCD-EFGH"
          className="field mt-1.5 w-full rounded-lg px-4 py-3 text-center font-mono text-2xl tracking-[0.3em]"
        />
      </label>

      {!signedIn && (
        <div className="card p-5">
          <p className="text-sm text-fog">Sign in as the account the terminal should spend from.</p>
          <div className="mt-4">
            <WalletButton label="Sign in" signedIn="account" />
          </div>
        </div>
      )}

      {signedIn && complete && status.isError && (
        <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {(status.error as Error).message}
        </p>
      )}

      {signedIn && status.data && !approve.data && (
        <div className="card p-5">
          {status.data.expired ? (
            <p className="text-sm text-fog">This code has expired. Run <code>kredit login</code> again for a fresh one.</p>
          ) : status.data.approved ? (
            <p className="text-sm text-fog">This code was already approved. The terminal has its key.</p>
          ) : (
            <>
              <p className="text-sm text-fog">
                Approve <span className="font-mono">{status.data.code}</span>
                {status.data.host && (
                  <>
                    {" "}
                    for <span className="font-mono">{status.data.host}</span>
                  </>
                )}
                ?
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-mist">
                A key named <em>CLI on {status.data.host ?? "a terminal"}</em> will be created and handed to it once.
              </p>
              <button type="button" disabled={approve.isPending} onClick={() => approve.mutate()} className="btn-primary mt-4 px-5 py-2.5 text-sm">
                {approve.isPending ? "Approving…" : "Approve this terminal"}
              </button>
              {approve.isError && <p role="alert" className="mt-3 text-sm text-danger">{(approve.error as Error).message}</p>}
            </>
          )}
        </div>
      )}

      {approve.data && (
        <div className="card border-accent/40 p-5" role="status">
          <p className="text-sm text-fog">Approved. You can close this tab; the terminal is collecting its key.</p>
          <p className="mt-1.5 text-xs text-mist">
            Key <em>{approve.data.keyName}</em> now spends from {approve.data.address.slice(0, 6)}…{approve.data.address.slice(-4)}.
          </p>
        </div>
      )}
    </div>
  );
}
