"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { erc20Abi, formatEther, type Address } from "viem";
import { useAccount, useBalance, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { CheckIcon, CoinsIcon } from "@/components/icons";
import { CHECKOUT_ABI } from "@/lib/checkout-abi";
import { formatCredits, shortAddress } from "@/lib/format";
import { networks } from "@/lib/networks";
import { TOKEN_CHECKOUT_ABI } from "@/lib/token-checkout-abi";
import { costInTokens, costOfCredits, formatTokenAmount, formatUsd, parseCredits, type TokenTopUpConfig, type TopUpConfig } from "@/lib/topup";
import { QUOTER_V2_ABI } from "@/lib/uniswap";
import { ACCOUNT_KEY, api } from "@/lib/use-kredit-account";
import { rewardChains } from "@/lib/wagmi";

type Step = "idle" | "switching" | "approving" | "signing" | "confirming" | "crediting" | "done";
const stepText: Record<Step, string> = {
  idle: "",
  switching: "Switching network in your wallet",
  approving: "Approve the tokens in your wallet, then confirm the purchase",
  signing: "Confirm the payment in your wallet",
  confirming: "Waiting for the chain to confirm",
  crediting: "Checking the payment and adding credits",
  done: "",
};

type Mode = "eth" | "usdg" | "token";
const presets = ["1000", "5000", "20000"];
const SLIPPAGE_BPS = BigInt(100); // ETH sent on top of the quote, so the swap still clears if the price moves 1%
const SWAP_DEADLINE_SECONDS = 10 * 60;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Config = TopUpConfig & { chainId: number };
// The KRED checkout's terms come from its contract; `null` when the chain could not be read.
type TokenConfig = TokenTopUpConfig & { chainId: number; tokensPerCredit: string | null; maxCreditsPerBuy: number | null; paused: boolean | null };

// Pick how many credits, pay the fixed dollar price in USDG or in ETH, or pay
// in KRED at the rate its checkout sets. Either way a checkout contract pays
// the treasury and writes a receipt, and the server credits whatever that
// receipt proves.
export function TopUp() {
  const { data } = useQuery({
    queryKey: ["topup-config"],
    queryFn: () => api<{ config: Config | null; token: TokenConfig | null }>("/api/topup"),
    staleTime: 600_000,
  });
  const config = data?.config;
  const token = data?.token;
  const [mode, setMode] = useState<Mode | null>(null);
  const [amount, setAmount] = useState(presets[0]);
  const credits = parseCredits(amount);

  if (data && !config && !token) {
    return (
      <Shell>
        <p className="mt-2 max-w-md leading-relaxed text-mist">
          Soon you will be able to pay with ETH or USDG and get credits on the spot, for when your on-chain record
          has not earned enough yet. The rest of Kredit works without it.
        </p>
        <p className="chip mt-5">
          <span className="size-1.5 rounded-full bg-mist breathe" /> Not open yet
        </p>
      </Shell>
    );
  }
  if (!data || (!config && !token)) {
    return (
      <Shell>
        <p className="skeleton mt-3 h-24 w-full" aria-hidden />
      </Shell>
    );
  }

  const modes: Mode[] = [...(config ? (["eth", "usdg"] as const) : []), ...(token ? (["token"] as const) : [])];
  const active: Mode = mode && modes.includes(mode) ? mode : modes[0];
  const cost = credits && config ? costOfCredits(credits, config) : null;
  const rate = token?.tokensPerCredit ? BigInt(token.tokensPerCredit) : null;
  const tokenCost = credits && rate ? costInTokens(credits, rate) : null;
  const cap = active === "token" ? (token?.maxCreditsPerBuy ?? Infinity) : (config?.maxCreditsPerBuy ?? Infinity);
  const overCap = credits !== null && credits > cap;
  return (
    <Shell>
      <p className="mt-2 max-w-md leading-relaxed text-mist">
        {config ? (
          <>
            <span className="text-fog">1,000 credits cost {formatUsd(costOfCredits(1_000, config))}</span>, paid in USDG or the
            same value in ETH{token ? `, or in ${token.symbol}` : ""}.
          </>
        ) : (
          <>
            {rate ? (
              <span className="text-fog">
                1,000 credits cost {formatTokenAmount(costInTokens(1_000, rate), token!.decimals, 2)} {token!.symbol}
              </span>
            ) : (
              <span className="text-fog">Pay in {token!.symbol}</span>
            )}
            .
          </>
        )}{" "}
        The payment goes straight to Kredit&apos;s treasury through the checkout contract, which writes the receipt;
        nothing is held.
      </p>

      <label htmlFor="topup-credits" className="mt-6 block text-sm text-mist">
        Credits to buy
      </label>
      <div className="mt-2 flex gap-2">
        <input id="topup-credits" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} className="field font-mono" />
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount(preset)}
            className={`btn-ghost shrink-0 px-3.5 font-mono text-sm ${amount === preset ? "border-accent/55" : ""}`}
          >
            {Number(preset).toLocaleString("en-US")}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-mist">
        {credits && active !== "token" && cost ? (
          <>
            <span className="font-mono text-accent">{formatCredits(credits)}</span> credits for{" "}
            <span className="font-mono text-fog">{formatUsd(cost)}</span>, about ${(credits / 1000).toFixed(2)} of AI usage
          </>
        ) : credits && active === "token" && tokenCost && token ? (
          <>
            <span className="font-mono text-accent">{formatCredits(credits)}</span> credits for{" "}
            <span className="font-mono text-fog">
              {formatTokenAmount(tokenCost, token.decimals, 2)} {token.symbol}
            </span>
            , about ${(credits / 1000).toFixed(2)} of AI usage
          </>
        ) : (
          "Enter a whole number of credits, like 1000"
        )}
      </p>
      {overCap && Number.isFinite(cap) && (
        <p className="mt-2 text-xs text-danger">One purchase is capped at {formatCredits(cap)} credits. Buy in smaller amounts.</p>
      )}

      {modes.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Pay with">
          {modes.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={active === option}
              onClick={() => setMode(option)}
              className={`btn-ghost px-4 text-sm ${active === option ? "border-accent/55 text-fog" : ""}`}
            >
              {option === "eth" ? "Pay with ETH" : option === "usdg" ? "Pay with USDG" : `Pay with ${token?.symbol ?? "KRED"}`}
            </button>
          ))}
        </div>
      )}

      {active === "eth" && config ? (
        <PayWithEth key="eth" config={config} credits={overCap ? null : credits} />
      ) : active === "usdg" && config ? (
        <PayWithUsdg key="usdg" config={config} credits={overCap ? null : credits} />
      ) : token ? (
        <PayWithToken key="token" config={token} credits={overCap ? null : credits} />
      ) : null}
    </Shell>
  );
}

