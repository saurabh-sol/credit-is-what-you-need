// Real purchases on Robinhood Chain mainnet: CREDITS (default 1,000) paid
// in ETH through KreditCheckout, then the same paid in USDG (approve + buy),
// then in KRED through KreditTokenCheckout when that is on and the wallet
// holds enough, each handed to the server and checked to have landed as
// credits. Needs a server with top-ups on and a wallet holding a little ETH
// and, for the second leg, the USDG (the treasury wallet gets the first leg's
// USDG, so it can pay the second):
//   BASE_URL=http://localhost:3459 SESSION_SECRET=… DATABASE_URL=postgres://… \
//   WALLET_KEY=<key> node --env-file=.env.local scripts/checkout-test.mjs
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";
import { CHECKOUT_ABI } from "../src/lib/checkout-abi.ts";
import { TOKEN_CHECKOUT_ABI } from "../src/lib/token-checkout-abi.ts";
import { QUOTER_V2_ABI } from "../src/lib/uniswap.ts";
import { sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const rpc = process.env.RPC_MAINNET || process.env.NEXT_PUBLIC_RPC_MAINNET || undefined;
const account = privateKeyToAccount(process.env.WALLET_KEY);
const client = createPublicClient({ chain: robinhood, transport: http(rpc) });
const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpc) });
const credits = BigInt(process.env.CREDITS ?? 1000);
const only = process.env.ONLY; // "eth", "usdg" or "kred" to run one leg

const cookie = await sessionCookie(account.address);
const api = async (path, init = {}) => {
  const response = await fetch(base + path, { ...init, headers: { cookie, "content-type": "application/json", ...init.headers } });
  return { status: response.status, body: await response.json() };
};

const { body: { config, token } } = await api("/api/topup");
if (!config && only !== "kred") throw new Error("top-ups are not on: set TOPUP_CHECKOUT_ADDRESS and TOPUP_TREASURY_ADDRESS");
if (config) console.log("checkout", config.checkout, "usdg", config.token, "pool fee", config.poolFee, "price", config.usdgPerCredit);
const cost = config && (await client.readContract({ abi: CHECKOUT_ABI, address: config.checkout, functionName: "costOf", args: [credits] }));
if (config) console.log(`${credits} credits cost ${formatUnits(cost, config.decimals)} USDG`);

async function settle(hash, wantCredits) {
  console.log("tx", hash);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("the purchase reverted");
  const [purchased] = parseEventLogs({ abi: CHECKOUT_ABI, eventName: "Purchased", logs: receipt.logs }); // same event on both checkouts
  console.log("Purchased", { ethIn: purchased.args.ethIn.toString(), amount: purchased.args.amount.toString(), credits: purchased.args.credits.toString() });
  if (purchased.args.credits < wantCredits) throw new Error("the contract recorded fewer credits than asked");

  const before = (await api("/api/account")).body.balance;
  let result;
  for (let attempt = 0; attempt < 20; attempt++) {
    result = await api("/api/topup", { method: "POST", body: JSON.stringify({ hash }) });
    if (result.status !== 404) break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.log("server", result.status, result.body);
  if (result.status !== 200) throw new Error("the server did not credit the purchase");
  if (BigInt(result.body.credits) !== purchased.args.credits) throw new Error("server credits differ from the contract's");
  if (result.body.balance - before !== result.body.credits) throw new Error("the balance did not move by the credits bought");
  const again = await api("/api/topup", { method: "POST", body: JSON.stringify({ hash }) });
  if (again.status !== 409) throw new Error(`replay answered ${again.status}, expected 409`);
  console.log("ok: credited once, replay refused\n");
}

if (config && only !== "usdg" && only !== "kred") {
  console.log("--- pay with ETH");
  const [quoted] = await client.readContract({
    abi: QUOTER_V2_ABI,
    address: config.quoter,
    functionName: "quoteExactOutputSingle",
    args: [{ tokenIn: config.weth, tokenOut: config.token, amount: cost, fee: config.poolFee, sqrtPriceLimitX96: 0n }],
  });
  const value = (quoted * 10_100n) / 10_000n; // 1% on top, like the dashboard
  console.log(`quote ${formatEther(quoted)} ETH, sending ${formatEther(value)} ETH`);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const hash = await wallet.writeContract({ abi: CHECKOUT_ABI, address: config.checkout, functionName: "buyWithEth", args: [credits, deadline], value });
  await settle(hash, credits);
}

if (config && only !== "eth" && only !== "kred") {
  console.log("--- pay with USDG");
  const held = await client.readContract({ abi: erc20Abi, address: config.token, functionName: "balanceOf", args: [account.address] });
  console.log(`wallet holds ${formatUnits(held, config.decimals)} USDG`);
  if (held < cost) throw new Error("not enough USDG for the second leg");
  const allowance = await client.readContract({ abi: erc20Abi, address: config.token, functionName: "allowance", args: [account.address, config.checkout] });
  if (allowance < cost) {
    const approve = await wallet.writeContract({ abi: erc20Abi, address: config.token, functionName: "approve", args: [config.checkout, cost] });
    console.log("approve", approve);
    await client.waitForTransactionReceipt({ hash: approve });
  }
  const hash = await wallet.writeContract({ abi: CHECKOUT_ABI, address: config.checkout, functionName: "buyWithUsdg", args: [credits] });
  await settle(hash, credits);
}
if (only !== "eth" && only !== "usdg") {
  console.log("--- pay with KRED");
  if (!token) {
    console.log("skipped: TOPUP_TOKEN_CHECKOUT_ADDRESS is not set");
  } else if (!token.tokensPerCredit) {
    throw new Error("the server could not read the token checkout's terms");
  } else {
    const rate = BigInt(token.tokensPerCredit);
    const tokenCost = rate * credits;
    console.log("token checkout", token.checkout, token.symbol, token.token, "rate", formatUnits(rate, token.decimals), "per credit");
    const held = await client.readContract({ abi: erc20Abi, address: token.token, functionName: "balanceOf", args: [account.address] });
    console.log(`wallet holds ${formatUnits(held, token.decimals)} ${token.symbol}, ${credits} credits cost ${formatUnits(tokenCost, token.decimals)}`);
    if (held < tokenCost) {
      if (only === "kred") throw new Error(`not enough ${token.symbol} for the KRED leg`);
      console.log(`skipped: not enough ${token.symbol}`);
    } else {
      const allowance = await client.readContract({ abi: erc20Abi, address: token.token, functionName: "allowance", args: [account.address, token.checkout] });
      if (allowance < tokenCost) {
        const approve = await wallet.writeContract({ abi: erc20Abi, address: token.token, functionName: "approve", args: [token.checkout, tokenCost] });
        console.log("approve", approve);
        await client.waitForTransactionReceipt({ hash: approve });
      }
      const hash = await wallet.writeContract({ abi: TOKEN_CHECKOUT_ABI, address: token.checkout, functionName: "buyWithToken", args: [credits] });
      await settle(hash, credits);
    }
  }
}
console.log("all good");
