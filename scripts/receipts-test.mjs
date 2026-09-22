// End-to-end check of on-chain receipts against a local anvil chain.
// Needs (see contracts/README.md, "Testing end to end"):
//   anvil --port 8547 --chain-id 46630
//   node scripts/lib/mock-explorer.mjs 8548
//   the KreditReceipts contract deployed to anvil, its address in RECEIPTS_ADDRESS_TESTNET
//   a server started with the same env: NEXT_PUBLIC_RPC_TESTNET=http://127.0.0.1:8547
//     EXPLORER_API_TESTNET=http://127.0.0.1:8548 RECEIPTS_ADDRESS_TESTNET=... RECEIPT_SIGNER_KEY=...
//     SESSION_SECRET=... DATABASE_PATH=... npx next dev -p 3461
// Then: BASE_URL=http://localhost:3461 DATABASE_PATH=... SESSION_SECRET=... WALLET_KEY=<anvil key> node scripts/receipts-test.mjs
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodTestnet } from "viem/chains";
import { sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const rpc = process.env.NEXT_PUBLIC_RPC_TESTNET ?? "http://127.0.0.1:8547";
const account = privateKeyToAccount(process.env.WALLET_KEY);
const chain = { ...robinhoodTestnet, rpcUrls: { default: { http: [rpc] } } };
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const reader = createPublicClient({ chain, transport: http(rpc) });

const ABI = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "receipt", type: "tuple", components: [
    { name: "wallet", type: "address" }, { name: "credits", type: "uint64" }, { name: "txCount", type: "uint32" }, { name: "recordRoot", type: "bytes32" },
    { name: "rulesVersion", type: "uint32" }, { name: "referrer", type: "address" }, { name: "nonce", type: "uint64" }, { name: "deadline", type: "uint64" } ] },
    { name: "signature", type: "bytes" }], outputs: [{ name: "", type: "bytes32" }] },
  { type: "function", name: "earned", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "event", name: "Claimed", inputs: [
    { name: "wallet", type: "address", indexed: true }, { name: "receiptId", type: "bytes32", indexed: true }, { name: "credits", type: "uint64", indexed: false },
    { name: "txCount", type: "uint32", indexed: false }, { name: "recordRoot", type: "bytes32", indexed: false }, { name: "rulesVersion", type: "uint32", indexed: false },
    { name: "referrer", type: "address", indexed: false }, { name: "nonce", type: "uint64", indexed: false } ] },
];

const results = [];
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name} ${detail}`); };
const cookie = await sessionCookie(account.address);
const get = async (path) => (await fetch(base + path, { headers: { cookie } })).json();
const post = async (path, body) => {
  const response = await fetch(base + path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
const submit = async (issued) => {
  const receipt = { ...issued.receipt, credits: BigInt(issued.receipt.credits), nonce: BigInt(issued.receipt.nonce), deadline: BigInt(issued.receipt.deadline) };
  const hash = await wallet.writeContract({ abi: ABI, address: issued.contract, functionName: "claim", args: [receipt, issued.signature] });
  return { hash, mined: await reader.waitForTransactionReceipt({ hash }) };
};

// --- scan
const record = await get("/api/record?network=testnet");
check("the scan says claims go on-chain", Boolean(record.onchain?.contract), record.onchain?.contract);
check("the fake record earns something", record.claimable > 0, `${record.claimable} credits`);

// --- claim: the server signs, the wallet submits, the server confirms
const first = await post("/api/claim", { network: "testnet" });
check("the claim answers with a signed receipt, not credits", first.status === 200 && first.body.onchain === true && first.body.signature?.length === 132);
check("the receipt is for this wallet and the whole claimable amount",
  first.body.receipt?.wallet === account.address.toLowerCase() && Number(first.body.receipt?.credits) === record.claimable);
check("nothing is paid before the chain confirms", (await get("/api/account")).balance === 0);

const { hash, mined } = await submit(first.body);
const events = parseEventLogs({ abi: ABI, eventName: "Claimed", logs: mined.logs });
check("the contract wrote the receipt", mined.status === "success" && events.length === 1 && events[0].args.receiptId === first.body.receiptId);
check("the contract counts what was earned", (await reader.readContract({ abi: ABI, address: first.body.contract, functionName: "earned", args: [account.address] })) === BigInt(record.claimable));

const confirmed = await post("/api/claim/confirm", { network: "testnet", hash });
check("confirming pays the credits", confirmed.status === 200 && confirmed.body.granted === record.claimable, JSON.stringify(confirmed.body));
const account1 = await get("/api/account");
check("the balance shows them", account1.balance === record.claimable);
check("every ledger row points at the receipt transaction",
  account1.activity.length > 0 && account1.activity.every((row) => row.txHash === hash.toLowerCase() && row.network === "testnet"));

const again = await post("/api/claim/confirm", { network: "testnet", hash });
check("confirming twice pays nothing more", again.status === 200 && again.body.granted === 0 && again.body.already === 1);
check("and the balance is unchanged", (await get("/api/account")).balance === record.claimable);

const empty = await post("/api/claim", { network: "testnet" });
check("with everything claimed there is no receipt to sign", empty.status === 409, empty.body.error);
check("the scan agrees", (await get("/api/record?network=testnet")).claimable === 0);

// --- bad inputs
const bogus = await post("/api/claim/confirm", { network: "testnet", hash: "0x" + "0".repeat(64) });
check("an unknown transaction asks the browser to retry", bogus.status === 404 && bogus.body.retry === true);
check("a malformed hash is refused", (await post("/api/claim/confirm", { network: "testnet", hash: "hello" })).status === 400);

// --- recovery: a receipt claimed on-chain but never confirmed is settled on the next claim
const database = new (await import("node:sqlite")).DatabaseSync(process.env.DATABASE_PATH);
database.exec("DELETE FROM claimed_txs; DELETE FROM claimed_milestones; DELETE FROM claimed_streak_days; DELETE FROM ledger; DELETE FROM pending_claims;");
database.close();
const second = await post("/api/claim", { network: "testnet" });
check("after a reset the server signs a fresh receipt with the next nonce", second.status === 200 && second.body.receipt?.nonce === "1");
const { hash: hash2 } = await submit(second.body);
check("the wallet claimed it on-chain without telling the server", (await get("/api/account")).balance === 0);
const third = await post("/api/claim", { network: "testnet" });
check("the next claim finds it on-chain and pays it first", third.status === 409 && (await get("/api/account")).balance === record.claimable, third.body.error);
check("and records its transaction", (await get("/api/account")).activity.every((row) => row.txHash === hash2.toLowerCase()));

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
