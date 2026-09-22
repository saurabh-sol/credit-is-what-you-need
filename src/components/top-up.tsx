"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { erc20Abi, formatEther, parseEther, type Address } from "viem";
import { useAccount, useBalance, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { CheckIcon, CoinsIcon } from "@/components/icons";
import { formatCredits } from "@/lib/format";
import { SWAP_BUY_ABI } from "@/lib/swap-buy-abi";
import { creditsForPayment, formatTokenAmount, parseTokenAmount, type TopUpConfig } from "@/lib/topup";
import { QUOTER_V2_ABI } from "@/lib/uniswap";
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

type Mode = "eth" | "token";
const tokenPresets = ["1000", "5000", "20000"];
const ethPresets = ["0.001", "0.005", "0.02"];
const SLIPPAGE_BPS = BigInt(100); // 1%
const SWAP_DEADLINE_SECONDS = 10 * 60;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// "0.005" -> wei. Returns null for anything that is not a plain positive decimal.
function parseEthAmount(text: string) {
  if (!/^\d{1,12}(\.\d{1,18})?$/.test(text.trim())) return null;
  const wei = parseEther(text.trim());
  return wei > BigInt(0) ? wei : null;
}

type Config = TopUpConfig & { chainId: number };

// Pay with ETH (swapped for the project token on Uniswap, straight into the
// treasury) or with the token itself. Either way the server credits whatever
// the transaction receipt proves.
export function TopUp() {
  const { data } = useQuery({
    queryKey: ["topup-config"],
    queryFn: () => api<{ config: Config | null }>("/api/topup"),
    staleTime: 600_000,
  });
  const config = data?.config;
  const [mode, setMode] = useState<Mode | null>(null);

  if (data && !config) {
    return (
      <Shell>
        <p className="mt-2 max-w-md leading-relaxed text-mist">
          Soon you will be able to pay with ETH or the project token and get credits on the spot, for when your
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

  const current: Mode = mode ?? (config.swap ? "eth" : "token");
  return (
    <Shell>
      {current === "eth" && config.swap ? <PayWithEth config={config} /> : <PayWithToken config={config} />}
      {config.swap && (
        <button
          type="button"
          onClick={() => setMode(current === "eth" ? "token" : "eth")}
          className="mt-5 text-xs text-mist underline-offset-4 hover:text-fog hover:underline"
        >
          {current === "eth" ? `Have ${config.symbol} already? Pay with it directly` : "Pay with ETH instead"}
        </button>
      )}
    </Shell>
  );
}

// Polls the server until the transaction is mined and credited. Returns the credits added.
async function confirm(hash: string, setStep: (step: Step) => void) {
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
      return result.credits as number;
    }
    if (!result.retry || attempt >= 20) {
      throw new Error(`${result.error} Your payment is safe: keep this transaction hash, ${hash}, and try again.`);
    }
    await wait(3000);
  }
}

function usePurchase() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState(0);
  const busy = step !== "idle" && step !== "done";

  async function run(send: () => Promise<string>, after?: () => void) {
    setError(null);
    try {
      const hash = await send();
      setBought(await confirm(hash, setStep));
      await queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
      queryClient.invalidateQueries({ queryKey: ["distribution"] });
      after?.();
      setStep("done");
    } catch (caught) {
      const failure = caught as Error & { shortMessage?: string };
      setError(failure.shortMessage ?? failure.message);
      setStep("idle");
    }
  }

  const reset = () => setStep("idle");
  return { step, setStep, error, bought, busy, run, reset };
}

