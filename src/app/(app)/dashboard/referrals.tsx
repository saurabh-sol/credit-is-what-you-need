"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { CopyButton } from "@/components/code-block";
import { formatCredits, shortAddress } from "@/lib/format";
import { api } from "@/lib/use-kredit-account";

type ReferralsResponse = {
  percent: number;
  code: string;
  referrer: string | null;
  invited: { address: string; name: string | null; claimed: number; paid: number; joinedAt: string }[];
  earned: number;
};

const REFERRALS_KEY = ["referrals"];

// The site's own origin, known only in the browser; empty while rendering on the server.
const noop = () => () => {};
const useOrigin = () =>
  useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );

// Invite a wallet, earn a share of every claim it makes. The card shows the
// link to send, who came through it, and what they brought in.
export function Referrals() {
  const queryClient = useQueryClient();
  const referrals = useQuery({ queryKey: REFERRALS_KEY, queryFn: () => api<ReferralsResponse>("/api/referrals") });

  const origin = useOrigin();
  const [inviter, setInviter] = useState("");
  const name = useMutation({
    mutationFn: () => api("/api/referrals", { method: "POST", body: JSON.stringify({ referrer: inviter.trim() }) }),
    onSuccess: () => {
      setInviter("");
      queryClient.invalidateQueries({ queryKey: REFERRALS_KEY });
    },
  });

  const data = referrals.data;
  const link = data ? `${origin}/r/${data.code}` : "";
  const invited = data?.invited ?? [];

  return (
    <section className="mt-4 card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Bring a friend</p>
          <h2 className="mt-1 text-lg font-semibold">Referrals</h2>
          <p className="mt-1 max-w-xl text-sm text-mist">
            Share your link. Every time a wallet you invited claims credits, {data?.percent ?? 10}% of that claim
            lands in your balance on top. They keep everything they earned.
          </p>
        </div>
        <dl className="flex gap-6 text-right">
          <div>
            <dt className="text-xs text-mist">Invited</dt>
            <dd className="font-mono text-lg">{data ? invited.length : "…"}</dd>
          </div>
          <div>
            <dt className="text-xs text-mist">Earned from invites</dt>
            <dd className="font-mono text-lg text-accent">{data ? `+${formatCredits(data.earned)}` : "…"}</dd>
          </div>
        </dl>
      </div>

      {referrals.error && (
        <p role="alert" className="mt-5 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {referrals.error.message}
        </p>
      )}

      {data && (
        <>
          <div className="mt-6">
            <label htmlFor="invite-link" className="text-sm text-mist">
              Your invite link
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                id="invite-link"
                readOnly
                value={link}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 rounded-full border border-line bg-raised px-4 py-2 font-mono text-sm"
              />
              <CopyButton text={link} label="Copy link" className="rounded-full border border-line px-4 py-2" />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-mist">
              Whoever opens it and signs in for the first time is counted as yours. A wallet can be invited once, and
              only before its first claim.
            </p>
          </div>

          {invited.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="text-xs text-mist">
                  <tr>
                    <th className="pb-2 font-normal">Wallet</th>
                    <th className="pb-2 text-right font-normal">They claimed</th>
                    <th className="pb-2 text-right font-normal">Your share</th>
                    <th className="pb-2 text-right font-normal">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-mono">
                  {invited.map((wallet) => (
                    <tr key={wallet.address}>
                      <td className="py-2.5">
                        <span title={wallet.address}>{wallet.name ?? shortAddress(wallet.address)}</span>
                      </td>
                      <td className="py-2.5 text-right">{formatCredits(wallet.claimed)}</td>
                      <td className="py-2.5 text-right text-accent">+{formatCredits(wallet.paid)}</td>
                      <td className="py-2.5 text-right text-mist">{new Date(wallet.joinedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 border-t border-line pt-5">
            {data.referrer ? (
              <p className="text-sm text-mist">
                You were invited by <span className="font-mono text-fog">{shortAddress(data.referrer)}</span>. They
                get {data.percent}% of what you claim, paid by Kredit, not by you.
              </p>
            ) : (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  name.mutate();
                }}
              >
                <label htmlFor="inviter-address" className="w-full text-sm text-mist">
                  Did someone invite you? Paste their wallet address before your first claim and they get their share.
                </label>
                <input
                  id="inviter-address"
                  value={inviter}
                  onChange={(event) => setInviter(event.target.value)}
                  placeholder="0x… inviter's wallet"
                  className="min-w-0 flex-1 rounded-full border border-line bg-raised px-4 py-2 font-mono text-sm placeholder:font-sans placeholder:text-mist"
                />
                <button
                  disabled={name.isPending || inviter.trim() === ""}
                  className="rounded-full border border-line px-5 py-2 text-sm transition hover:border-accent disabled:opacity-60"
                >
                  {name.isPending ? "Saving…" : "Name my inviter"}
                </button>
                {name.error && (
                  <p role="alert" className="w-full text-sm text-danger">
                    {name.error.message}
                  </p>
                )}
              </form>
            )}
          </div>
        </>
      )}
    </section>
  );
}
