// Deploys KreditTokenCheckout to Robinhood Chain mainnet from the compiled
// Foundry artifact (run `cd contracts && forge build` first). Reads
// DEPLOYER_KEY and TOPUP_TREASURY_ADDRESS (defaults to the deployer):
//   node --env-file=.env.local scripts/deploy-token-checkout.mjs
// The rate is TOPUP_TOKENS_PER_CREDIT (whole tokens per credit, e.g. 125) or,
// when unset, what the launch curve's price implies for $0.0008 a credit,
// rounded to two figures. Paying with KRED is on as soon as
// TOPUP_TOKEN_CHECKOUT_ADDRESS is set on the server.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";
import { CURVE_ABI, KRED_CURVE_MAINNET, tokensPerCreditFromCurve } from "../src/lib/kred-curve.ts";
import { DEFAULT_USDG_PER_CREDIT, KRED_MAINNET, USDG_MAINNET } from "../src/lib/topup.ts";
import { QUOTER_V2_ABI, UNISWAP_MAINNET } from "../src/lib/uniswap.ts";

const rpc = process.env.RPC_MAINNET || process.env.NEXT_PUBLIC_RPC_MAINNET || undefined;
const account = privateKeyToAccount(process.env.DEPLOYER_KEY);
const treasury = process.env.TOPUP_TREASURY_ADDRESS || account.address;
const owner = process.env.OWNER || account.address;
const token = process.env.TOPUP_TOKEN_ADDRESS || KRED_MAINNET.address;
const decimals = Number(process.env.TOPUP_TOKEN_DECIMALS ?? KRED_MAINNET.decimals);

const artifact = JSON.parse(readFileSync(new URL("../contracts/out/KreditTokenCheckout.sol/KreditTokenCheckout.json", import.meta.url)));
const client = createPublicClient({ chain: robinhood, transport: http(rpc) });
const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpc) });

let tokensPerCredit;
if (process.env.TOPUP_TOKENS_PER_CREDIT) {
  tokensPerCredit = parseUnits(process.env.TOPUP_TOKENS_PER_CREDIT, decimals);
} else {
  const [ethReserve, tokenReserve] = await client.readContract({ abi: CURVE_ABI, address: KRED_CURVE_MAINNET.address, functionName: "getReserves" });
  const [usdgPerEth] = await client.readContract({
    abi: QUOTER_V2_ABI,
    address: UNISWAP_MAINNET.quoterV2,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn: UNISWAP_MAINNET.weth, tokenOut: USDG_MAINNET.address, amountIn: 10n ** 18n, fee: 100, sqrtPriceLimitX96: 0n }],
  });
  const exact = tokensPerCreditFromCurve({ ethReserve, tokenReserve, usdgPerEth, usdgPerCredit: BigInt(DEFAULT_USDG_PER_CREDIT) });
  const whole = Number(formatUnits(exact, decimals));
  const rounded = Number(whole.toPrecision(2));
  console.log(`curve price implies ${whole.toFixed(2)} KRED per credit; using ${rounded}`);
  tokensPerCredit = parseUnits(String(rounded), decimals);
}
if (tokensPerCredit < 1n) throw new Error("the rate came out as zero");

const args = [owner, treasury, token, tokensPerCredit];
console.log("deployer", account.address, "owner", owner, "treasury", treasury);
console.log("token", token, "tokensPerCredit", formatUnits(tokensPerCredit, decimals), `(1,000 credits = ${formatUnits(tokensPerCredit * 1000n, decimals)})`);
const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args });
console.log("tx", hash);
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error("deployment reverted");
console.log("KreditTokenCheckout", receipt.contractAddress, "block", receipt.blockNumber.toString());
console.log(`TOPUP_TOKEN_CHECKOUT_ADDRESS=${receipt.contractAddress}`);
console.log(`TOPUP_TREASURY_ADDRESS=${treasury}`);
