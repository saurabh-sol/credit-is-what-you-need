// Owner actions on KreditCheckout. Reads DEPLOYER_KEY, TOPUP_CHECKOUT_ADDRESS
// and NEXT_PUBLIC_RPC_MAINNET (or RPC_MAINNET) from the environment.
//
//   node --env-file=.env.local scripts/checkout-admin.mjs status
//     Prints what the contract says, the WETH/USDG pool it trades through and
//     an ETH quote for 1,000 credits.
//   node --env-file=.env.local scripts/checkout-admin.mjs set-price <usdgPerCredit>
//     800 = $0.0008 per credit, so 1,000 credits cost $0.80.
//   node --env-file=.env.local scripts/checkout-admin.mjs set-cap <credits>
//   node --env-file=.env.local scripts/checkout-admin.mjs pause | unpause
//   node --env-file=.env.local scripts/checkout-admin.mjs set-treasury <address>
import { createPublicClient, createWalletClient, formatEther, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";
import { CHECKOUT_ABI } from "../src/lib/checkout-abi.ts";
import { QUOTER_V2_ABI, UNISWAP_MAINNET, UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_POOL_ABI } from "../src/lib/uniswap.ts";

const rpc = process.env.RPC_MAINNET || process.env.NEXT_PUBLIC_RPC_MAINNET || undefined;
const client = createPublicClient({ chain: robinhood, transport: http(rpc) });
const checkout = process.env.TOPUP_CHECKOUT_ADDRESS;
const [command, ...args] = process.argv.slice(2);

const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(value ?? "");
if (!isAddress(checkout)) throw new Error("TOPUP_CHECKOUT_ADDRESS is not set");
const read = (functionName, fnArgs = []) => client.readContract({ abi: CHECKOUT_ABI, address: checkout, functionName, args: fnArgs });

async function write(functionName, fnArgs) {
  const account = privateKeyToAccount(process.env.DEPLOYER_KEY);
  const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpc) });
  const hash = await wallet.writeContract({ abi: CHECKOUT_ABI, address: checkout, functionName, args: fnArgs });
  console.log(`${functionName}`, hash);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
}

if (command === "status") {
  const [owner, treasury, usdg, weth, poolFee, price, cap, paused, total] = await Promise.all(
    ["owner", "treasury", "usdg", "weth", "poolFee", "usdgPerCredit", "maxCreditsPerBuy", "paused", "totalPurchased"].map((name) => read(name)),
  );
  console.log({ checkout, owner, treasury, usdg, weth, poolFee, usdgPerCredit: price.toString(), maxCreditsPerBuy: cap.toString(), paused, totalPurchased: total.toString() });
  const pool = await client.readContract({ abi: UNISWAP_V3_FACTORY_ABI, address: UNISWAP_MAINNET.factory, functionName: "getPool", args: [weth, usdg, poolFee] });
  if (pool === "0x0000000000000000000000000000000000000000") {
    console.log(`no WETH/USDG pool at fee ${poolFee}: paying with ETH will revert`);
  } else {
    const liquidity = await client.readContract({ abi: UNISWAP_V3_POOL_ABI, address: pool, functionName: "liquidity" });
    console.log("pool", pool, "liquidity", liquidity.toString());
    const cost = await read("costOf", [1000n]);
    const [ethIn] = await client.readContract({
      abi: QUOTER_V2_ABI,
      address: UNISWAP_MAINNET.quoterV2,
      functionName: "quoteExactOutputSingle",
      args: [{ tokenIn: weth, tokenOut: usdg, amount: cost, fee: poolFee, sqrtPriceLimitX96: 0n }],
    });
    console.log(`1,000 credits = ${formatUnits(cost, 6)} USDG = ${formatEther(ethIn)} ETH right now`);
  }
  console.log("treasury ETH", formatEther(await client.getBalance({ address: treasury })));
} else if (command === "set-price") {
  const price = BigInt(args[0] ?? 0);
  if (price < 1n) throw new Error("usage: set-price <usdgPerCredit>, e.g. 800 for $0.0008");
  console.log(`1,000 credits will cost ${formatUnits(price * 1000n, 6)} USDG`);
  await write("setPrice", [price]);
  console.log(`done. Set TOPUP_USDG_PER_CREDIT=${price} on the server too.`);
} else if (command === "set-cap") {
  const cap = BigInt(args[0] ?? 0);
  if (cap < 1n) throw new Error("usage: set-cap <credits>");
  await write("setMaxCreditsPerBuy", [cap]);
  console.log(`done. Set TOPUP_MAX_CREDITS_PER_BUY=${cap} on the server too.`);
} else if (command === "pause" || command === "unpause") {
  await write("setPaused", [command === "pause"]);
} else if (command === "set-treasury") {
  if (!isAddress(args[0])) throw new Error("usage: set-treasury <address>");
  await write("setTreasury", [args[0]]);
  console.log(`done. Set TOPUP_TREASURY_ADDRESS=${args[0]} on the server too.`);
} else {
  console.log("usage: checkout-admin.mjs status | set-price <usdgPerCredit> | set-cap <credits> | pause | unpause | set-treasury <address>");
  process.exit(1);
}