function PayWithEth({ config }: { config: Config }) {
  const swap = config.swap!;
  const chain = rewardChains[0];
  const { address, chainId } = useAccount();
  const { switchChainAsync: switchChain } = useSwitchChain();
  const { writeContractAsync: writeContract } = useWriteContract();
  const balance = useBalance({ address, chainId: chain.id, query: { enabled: Boolean(address) } });

  const [amount, setAmount] = useState(ethPresets[1]);
  const [debounced, setDebounced] = useState(amount);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(amount), 250);
    return () => clearTimeout(timer);
  }, [amount]);
  const wei = parseEthAmount(debounced);

  // What the pool would give right now; the real swap takes at most 1% less.
  const quote = useReadContract({
    abi: QUOTER_V2_ABI,
    address: swap.quoter as Address,
    functionName: "quoteExactInputSingle",
    args: wei
      ? [{ tokenIn: swap.weth as Address, tokenOut: config.token as Address, amountIn: wei, fee: swap.poolFee, sqrtPriceLimitX96: BigInt(0) }]
      : undefined,
    chainId: chain.id,
    query: { enabled: Boolean(wei), staleTime: 15_000, refetchInterval: 30_000, retry: 1 },
  });
  const tokensOut = quote.data?.[0];
  const credits = tokensOut !== undefined ? creditsForPayment(tokensOut, config) : 0;
  const tooMuch = wei !== null && balance.data !== undefined && wei > balance.data.value;
  const overCap = credits > swap.maxCreditsPerBuy;
  const { step, setStep, error, bought, busy, run, reset } = usePurchase();

  async function pay() {
    if (!wei || !address || tokensOut === undefined) return;
    await run(
      async () => {
        if (chainId !== chain.id) {
          setStep("switching");
          await switchChain({ chainId: chain.id });
        }
        setStep("signing");
        const minTokens = (tokensOut * (BigInt(10_000) - SLIPPAGE_BPS)) / BigInt(10_000);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);
        return writeContract({
          abi: SWAP_BUY_ABI,
          address: swap.address as Address,
          functionName: "buyWithEth",
          args: [minTokens, deadline],
          value: wei,
          chainId: chain.id,
        });
      },
      () => balance.refetch(),
    );
  }

  return (
    <>
      <p className="mt-2 max-w-md leading-relaxed text-mist">
        Pay in ETH. Uniswap swaps it for {config.symbol} and{" "}
        <span className="text-fog">{formatCredits(1 / config.creditsPerToken)} {config.symbol} buys 1 credit</span>. The
        swap and the receipt happen in one transaction; nothing is approved or held.
      </p>

      <label htmlFor="topup-eth" className="mt-6 block text-sm text-mist">
        Amount in ETH
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="topup-eth"
          inputMode="decimal"
          value={amount}
          disabled={busy}
          onChange={(event) => {
            setAmount(event.target.value);
            reset();
          }}
          className="field font-mono"
        />
        {ethPresets.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={busy}
            onClick={() => {
              setAmount(preset);
              reset();
            }}
            className={`btn-ghost shrink-0 px-3.5 font-mono text-sm ${amount === preset ? "border-accent/55" : ""}`}
          >
            {preset}
          </button>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-mist">
        <span>
          {!wei ? (
            "Enter an amount, like 0.005"
          ) : quote.isError ? (
            <span className="text-danger">No price right now; the pool may be empty. Try again in a moment.</span>
          ) : tokensOut === undefined ? (
            "Getting a price from Uniswap"
          ) : (
            <>
              About {formatTokenAmount(tokensOut, config.decimals, 0)} {config.symbol}, so you get{" "}
              <span className="font-mono text-accent">{formatCredits(credits)}</span> credits, about ${(credits / 1000).toFixed(2)} of
              AI usage
            </>
          )}
        </span>
        {balance.data !== undefined && (
          <span className={tooMuch ? "text-danger" : ""}>You hold {formatEth(balance.data.value)} ETH</span>
        )}
      </p>
      {overCap && (
        <p className="mt-2 text-xs text-danger">
          One purchase is capped at {formatCredits(swap.maxCreditsPerBuy)} credits. Buy in smaller amounts.
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={busy || !wei || credits < 1 || tooMuch || overCap || !address}
        className="btn-primary mt-5 w-full px-5 py-2.5 text-sm sm:w-auto"
      >
        {!address ? "Reconnect your wallet to pay" : busy ? "Working" : `Pay ${wei ? amount : ""} ETH`}
      </button>

      <Status step={step} bought={bought} error={error} />
    </>
  );
}

function PayWithToken({ config }: { config: Config }) {
  const chain = rewardChains[0];
  const { address, chainId } = useAccount();
  const { switchChainAsync: switchChain } = useSwitchChain();
  const { writeContractAsync: writeContract } = useWriteContract();
  const held = useReadContract({
    abi: erc20Abi,
    address: config.token as Address,
    functionName: "balanceOf",
    args: address && [address],
    chainId: chain.id,
    query: { enabled: Boolean(address) },
  });

  const [amount, setAmount] = useState(tokenPresets[1]);
  const units = parseTokenAmount(amount, config.decimals);
  const credits = units ? creditsForPayment(units, config) : 0;
  const tooMuch = units !== null && held.data !== undefined && units > held.data;
  const { step, setStep, error, bought, busy, run, reset } = usePurchase();

  async function pay() {
    if (!units || !address) return;
    await run(
      async () => {
        if (chainId !== chain.id) {
          setStep("switching");
          await switchChain({ chainId: chain.id });
        }
        setStep("signing");
        return writeContract({
          abi: erc20Abi,
          address: config.token as Address,
          functionName: "transfer",
          args: [config.treasury as Address, units],
          chainId: chain.id,
        });
      },
      () => held.refetch(),
    );
  }

  return (
    <>
      <p className="mt-2 max-w-md leading-relaxed text-mist">
        <span className="text-fog">{formatCredits(1 / config.creditsPerToken)} {config.symbol} buys 1 credit</span>. You send
        the tokens from your own wallet; nothing is approved or held.
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
            reset();
          }}
          className="field font-mono"
        />
        {tokenPresets.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={busy}
            onClick={() => {
              setAmount(preset);
              reset();
            }}
            className={`btn-ghost shrink-0 px-3.5 font-mono text-sm ${amount === preset ? "border-accent/55" : ""}`}
          >
            {Number(preset).toLocaleString("en-US")}
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

      <Status step={step} bought={bought} error={error} />
    </>
  );
}

function formatEth(wei: bigint) {
  const text = Number(formatEther(wei));
  return text >= 1 ? text.toFixed(3) : text.toPrecision(3).replace(/\.?0+$/, "");
}

function Status({ step, bought, error }: { step: Step; bought: number; error: string | null }) {
  const busy = step !== "idle" && step !== "done";
  return (
    <>
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
    </>
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
          <h2 className="text-lg font-semibold">Buy credits</h2>
        </div>
      </div>
      {children}
    </section>
  );
}