type Bought = { credits: number; hash: string };

// Polls the server until the transaction is mined and credited. Returns the credits added.
async function confirm(hash: string, setStep: (step: Step) => void): Promise<Bought> {
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
      return { credits: result.credits as number, hash };
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
  const [bought, setBought] = useState<Bought | null>(null);
  const busy = step !== "idle" && step !== "done";

  async function run(send: () => Promise<string>, after?: () => void) {
    setError(null);
    try {
      const hash = await send();
      setBought(await confirm(hash, setStep));
      await queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
      after?.();
      setStep("done");
    } catch (caught) {
      const failure = caught as Error & { shortMessage?: string };
      setError(failure.shortMessage ?? failure.message);
      setStep("idle");
    }
  }

  return { step, setStep, error, bought, busy, run };
}

function useWallet() {
  const chain = rewardChains[0];
  const { address, chainId } = useAccount();
  const { switchChainAsync: switchChain } = useSwitchChain();
  const { writeContractAsync: writeContract } = useWriteContract();
  const ensureChain = async (setStep: (step: Step) => void) => {
    if (chainId !== chain.id) {
      setStep("switching");
      await switchChain({ chainId: chain.id });
    }
  };
  return { chain, address, writeContract, ensureChain };
}

function PayWithEth({ config, credits }: { config: Config; credits: number | null }) {
  const { chain, address, writeContract, ensureChain } = useWallet();
  const balance = useBalance({ address, chainId: chain.id, query: { enabled: Boolean(address) } });
  const [debounced, setDebounced] = useState(credits);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(credits), 250);
    return () => clearTimeout(timer);
  }, [credits]);
  const cost = debounced ? costOfCredits(debounced, config) : null;

  // The ETH the pool wants right now for that much USDG; 1% more is sent so a
  // small move before the block lands still clears, and buys a few extra credits.
  const quote = useReadContract({
    abi: QUOTER_V2_ABI,
    address: config.quoter as Address,
    functionName: "quoteExactOutputSingle",
    args: cost
      ? [{ tokenIn: config.weth as Address, tokenOut: config.token as Address, amount: cost, fee: config.poolFee, sqrtPriceLimitX96: BigInt(0) }]
      : undefined,
    chainId: chain.id,
    query: { enabled: Boolean(cost), staleTime: 15_000, refetchInterval: 30_000, retry: 1 },
  });
  const quoted = quote.data?.[0];
  const wei = quoted !== undefined ? (quoted * (BigInt(10_000) + SLIPPAGE_BPS)) / BigInt(10_000) : undefined;
  const tooMuch = wei !== undefined && balance.data !== undefined && wei > balance.data.value;
  const { step, setStep, error, bought, busy, run } = usePurchase();

  async function pay() {
    if (!debounced || !address || wei === undefined) return;
    await run(
      async () => {
        await ensureChain(setStep);
        setStep("signing");
        const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);
        return writeContract({
          abi: CHECKOUT_ABI,
          address: config.checkout as Address,
          functionName: "buyWithEth",
          args: [BigInt(debounced), deadline],
          value: wei,
          chainId: chain.id,
        });
      },
      () => balance.refetch(),
    );
  }

  return (
    <>
      <p className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-mist">
        <span>
          {!debounced ? (
            "Pick how many credits first"
          ) : quote.isError ? (
            <span className="text-danger">No ETH price right now. Try again in a moment, or pay with USDG.</span>
          ) : wei === undefined ? (
            "Getting the ETH price from Uniswap"
          ) : (
            <>
              Pay <span className="font-mono text-fog">{formatEth(wei)} ETH</span>: Uniswap swaps it to USDG for the treasury and
              you get at least <span className="font-mono text-accent">{formatCredits(debounced)}</span> credits
            </>
          )}
        </span>
        {balance.data !== undefined && (
          <span className={tooMuch ? "text-danger" : ""}>You hold {formatEth(balance.data.value)} ETH</span>
        )}
      </p>

      <button
        type="button"
        onClick={pay}
        disabled={busy || !debounced || wei === undefined || tooMuch || !address}
        className="btn-primary mt-5 w-full px-5 py-2.5 text-sm sm:w-auto"
      >
        {!address ? "Reconnect your wallet to pay" : busy ? "Working" : `Pay ${wei !== undefined ? formatEth(wei) : ""} ETH`}
      </button>

      <Status step={step} bought={bought} error={error} />
    </>
  );
}

