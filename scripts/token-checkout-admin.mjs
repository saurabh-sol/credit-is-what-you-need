// Owner actions on KreditTokenCheckout (paying in KRED). Reads DEPLOYER_KEY,
// TOPUP_TOKEN_CHECKOUT_ADDRESS and NEXT_PUBLIC_RPC_MAINNET (or RPC_MAINNET).
//
//   node --env-file=.env.local scripts/token-checkout-admin.mjs status
//     What the contract says, what 1,000 credits cost in KRED, and what the
//     launch curve's price says the rate should be for $0.0008 a credit.
//   node --env-file=.env.local scripts/token-checkout-admin.mjs set-price <tokensPerCredit>
//     Whole tokens per credit, decimals allowed: 125 means 1,000 credits = 125,000 KRED.
//   node --env-file=.env.local scripts/token-checkout-admin.mjs reprice
//     set-price to what the curve implies right now, rounded to two figures.
//   node --env-file=.env.local scripts/token-checkout-admin.mjs set-cap <credits>
//   node --env-file=.env.local scripts/token-checkout-admin.mjs pause | unpause
//   node --env-file=.env.local scripts/token-checkout-admin.mjs set-treasury <address>
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";
import { CURVE_ABI, KRED_CURVE_MAINNET, tokensPerCreditFromCurve } from "../src/lib/kred-curve.ts";
import { TOKEN_CHECKOUT_ABI } from "../src/lib/token-checkout-abi.ts";
import { DEFAULT_USDG_PER_CREDIT, USDG_MAINNET } from "../src/lib/topup.ts";
import { QUOTER_V2_ABI, UNISWAP_MAINNET } from "../src/lib/uniswap.ts";

const rpc = process.env.RPC_MAINNET || process.env.NEXT_PUBLIC_RPC_MAINNET || undefined;
const client = createPublicClient({ chain: robinhood, transport: http(rpc) });
const checkout = process.env.TOPUP_TOKEN_CHECKOUT_ADDRESS;
const [command, ...args] = process.argv.slice(2);

const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(value ?? "");
if (!isAddress(checkout)) throw new Error("TOPUP_TOKEN_CHECKOUT_ADDRESS is not set");
const read = (functionName, fnArgs = []) => client.readContract({ abi: TOKEN_CHECKOUT_ABI, address: checkout, functionName, args: fnArgs });
const token = await read("token");
const [decimals, symbol] = await Promise.all([
  client.readContract({ abi: erc20Abi, address: token, functionName: "decimals" }),
  client.readContract({ abi: erc20Abi, address: token, functionName: "symbol" }),
]);
const usdgPerCredit = BigInt(process.env.TOPUP_USDG_PER_CREDIT ?? DEFAULT_USDG_PER_CREDIT);

async function write(functionName, fnArgs) {
  const account = privateKeyToAccount(process.env.DEPLOYER_KEY);
  const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpc) });
  const hash = await wallet.writeContract({ abi: TOKEN_CHECKOUT_ABI, address: checkout, functionName, args: fnArgs });
  console.log(`${functionName}`, hash);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
}

// What the launch curve's spot price says one credit is worth in tokens.
async function curveRate() {
  if (token.toLowerCase() !== KRED_CURVE_MAINNET.token) return null;
  const [ethReserve, tokenReserve] = await client.readContract({ abi: CURVE_ABI, address: KRED_CURVE_MAINNET.address, functionName: "getReserves" });
  const [usdgPerEth] = await client.readContract({
    abi: QUOTER_V2_ABI,
    address: UNISWAP_MAINNET.quoterV2,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn: UNISWAP_MAINNET.weth, tokenOut: USDG_MAINNET.address, amountIn: 10n ** 18n, fee: 100, sqrtPriceLimitX96: 0n }],
  });
  const exact = tokensPerCreditFromCurve({ ethReserve, tokenReserve, usdgPerEth, usdgPerCredit });
  const usdPerToken = Number(formatUnits(usdgPerEth, 6)) * (Number(ethReserve) / Number(tokenReserve));
  return { exact, rounded: parseUnits(String(Number(Number(formatUnits(exact, decimals)).toPrecision(2))), decimals), usdPerToken };
}

if (command === "status") {
  const [owner, treasury, price, cap, paused, total] = await Promise.all(
    ["owner", "treasury", "tokensPerCredit", "maxCreditsPerBuy", "paused", "totalPurchased"].map((name) => read(name)),
  );
  console.log({ checkout, owner, treasury, token, symbol, decimals, tokensPerCredit: formatUnits(price, decimals), maxCreditsPerBuy: cap.toString(), paused, totalPurchased: total.toString() });
  console.log(`1,000 credits = ${formatUnits(price * 1000n, decimals)} ${symbol}`);
  const curve = await curveRate();
  if (curve) {
    console.log(`curve: 1 ${symbol} = $${curve.usdPerToken.toPrecision(3)}, so 1,000 credits at $${formatUnits(usdgPerCredit * 1000n, 6)} = ${Number(formatUnits(curve.exact * 1000n, decimals)).toFixed(0)} ${symbol}`);
    console.log(`the contract's rate values 1,000 credits at $${(curve.usdPerToken * Number(formatUnits(price * 1000n, decimals))).toFixed(2)}; \`reprice\` would set ${formatUnits(curve.rounded, decimals)} per credit`);
  }
  console.log(`treasury holds ${formatUnits(await client.readContract({ abi: erc20Abi, address: token, functionName: "balanceOf", args: [treasury] }), decimals)} ${symbol}`);
} else if (command === "set-price") {
  if (!args[0]) throw new Error("usage: set-price <tokensPerCredit>, e.g. 125");
  const price = parseUnits(args[0], decimals);
  if (price < 1n) throw new Error("the price must be above zero");
  console.log(`1,000 credits will cost ${formatUnits(price * 1000n, decimals)} ${symbol}`);
  await write("setPrice", [price]);
  console.log("done. The server reads the rate from the contract; nothing to change there.");
} else if (command === "reprice") {
  const curve = await curveRate();
  if (!curve) throw new Error("no curve known for this token; use set-price");
  console.log(`curve says ${formatUnits(curve.exact, decimals)} ${symbol} per credit; setting ${formatUnits(curve.rounded, decimals)}`);
  await write("setPrice", [curve.rounded]);
  console.log("done.");
} else if (command === "set-cap") {
  const cap = BigInt(args[0] ?? 0);
  if (cap < 1n) throw new Error("usage: set-cap <credits>");
  await write("setMaxCreditsPerBuy", [cap]);
} else if (command === "pause" || command === "unpause") {
  await write("setPaused", [command === "pause"]);
} else if (command === "set-treasury") {
  if (!isAddress(args[0])) throw new Error("usage: set-treasury <address>");
  await write("setTreasury", [args[0]]);
  console.log(`done. Set TOPUP_TREASURY_ADDRESS=${args[0]} on the server too (it is shared with the USDG checkout).`);
} else {
  console.log("usage: token-checkout-admin.mjs status | set-price <tokensPerCredit> | reprice | set-cap <credits> | pause | unpause | set-treasury <address>");
  process.exit(1);
}
