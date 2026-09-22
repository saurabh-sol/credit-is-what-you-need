// Deploys KreditSwapBuy to Robinhood Chain mainnet from the compiled Foundry
// artifact (run `cd contracts && forge build` first). Reads DEPLOYER_KEY and
// TOPUP_TREASURY_ADDRESS (defaults to the deployer) from the environment:
//   node --env-file=.env.local scripts/deploy-swap-buy.mjs
// Buying stays off until the owner calls setToken (scripts/swap-buy-admin.mjs).
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";

const ROUTER = "0xCaf681a66D020601342297493863E78C959E5cb2"; // Uniswap v3 SwapRouter02 on Robinhood Chain
const rpc = process.env.RPC_MAINNET || process.env.NEXT_PUBLIC_RPC_MAINNET || undefined;
const account = privateKeyToAccount(process.env.DEPLOYER_KEY);
const treasury = process.env.TOPUP_TREASURY_ADDRESS || account.address;
const owner = process.env.OWNER || account.address;

const artifact = JSON.parse(readFileSync(new URL("../contracts/out/KreditSwapBuy.sol/KreditSwapBuy.json", import.meta.url)));
const client = createPublicClient({ chain: robinhood, transport: http(rpc) });
const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpc) });

console.log("deployer", account.address, "owner", owner, "treasury", treasury, "router", ROUTER);
const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [owner, treasury, ROUTER] });
console.log("tx", hash);
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error("deployment reverted");
console.log("KreditSwapBuy", receipt.contractAddress, "block", receipt.blockNumber.toString());
console.log(`TOPUP_SWAP_ADDRESS=${receipt.contractAddress}`);