function PayWithUsdg({ config, credits }: { config: Config; credits: number | null }) {
  const { chain, address, writeContract, ensureChain } = useWallet();
  const held = useReadContract({
    abi: erc20Abi,
    address: config.token as Address,
    functionName: "balanceOf",
    args: address && [address],
    chainId: chain.id,
    query: { enabled: Boolean(address) },
  });
  const allowance = useReadContract({
    abi: erc20Abi,
    address: config.token as Address,
    functionName: "allowance",
    args: address && [address, config.checkout as Address],
    chainId: chain.id,
    query: { enabled: Boolean(address) },
  });
  const cost = credits ? costOfCredits(credits, config) : null;
  const tooMuch = cost !== null && held.data !== undefined && cost > held.data;
  const needsApproval = cost !== null && allowance.data !== undefined && allowance.data < cost;
  const { step, setStep, error, bought, busy, run } = usePurchase();

  async function pay() {
    if (!credits || !cost || !address) return;
    await run(
      async () => {
        await ensureChain(setStep);
        if (needsApproval) {
          // Approve exactly this purchase; the contract can never take more.
          setStep("approving");
          await writeContract({
            abi: erc20Abi,
            address: config.token as Address,
            functionName: "approve",
            args: [config.checkout as Address, cost],
            chainId: chain.id,
          });
        }
        setStep("signing");
        return writeContract({
          abi: CHECKOUT_ABI,
          address: config.checkout as Address,
          functionName: "buyWithUsdg",
          args: [BigInt(credits)],
          chainId: chain.id,
        });
      },
      () => {
        held.refetch();
        allowance.refetch();
      },
    );
  }

  return (
    <>
      <p className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-mist">
        <span>
          {cost ? (
            <>
              Pay <span className="font-mono text-fog">{formatTokenAmount(cost, config.decimals)} USDG</span> from your wallet
              {needsApproval ? ", after one approval for exactly that amount" : ""}
            </>
          ) : (
            "Pick how many credits first"
          )}
        </span>
        {held.data !== undefined && (
          <span className={tooMuch ? "text-danger" : ""}>You hold {formatTokenAmount(held.data, config.decimals, 2)} USDG</span>
        )}
      </p>

      <button
        type="button"
        onClick={pay}
        disabled={busy || !cost || tooMuch || !address}
        className="btn-primary mt-5 w-full px-5 py-2.5 text-sm sm:w-auto"
      >
        {!address ? "Reconnect your wallet to pay" : busy ? "Working" : `Pay ${cost ? formatTokenAmount(cost, config.decimals) : ""} USDG`}
      </button>

      <Status step={step} bought={bought} error={error} />
    </>
  );
}

