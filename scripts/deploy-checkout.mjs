// Deploys KreditCheckout to Robinhood Chain mainnet from the compiled Foundry
// artifact (run `cd contracts && forge build` first). Reads DEPLOYER_KEY and
// TOPUP_TREASURY_ADDRESS (defaults to the deployer) from the environment:
//   node --env-file=.env.local scripts/deploy-checkout.mjs
// Buying is on as soon as TOPUP_CHECKOUT_ADDRESS is set on the server.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";
import { DEFAULT_USDG_PER_CREDIT, USDG_MAINNET } from "../src/lib/topup.ts";
import { UNISWAP_MAINNET } from "../src/lib/uniswap.ts";

const rpc = process.env.RPC_MAINNET || process.env.NEXT_PUBLIC_RPC_MAINNET || undefined;
const account = privateKeyToAccount(process.env.DEPLOYER_KEY);
const treasury = process.env.TOPUP_TREASURY_ADDRESS || account.address;
const owner = process.env.OWNER || account.address;
const poolFee = Number(process.env.TOPUP_POOL_FEE ?? 100);
const usdgPerCredit = BigInt(process.env.TOPUP_USDG_PER_CREDIT ?? DEFAULT_USDG_PER_CREDIT);

const artifact = JSON.parse(readFileSync(new URL("../contracts/out/KreditCheckout.sol/KreditCheckout.json", import.meta.url)));
const client = createPublicClient({ chain: robinhood, transport: http(rpc) });
const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpc) });

const args = [owner, treasury, UNISWAP_MAINNET.swapRouter02, USDG_MAINNET.address, poolFee, usdgPerCredit];
console.log("deployer", account.address, "owner", owner, "treasury", treasury);
console.log("router", UNISWAP_MAINNET.swapRouter02, "usdg", USDG_MAINNET.address, "poolFee", poolFee, "usdgPerCredit", usdgPerCredit.toString());
const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args });
console.log("tx", hash);
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error("deployment reverted");
console.log("KreditCheckout", receipt.contractAddress, "block", receipt.blockNumber.toString());
console.log(`TOPUP_CHECKOUT_ADDRESS=${receipt.contractAddress}`);
console.log(`TOPUP_TREASURY_ADDRESS=${treasury}`);
