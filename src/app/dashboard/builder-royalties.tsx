"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatCredits, shortAddress } from "@/lib/format";
import type { NetworkId } from "@/lib/networks";
import { ACCOUNT_KEY, api } from "@/lib/use-fuel-account";

type RoyaltiesResponse = {
  network: { id: NetworkId; name: string; explorerUrl: string };
  percent: number;
  contracts: { address: string; deployedAt: string; paidCalls: number; newCalls: number; newUsers: number }[];
  newCalls: number;
  claimable: number;
  skippedContracts: number;
};

// Royalties follow the network chosen in the scanner. Mainnet scanning isn't
// available yet, so this reads testnet.
const NETWORK: NetworkId = "testnet";

export function BuilderRoyalties() {
  const queryClient = useQueryClient();
  const royalties = useQuery({
    queryKey: ["royalties", NETWORK],
    enabled: false, // checking reads every contract's calls, so it is an explicit action
    retry: false,
    queryFn: () => api<RoyaltiesResponse>(`/api/royalties?network=${NETWORK}`),
  });
  const claim = useMutation({
    mutationFn: () =>
      api<{ granted: number }>("/api/royalties/claim", { method: "POST", body: JSON.stringify({ network: NETWORK }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
      royalties.refetch();
    },
  });

  const [address, setAddress] = useState("");
  const add = useMutation({
    mutationFn: () =>
      api("/api/royalties/contracts", { method: "POST", body: JSON.stringify({ network: NETWORK, address: address.trim() }) }),
    onSuccess: () => {
      setAddress("");
      royalties.refetch();
    },
  });

  const data = royalties.data;
  // A busy builder can have dozens of contracts; show the ones people use.
  const active = data?.contracts.filter((contract) => contract.newCalls > 0 || contract.paidCalls > 0) ?? [];
  const quiet = (data?.contracts.length ?? 0) - active.length;
  const error = royalties.error ?? claim.error ?? add.error;

  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-lime">For builders</p>
          <h2 className="mt-1 text-lg font-semibold">Builder Royalties</h2>
          <p className="mt-1 max-w-xl text-sm text-mist">
            Deploy a contract on Robinhood Chain. When other people use it, 20% of the gas they
            spend comes to you as credits. Your own calls don&apos;t count.
          </p>
        </div>
        <button
          onClick={() => royalties.refetch()}
          disabled={royalties.isFetching}
          className="rounded-full bg-lime px-5 py-2 text-sm font-semibold text-ink transition hover:bg-lime-dim disabled:opacity-60"
        >
          {royalties.isFetching ? "Checking…" : data ? "Check again" : "Check my contracts"}
        </button>
      </div>

      {error && !royalties.isFetching && (
        <p role="alert" className="mt-5 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {error.message}
        </p>
      )}

      {data && !royalties.isFetching && data.contracts.length === 0 && (
        <p className="mt-5 text-sm leading-relaxed text-mist">
          No contracts deployed from this wallet on {data.network.name} yet. Deploy one, get
          people using it, and your royalties will show up here.
        </p>
      )}

      {data && !royalties.isFetching && data.contracts.length > 0 && (
        <>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs text-mist">
                <tr>
                  <th className="pb-2 font-normal">Contract</th>
                  <th className="pb-2 text-right font-normal">New calls by others</th>
                  <th className="pb-2 text-right font-normal">New users</th>
                  <th className="pb-2 text-right font-normal">Calls already paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-mono">
                {active.map((contract) => (
                  <tr key={contract.address}>
                    <td className="py-2.5">
                      <a
                        href={`${data.network.explorerUrl}/address/${contract.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-4 hover:text-lime hover:underline"
                      >
                        {shortAddress(contract.address)}
                      </a>
                      <span className="ml-2 font-sans text-xs text-mist">
                        deployed {new Date(contract.deployedAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-lime">{contract.newCalls}</td>
                    <td className="py-2.5 text-right">{contract.newUsers}</td>
                    <td className="py-2.5 text-right text-mist">{contract.paidCalls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              onClick={() => claim.mutate()}
              disabled={data.newCalls === 0 || claim.isPending}
              className="rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-lime-dim disabled:bg-raised disabled:text-mist"
            >
              {claim.isPending
                ? "Claiming…"
                : data.newCalls > 0
                  ? `Claim ${formatCredits(data.claimable)} credits in royalties`
                  : "No new usage to claim"}
            </button>
            <p className="text-xs leading-relaxed text-mist">
              {data.newCalls > 0 && data.claimable === 0 && "Less than one credit so far; it carries over to your next claim. "}
              {quiet > 0 && `${quiet} of your contracts have no usage by others yet. `}
              Reads up to 500 recent calls per contract.
              {data.skippedContracts > 0 &&
                ` ${data.skippedContracts} contracts are waiting for the next check (60 are checked at a time).`}
            </p>
          </div>
        </>
      )}

      {data && !royalties.isFetching && (
        <form
          className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
          <label htmlFor="contract-address" className="w-full text-sm text-mist">
            Missing a contract? Add it by address. We check on-chain that your wallet deployed it.
          </label>
          <input
            id="contract-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="0x… contract address"
            className="min-w-0 flex-1 rounded-full border border-line bg-raised px-4 py-2 font-mono text-sm placeholder:font-sans placeholder:text-mist"
          />
          <button
            disabled={add.isPending || address.trim() === ""}
            className="rounded-full border border-line px-5 py-2 text-sm transition hover:border-lime disabled:opacity-60"
          >
            {add.isPending ? "Checking…" : "Add contract"}
          </button>
        </form>
      )}
    </section>
  );
}