// Pay in KRED at the rate the token checkout sets: approve exactly the cost,
// then buy. The contract counts the credits from what reaches the treasury.
function PayWithToken({ config, credits }: { config: TokenConfig; credits: number | null }) {
  const { chain, address, writeContract, ensureChain } = useWallet();
  const rate = config.tokensPerCredit ? BigInt(config.tokensPerCredit) : null;
  const held = useReadContract({
    abi: erc20Abi,
    address: config.token as Address,
    functionName: "balanceOf",
    args: address && [address],
    chainId: chain.id,
    query: { enabled: Boolean(address) },
  });
  const allowance = useReadContract({
    abi: erc20Abi,
    address: config.token as Address,
    functionName: "allowance",
    args: address && [address, config.checkout as Address],
    chainId: chain.id,
    query: { enabled: Boolean(address) },
  });
  const cost = credits && rate ? costInTokens(credits, rate) : null;
  const tooMuch = cost !== null && held.data !== undefined && cost > held.data;
  const needsApproval = cost !== null && allowance.data !== undefined && allowance.data < cost;
  const { step, setStep, error, bought, busy, run } = usePurchase();
  const symbol = config.symbol;

  async function pay() {
    if (!credits || !cost || !address) return;
    await run(
      async () => {
        await ensureChain(setStep);
        if (needsApproval) {
          // Approve exactly this purchase; the contract can never take more.
          setStep("approving");
          await writeContract({
            abi: erc20Abi,
            address: config.token as Address,
            functionName: "approve",
            args: [config.checkout as Address, cost],
            chainId: chain.id,
          });
        }
        setStep("signing");
        return writeContract({
          abi: TOKEN_CHECKOUT_ABI,
          address: config.checkout as Address,
          functionName: "buyWithToken",
          args: [BigInt(credits)],
          chainId: chain.id,
        });
      },
      () => {
        held.refetch();
        allowance.refetch();
      },
    );
  }

  return (
    <>
      <p className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-mist">
        <span>
          {!rate ? (
            <span className="text-danger">No {symbol} price right now. Try again in a moment.</span>
          ) : config.paused ? (
            <span className="text-danger">Paying with {symbol} is paused for the moment.</span>
          ) : cost ? (
            <>
              Pay{" "}
              <span className="font-mono text-fog">
                {formatTokenAmount(cost, config.decimals, 2)} {symbol}
              </span>{" "}
              from your wallet{needsApproval ? ", after one approval for exactly that amount" : ""}
            </>
          ) : (
            "Pick how many credits first"
          )}
        </span>
        {held.data !== undefined && (
          <span className={tooMuch ? "text-danger" : ""}>
            You hold {formatTokenAmount(held.data, config.decimals, 2)} {symbol}
          </span>
        )}
      </p>

      <button
        type="button"
        onClick={pay}
        disabled={busy || !cost || tooMuch || !address || Boolean(config.paused)}
        className="btn-primary mt-5 w-full px-5 py-2.5 text-sm sm:w-auto"
      >
        {!address ? "Reconnect your wallet to pay" : busy ? "Working" : `Pay ${cost ? formatTokenAmount(cost, config.decimals, 2) : ""} ${symbol}`}
      </button>

      <Status step={step} bought={bought} error={error} />
    </>
  );
}

function formatEth(wei: bigint) {
  const text = Number(formatEther(wei));
  return text >= 1 ? text.toFixed(3) : text.toPrecision(3).replace(/\.?0+$/, "");
}

function Status({ step, bought, error }: { step: Step; bought: Bought | null; error: string | null }) {
  const busy = step !== "idle" && step !== "done";
  return (
    <>
      {busy && (
        <p className="sweep mt-4 rounded-xl border border-line bg-raised px-4 py-3 text-sm text-fog" role="status">
          {stepText[step]}
        </p>
      )}
      {step === "done" && bought && (
        <p className="pop-in mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm" role="status">
          <CheckIcon className="text-accent" /> {formatCredits(bought.credits)} credits added to your balance.
          <a
            href={`${networks.mainnet.explorerUrl}/tx/${bought.hash}`}
            target="_blank"
            rel="noreferrer"
            title="Your payment on the block explorer"
            className="font-mono text-xs text-mist underline-offset-4 hover:text-accent hover:underline"
          >
            receipt {shortAddress(bought.hash)}
          </a>
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
