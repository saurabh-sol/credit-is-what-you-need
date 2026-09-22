"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { erc20Abi, type Address } from "viem";
import { useAccount, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { CheckIcon, CoinsIcon } from "@/components/icons";
import { formatCredits } from "@/lib/format";
import { creditsForPayment, formatTokenAmount, parseTokenAmount, type TopUpConfig } from "@/lib/topup";
import { ACCOUNT_KEY, api } from "@/lib/use-kredit-account";
import { rewardChains } from "@/lib/wagmi";

type Step = "idle" | "switching" | "signing" | "confirming" | "crediting" | "done";
const stepText: Record<Step, string> = {
  idle: "",
  switching: "Switching network in your wallet",
  signing: "Confirm the payment in your wallet",
  confirming: "Waiting for the chain to confirm",
  crediting: "Checking the payment and adding credits",
  done: "",
};

const presets = ["10", "50", "250"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Pay with the project token, get credits. The tokens go straight to the
// treasury; the server credits whatever the transaction receipt proves.
export function TopUp() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["topup-config"],
    queryFn: () => api<{ config: (TopUpConfig & { chainId: number }) | null }>("/api/topup"),
    staleTime: 600_000,
  });
  const config = data?.config;
  const chain = config?.network === "testnet" ? rewardChains[0] : rewardChains[1];

  const { address, chainId } = useAccount();
  const { switchChainAsync: switchChain } = useSwitchChain();
  const { writeContractAsync: writeContract } = useWriteContract();
  const held = useReadContract({
    abi: erc20Abi,
    address: config?.token as Address | undefined,
    functionName: "balanceOf",
    args: address && [address],
    chainId: chain.id,
    query: { enabled: Boolean(config && address) },
  });

  const [amount, setAmount] = useState("50");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState(0);

  if (data && !config) {
    return (
      <Shell>
        <p className="mt-2 max-w-md leading-relaxed text-mist">
          Soon you will be able to pay with the project token and get credits on the spot, for when your
          on-chain record has not earned enough yet. The rest of Kredit works without it.
        </p>
        <p className="chip mt-5">
          <span className="size-1.5 rounded-full bg-mist breathe" /> Not open yet
        </p>
      </Shell>
    );
  }
  if (!config) {
    return (
      <Shell>
        <p className="skeleton mt-3 h-24 w-full" aria-hidden />
      </Shell>
    );
  }

  const units = parseTokenAmount(amount, config.decimals);
  const credits = units ? creditsForPayment(units, config) : 0;
  const tooMuch = units !== null && held.data !== undefined && units > held.data;
  const busy = step !== "idle" && step !== "done";

  async function pay() {
    if (!config || !units || !address) return;
    setError(null);
    try {
      if (chainId !== chain.id) {
        setStep("switching");
        await switchChain({ chainId: chain.id });
      }
      setStep("signing");
      const hash = await writeContract({
        abi: erc20Abi,
        address: config.token as Address,
        functionName: "transfer",
        args: [config.treasury as Address, units],
        chainId: chain.id,
      });

      // The server reads the receipt itself; it answers 404 until the transaction is mined.
      setStep("confirming");
      for (let attempt = 0; ; attempt++) {
        const response = await fetch("/api/topup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hash }),
        });
        const result = await response.json();
        if (response.ok) {
          setStep("crediting");
          setBought(result.credits);
          break;
        }
        if (!result.retry || attempt >= 20) {
          throw new Error(`${result.error} Your payment is safe: keep this transaction hash, ${hash}, and try again.`);
        }
        await wait(3000);
      }
      await queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
      queryClient.invalidateQueries({ queryKey: ["distribution"] });
      held.refetch();
      setStep("done");
    } catch (caught) {
      const failure = caught as Error & { shortMessage?: string };
      setError(failure.shortMessage ?? failure.message);
      setStep("idle");
    }
  }

  return (
    <Shell>
      <p className="mt-2 max-w-md leading-relaxed text-mist">
        1 {config.symbol} buys <span className="text-fog">{formatCredits(config.creditsPerToken)} credits</span>. You send the
        tokens from your own wallet; nothing is approved or held.
      </p>

      <label htmlFor="topup-amount" className="mt-6 block text-sm text-mist">
        Amount in {config.symbol}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="topup-amount"
          inputMode="decimal"
          value={amount}
          disabled={busy}
          onChange={(event) => {
            setAmount(event.target.value);
            setStep("idle");
          }}
          className="field font-mono"
        />
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={busy}
            onClick={() => {
              setAmount(preset);
              setStep("idle");
            }}
            className={`btn-ghost shrink-0 px-3.5 font-mono text-sm ${amount === preset ? "border-accent/55" : ""}`}
          >
            {preset}
          </button>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-mist">
        <span>
          {units ? (
            <>
              You get <span className="font-mono text-accent">{formatCredits(credits)}</span> credits, about $
              {(credits / 1000).toFixed(2)} of AI usage
            </>
          ) : (
            "Enter an amount, like 12.5"
          )}
        </span>
        {held.data !== undefined && (
          <span className={tooMuch ? "text-danger" : ""}>
            You hold {formatTokenAmount(held.data, config.decimals)} {config.symbol}
          </span>
        )}
      </p>

      <button
        type="button"
        onClick={pay}
        disabled={busy || !units || credits < 1 || tooMuch || !address}
        className="btn-primary mt-5 w-full px-5 py-2.5 text-sm sm:w-auto"
      >
        {!address ? "Reconnect your wallet to pay" : busy ? "Working" : `Pay ${units ? amount : ""} ${config.symbol}`}
      </button>

      {busy && (
        <p className="sweep mt-4 rounded-xl border border-line bg-raised px-4 py-3 text-sm text-fog" role="status">
          {stepText[step]}
        </p>
      )}
      {step === "done" && (
        <p className="pop-in mt-4 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm" role="status">
          <CheckIcon className="text-accent" /> {formatCredits(bought)} credits added to your balance.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm break-words text-danger">
          {error}
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section id="buy-credits" className="card relative mt-4 overflow-hidden p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl border border-line bg-raised text-accent">
          <CoinsIcon className="size-5" />
        </span>
        <div>
          <p className="eyebrow">Need more?</p>
          <h2 className="text-lg font-semibold">Buy credits with tokens</h2>
        </div>
      </div>
      {children}
    </section>
  );
}
