// A real purchase on Robinhood Chain mainnet: quote 0.001 ETH (or ETH_AMOUNT),
// buy through KreditSwapBuy with WALLET_KEY, hand the hash to the server and
// check the credits landed. Needs a server with top-ups on and:
//   BASE_URL=http://localhost:3459 SESSION_SECRET=… DATABASE_PATH=data/kredit.db \
//   WALLET_KEY=<a wallet with a little ETH> node --env-file=.env.local scripts/swap-buy-test.mjs
import { createPublicClient, createWalletClient, http, parseEther, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";
import { SWAP_BUY_ABI } from "../src/lib/swap-buy-abi.ts";
import { QUOTER_V2_ABI } from "../src/lib/uniswap.ts";
import { sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const rpc = process.env.RPC_MAINNET || process.env.NEXT_PUBLIC_RPC_MAINNET || undefined;
const account = privateKeyToAccount(process.env.WALLET_KEY);
const client = createPublicClient({ chain: robinhood, transport: http(rpc) });
const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpc) });
const ethIn = parseEther(process.env.ETH_AMOUNT ?? "0.001");

const cookie = await sessionCookie(account.address);
const api = async (path, init = {}) => {
  const response = await fetch(base + path, { ...init, headers: { cookie, "content-type": "application/json", ...init.headers } });
  return { status: response.status, body: await response.json() };
};

const { body: { config } } = await api("/api/topup");
if (!config?.swap) throw new Error("top-ups with ETH are not on: set TOPUP_* and TOPUP_SWAP_ADDRESS");
console.log("config", config.symbol, "swap", config.swap.address, "pool fee", config.swap.poolFee);

const [quoted] = await client.readContract({
  abi: QUOTER_V2_ABI,
  address: config.swap.quoter,
  functionName: "quoteExactInputSingle",
  args: [{ tokenIn: config.swap.weth, tokenOut: config.token, amountIn: ethIn, fee: config.swap.poolFee, sqrtPriceLimitX96: 0n }],
});
const expected = await client.readContract({ abi: SWAP_BUY_ABI, address: config.swap.address, functionName: "creditsFor", args: [quoted] });
console.log("quote", quoted.toString(), config.symbol, "->", expected.toString(), "credits");
if (expected === 0n) throw new Error("that much ETH buys no whole credit; raise ETH_AMOUNT");

const before = (await api("/api/account")).body.balance;
const minTokens = (quoted * 99n) / 100n;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
const hash = await wallet.writeContract({ abi: SWAP_BUY_ABI, address: config.swap.address, functionName: "buyWithEth", args: [minTokens, deadline], value: ethIn });
console.log("buy tx", hash);
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error("the purchase reverted");
const [purchased] = parseEventLogs({ abi: SWAP_BUY_ABI, eventName: "Purchased", logs: receipt.logs });
console.log("Purchased", { ethIn: purchased.args.ethIn.toString(), amount: purchased.args.amount.toString(), credits: purchased.args.credits.toString() });

let result;
for (let attempt = 0; attempt < 20; attempt++) {
  result = await api("/api/topup", { method: "POST", body: JSON.stringify({ hash }) });
  if (result.status !== 404) break;
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
console.log("server", result.status, result.body);
if (result.status !== 200) throw new Error("the server did not credit the purchase");
if (BigInt(result.body.credits) !== purchased.args.credits) throw new Error("server credits differ from the contract's");
const again = await api("/api/topup", { method: "POST", body: JSON.stringify({ hash }) });
if (again.status !== 409) throw new Error(`replay answered ${again.status}, expected 409`);
const after = (await api("/api/account")).body.balance;
console.log("balance", before, "->", after, "(+" + result.body.credits + ")");
console.log("ok: https://robinhoodchain.blockscout.com/tx/" + hash);
