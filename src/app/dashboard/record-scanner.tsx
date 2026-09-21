"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Receipt } from "@/components/receipt";
import { formatCredits, shortAddress } from "@/lib/format";
import type { NetworkId } from "@/lib/networks";
import type { Receipt as ReceiptData } from "@/lib/scoring";
import { ACCOUNT_KEY, api } from "@/lib/use-fuel-account";

type RecordResponse = ReceiptData & {
  address: string;
  network: { id: NetworkId; name: string; explorerUrl: string };
  truncated: boolean;
  claimable: number;
  gasBackAvailable: boolean;
};

const networkTabs: { id: NetworkId; label: string }[] = [
  { id: "testnet", label: "Testnet" },
  { id: "mainnet", label: "Mainnet" },
];

export function RecordScanner() {
  const [network, setNetwork] = useState<NetworkId>("testnet");

  const record = useQuery({
    queryKey: ["record", network],
    enabled: false, // scanning is an explicit action
    retry: false,
    queryFn: () => api<RecordResponse>(`/api/record?network=${network}`),
  });

  return (
    <section className="mt-4 card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Scan your on-chain record</h2>
          <p className="mt-1 text-sm text-mist">
            Every task you did on Robinhood Chain, and the credits it deserves.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-full border border-line bg-raised p-1 text-sm" role="tablist">
            {networkTabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={network === tab.id}
                onClick={() => setNetwork(tab.id)}
                className={`rounded-full px-3 py-1 transition ${
                  network === tab.id ? "bg-lime font-semibold text-ink" : "text-mist hover:text-fog"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => record.refetch()}
            disabled={record.isFetching}
            className="btn-primary px-5 py-2 text-sm"
          >
            {record.isFetching ? "Scanning…" : record.data ? "Scan again" : "Scan my record"}
          </button>
        </div>
      </div>

      {record.error && !record.isFetching && (
        <p role="alert" className="mt-5 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {record.error.message}
        </p>
      )}

      {record.data && !record.isFetching && (
        <ScanResult data={record.data} onClaimed={() => record.refetch()} />
      )}
    </section>
  );
}

function ScanResult({ data, onClaimed }: { data: RecordResponse; onClaimed: () => void }) {
  const queryClient = useQueryClient();
  const claim = useMutation({
    mutationFn: () =>
      api<{ granted: number }>("/api/claim", {
        method: "POST",
        body: JSON.stringify({ network: data.network.id }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
      onClaimed();
    },
  });

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[auto_1fr]">
      <div>
        <Receipt
          animated="print"
          badge={data.network.id.toUpperCase()}
          subtitle={`${shortAddress(data.address)} · ${data.network.name}`}
          lines={data.lines}
          total={data.total}
          emptyText="No transactions from this wallet yet."
        />
        <button
          onClick={() => claim.mutate()}
          disabled={data.claimable === 0 || claim.isPending}
          className="mt-5 w-full max-w-sm btn-primary px-5 py-2.5 text-sm disabled:bg-raised disabled:text-mist"
        >
          {claim.isPending
            ? "Claiming…"
            : data.claimable > 0
              ? `Claim ${formatCredits(data.claimable)} credits`
              : data.total > 0
                ? "All claimed"
                : "Nothing to claim yet"}
        </button>
        {claim.error && (
          <p role="alert" className="mt-3 max-w-sm rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">
            {claim.error.message}
          </p>
        )}
        <p className="mt-4 max-w-sm text-xs leading-relaxed text-mist">
          {data.successfulTxs} successful and {data.failedTxs} failed transactions scanned.
          {data.truncated && " Only your latest 1,000 transactions were read."} Each transaction
          pays out once; new activity can be claimed any time.
          {!data.gasBackAvailable &&
            " The ETH price feed is unreachable right now, so Gas-Back is not included. It stays claimable for later."}
        </p>
      </div>

      <div className="min-w-0">
        <h3 className="text-sm text-mist">Latest tasks</h3>
        {data.tasks.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-mist">
            Nothing yet. Make a transaction on {data.network.name}, then scan again.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {data.tasks.map((task) => (
              <li key={task.hash} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{task.label}</p>
                  <a
                    href={`${data.network.explorerUrl}/tx/${task.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-mist underline-offset-4 hover:text-lime hover:underline"
                  >
                    {shortAddress(task.hash)} · {new Date(task.timestamp).toLocaleDateString()}
                  </a>
                </div>
                <span className="shrink-0 font-mono text-lime">+{formatCredits(task.credits)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
