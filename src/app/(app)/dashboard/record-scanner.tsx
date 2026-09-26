"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useSwitchChain, useWriteContract } from "wagmi";
import { Receipt } from "@/components/receipt";
import { formatCredits, shortAddress } from "@/lib/format";
import type { NetworkId } from "@/lib/networks";
import { RECEIPTS_ABI, type SignedReceipt } from "@/lib/receipts-abi";
import type { Receipt as ReceiptData } from "@/lib/scoring";
import { ACCOUNT_KEY, api } from "@/lib/use-kredit-account";
import { rewardChains } from "@/lib/wagmi";

type RecordResponse = ReceiptData & {
  address: string;
  network: { id: NetworkId; name: string; explorerUrl: string };
  truncated: boolean;
  unindexed?: number; // sent transactions the RPC index hasn't caught up with yet
  claimable: number;
  // Why claiming is off right now: a wallet too young to claim, or a held claim.
  blocked: { code: "wallet_age" | "held"; message: string; until: string } | null;
  deferred: number; // task credits waiting for a later day's emissions budget
  budgetLeft: number;
  onchain: { contract: Address; chainId: number } | null;
};

const untilText = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type ClaimResponse =
  | { onchain?: false; granted: number }
  | { onchain: true; receipt: SignedReceipt; signature: Hex; contract: Address; chainId: number; credits: number };

type Step = "idle" | "issuing" | "wallet" | "confirming" | "crediting";
const stepText: Record<Step, string> = {
  idle: "",
  issuing: "Preparing your receipt",
  wallet: "Confirm the claim in your wallet",
  confirming: "Waiting for Robinhood Chain to confirm",
  crediting: "Reading the receipt and adding credits",
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const network: NetworkId = "mainnet";

export function RecordScanner() {

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
  const { address, chainId } = useAccount();
  const { switchChainAsync: switchChain } = useSwitchChain();
  const { writeContractAsync: writeContract } = useWriteContract();
  const [step, setStep] = useState<Step>("idle");
  const [claimedTx, setClaimedTx] = useState<string | null>(null);

  const claim = useMutation({
    mutationFn: async () => {
      setClaimedTx(null);
      setStep("issuing");
      const issued = await api<ClaimResponse>("/api/claim", {
        method: "POST",
        body: JSON.stringify({ network: data.network.id }),
      });
      if (!issued.onchain) return issued.granted;

      // The receipt is signed by the server; the wallet writes it into the chain.
      if (!address || address.toLowerCase() !== issued.receipt.wallet) {
        throw new Error("Connect the wallet you signed in with to claim on-chain.");
      }
      const chain = rewardChains.find((candidate) => candidate.id === issued.chainId);
      if (!chain) throw new Error("This receipt is for a chain the app does not know.");
      if (chainId !== chain.id) {
        setStep("wallet");
        await switchChain({ chainId: chain.id });
      }
      setStep("wallet");
      const hash = await writeContract({
        abi: RECEIPTS_ABI,
        address: issued.contract,
        functionName: "claim",
        args: [
          {
            ...issued.receipt,
            credits: BigInt(issued.receipt.credits),
            nonce: BigInt(issued.receipt.nonce),
            deadline: BigInt(issued.receipt.deadline),
          },
          issued.signature,
        ],
        chainId: chain.id,
      });

      // The server reads the receipt itself; it answers 404 until the transaction is mined.
      setStep("confirming");
      for (let attempt = 0; ; attempt++) {
        const response = await fetch("/api/claim/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ network: data.network.id, hash }),
        });
        const result = await response.json();
        if (response.ok) {
          setStep("crediting");
          setClaimedTx(hash);
          return result.granted as number;
        }
        if (!result.retry || attempt >= 40) {
          throw new Error(`${result.error} Your receipt is on-chain: keep this transaction hash, ${hash}, and try again.`);
        }
        await wait(2000);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
      onClaimed();
    },
    onSettled: () => setStep("idle"),
  });
  const failure = claim.error as (Error & { shortMessage?: string }) | null;

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[auto_1fr]">
      <div>
        <Receipt
          animated="print"
          badge={data.network.id === "mainnet" ? "Mainnet" : data.network.id}
          subtitle={`${shortAddress(data.address)} · ${data.network.name}`}
          lines={data.lines}
          total={data.total}
          emptyText="No transactions from this wallet yet."
        />
        <button
          onClick={() => claim.mutate()}
          disabled={data.claimable === 0 || claim.isPending || data.blocked !== null}
          className="mt-5 w-full max-w-sm btn-primary px-5 py-2.5 text-sm disabled:bg-raised disabled:text-mist"
        >
          {claim.isPending
            ? "Claiming…"
            : data.blocked
              ? data.blocked.code === "held"
                ? "Claim on hold"
                : "Not yet"
              : data.claimable > 0
                ? `Claim ${formatCredits(data.claimable)} credits`
                : data.total > 0
                  ? "All claimed"
                  : "Nothing to claim yet"}
        </button>
        {data.blocked && (
          <p className="mt-3 max-w-sm rounded-xl border border-line bg-raised px-4 py-3 text-sm text-fog" role="status">
            {data.blocked.message} You can claim from {untilText(data.blocked.until)}.{" "}
            <Link href="/docs/legal/fairness" className="text-accent underline-offset-4 hover:underline">
              Why?
            </Link>
          </p>
        )}
        {data.deferred > 0 && (
          <p className="mt-3 max-w-sm rounded-xl border border-line bg-raised px-4 py-3 text-sm text-fog" role="status">
            {formatCredits(data.deferred)} more credits are waiting for tomorrow&apos;s budget: today&apos;s pool for
            everyone is spent. They stay yours; scan again tomorrow.
          </p>
        )}
        {claim.isPending && step !== "idle" && (
          <p className="sweep mt-3 max-w-sm rounded-xl border border-line bg-raised px-4 py-3 text-sm text-fog" role="status">
            {stepText[step]}
          </p>
        )}
        {claimedTx && (
          <p className="pop-in mt-3 max-w-sm rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm" role="status">
            Receipt written on-chain.{" "}
            <a
              href={`${data.network.explorerUrl}/tx/${claimedTx}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline-offset-4 hover:underline"
            >
              View it on Blockscout
            </a>
          </p>
        )}
        {failure && (
          <p role="alert" className="mt-3 max-w-sm rounded-lg bg-danger/10 px-4 py-2 text-sm break-words text-danger">
            {failure.shortMessage ?? failure.message}
          </p>
        )}
        <p className="mt-4 max-w-sm text-xs leading-relaxed text-mist">
          {data.successfulTxs} successful and {data.failedTxs} failed transactions scanned.
          {data.truncated && " Only your latest 1,000 transactions were read."}
          {!!data.unindexed && ` ${data.unindexed} very recent ${data.unindexed === 1 ? "transaction is" : "transactions are"} still being indexed; scan again in a moment.`} Each transaction
          pays out once; new activity can be claimed any time. Days in a row with activity
          add a streak bonus, paid once per day. Repeat calls to one contract on one day pay less, and
          everyone&apos;s claims share a daily pool ({formatCredits(data.budgetLeft)} credits left today).
          {data.onchain && " Every claim is written to Robinhood Chain as a receipt you can check on Blockscout."}
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
                    className="font-mono text-xs text-mist underline-offset-4 hover:text-accent hover:underline"
                  >
                    {shortAddress(task.hash)} · {new Date(task.timestamp).toLocaleDateString()}
                  </a>
                </div>
                <span className="shrink-0 font-mono text-accent">+{formatCredits(task.credits)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
