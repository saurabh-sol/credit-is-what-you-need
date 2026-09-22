// Owner actions on KreditSwapBuy and KreditReceipts, and the on-chain checks
// that go with switching a token on. Reads DEPLOYER_KEY, TOPUP_SWAP_ADDRESS,
// RECEIPTS_ADDRESS_MAINNET and NEXT_PUBLIC_RPC_MAINNET from the environment.
//
//   node --env-file=.env.local scripts/swap-buy-admin.mjs check <token>
//     Reads the token's symbol and decimals, finds every WETH/token Uniswap v3
//     pool and its liquidity, and quotes 0.001 ETH through the best one.
//   node --env-file=.env.local scripts/swap-buy-admin.mjs set-token <token> <poolFee> [creditsPerToken=0.01]
//     Calls setToken on the swap contract and on KreditReceipts, so both
//     price the token the same way. 0.01 credits per token = 100 tokens per credit.
//   node --env-file=.env.local scripts/swap-buy-admin.mjs status
//     Prints what both contracts currently say.
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";
import { SWAP_BUY_ABI } from "../src/lib/swap-buy-abi.ts";
import { POOL_FEES, QUOTER_V2_ABI, UNISWAP_MAINNET, UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_POOL_ABI } from "../src/lib/uniswap.ts";

const PRICE_SCALE = 1_000_000n;
const rpc = process.env.RPC_MAINNET || process.env.NEXT_PUBLIC_RPC_MAINNET || undefined;
const client = createPublicClient({ chain: robinhood, transport: http(rpc) });
const swap = process.env.TOPUP_SWAP_ADDRESS;
const receipts = process.env.RECEIPTS_ADDRESS_MAINNET;
const [command, ...args] = process.argv.slice(2);

const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(value ?? "");
const receiptsAbi = [
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "creditsPerToken", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "setToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token_", type: "address" },
      { name: "decimals_", type: "uint8" },
      { name: "creditsPerToken_", type: "uint256" },
    ],
    outputs: [],
  },
];

async function tokenInfo(token) {
  const [symbol, decimals] = await Promise.all([
    client.readContract({ abi: erc20Abi, address: token, functionName: "symbol" }),
    client.readContract({ abi: erc20Abi, address: token, functionName: "decimals" }),
  ]);
  return { symbol, decimals };
}

async function pools(token) {
  const found = [];
  for (const fee of POOL_FEES) {
    const pool = await client.readContract({
      abi: UNISWAP_V3_FACTORY_ABI,
      address: UNISWAP_MAINNET.factory,
      functionName: "getPool",
      args: [UNISWAP_MAINNET.weth, token, fee],
    });
    if (pool === "0x0000000000000000000000000000000000000000") continue;
    const liquidity = await client.readContract({ abi: UNISWAP_V3_POOL_ABI, address: pool, functionName: "liquidity" });
    found.push({ fee, pool, liquidity });
  }
  return found;
}

async function quote(token, fee, amountIn) {
  const [amountOut] = await client.readContract({
    abi: QUOTER_V2_ABI,
    address: UNISWAP_MAINNET.quoterV2,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn: UNISWAP_MAINNET.weth, tokenOut: token, amountIn, fee, sqrtPriceLimitX96: 0n }],
  });
  return amountOut;
}

if (command === "check") {
  const [token] = args;
  if (!isAddress(token)) throw new Error("usage: check <token>");
  const code = await client.getCode({ address: token });
  if (!code || code === "0x") throw new Error(`${token} has no code on Robinhood Chain`);
  const { symbol, decimals } = await tokenInfo(token);
  console.log(`token ${token}: ${symbol}, ${decimals} decimals`);
  const found = await pools(token);
  if (found.length === 0) {
    console.log("no WETH pool on Uniswap v3 for this token; create one first (fee 3000 is the usual choice)");
    process.exit(2);
  }
  for (const { fee, pool, liquidity } of found) console.log(`pool fee ${fee}: ${pool} liquidity ${liquidity}`);
  const best = found.reduce((a, b) => (b.liquidity > a.liquidity ? b : a));
  const amountIn = parseEther("0.001");
  const out = await quote(token, best.fee, amountIn);
  const credits = (out * 10_000n) / (10n ** BigInt(decimals) * PRICE_SCALE);
  console.log(`0.001 ETH -> ${formatUnits(out, decimals)} ${symbol} -> ${credits} credits at 100 ${symbol} per credit (fee ${best.fee})`);
  console.log(`suggested: set-token ${token} ${best.fee}`);
} else if (command === "set-token") {
  const [token, feeText, priceText = "0.01"] = args;
  const fee = Number(feeText);
  if (!isAddress(token) || !POOL_FEES.includes(fee)) throw new Error("usage: set-token <token> <100|500|3000|10000> [creditsPerToken]");
  if (!isAddress(swap)) throw new Error("TOPUP_SWAP_ADDRESS is not set");
  const account = privateKeyToAccount(process.env.DEPLOYER_KEY);
  const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpc) });
  const { symbol, decimals } = await tokenInfo(token);
  const creditsPerToken = BigInt(Math.round(Number(priceText) * Number(PRICE_SCALE)));
  console.log(`setting ${symbol} (${decimals} decimals), pool fee ${fee}, ${priceText} credits per token`);

  const swapHash = await wallet.writeContract({ abi: SWAP_BUY_ABI, address: swap, functionName: "setToken", args: [token, decimals, fee, creditsPerToken] });
  console.log("KreditSwapBuy.setToken", swapHash);
  await client.waitForTransactionReceipt({ hash: swapHash });
  if (isAddress(receipts)) {
    const hash = await wallet.writeContract({ abi: receiptsAbi, address: receipts, functionName: "setToken", args: [token, decimals, creditsPerToken] });
    console.log("KreditReceipts.setToken", hash);
    await client.waitForTransactionReceipt({ hash });
  }
  console.log("done. Now set in the server's environment:");
  console.log(`TOPUP_TOKEN_ADDRESS=${token}\nTOPUP_TOKEN_SYMBOL=${symbol}\nTOPUP_TOKEN_DECIMALS=${decimals}\nTOPUP_CREDITS_PER_TOKEN=${priceText}\nTOPUP_POOL_FEE=${fee}`);
} else if (command === "status") {
  if (!isAddress(swap)) throw new Error("TOPUP_SWAP_ADDRESS is not set");
  const read = (functionName) => client.readContract({ abi: SWAP_BUY_ABI, address: swap, functionName });
  const [token, treasury, weth, poolFee, decimals, price, cap, paused, total] = await Promise.all(
    ["token", "treasury", "weth", "poolFee", "tokenDecimals", "creditsPerToken", "maxCreditsPerBuy", "paused", "totalPurchased"].map(read),
  );
  console.log({ swap, token, treasury, weth, poolFee, decimals, creditsPerToken: Number(price) / Number(PRICE_SCALE), maxCreditsPerBuy: cap, paused, totalPurchased: total });
  if (isAddress(receipts)) {
    const r = (functionName) => client.readContract({ abi: receiptsAbi, address: receipts, functionName });
    console.log("KreditReceipts", { token: await r("token"), creditsPerToken: Number(await r("creditsPerToken")) / Number(PRICE_SCALE) });
  }
  const balance = await client.getBalance({ address: treasury });
  console.log("treasury ETH", formatEther(balance));
} else {
  console.log("usage: swap-buy-admin.mjs check <token> | set-token <token> <fee> [creditsPerToken] | status");
  process.exit(1);
}
