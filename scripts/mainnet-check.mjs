// Is Kredit ready on Robinhood Chain mainnet? Runs the real flow, end to end,
// against a server and the real chain: scan a wallet's mainnet record, get a
// signed receipt, submit it to the KreditReceipts contract with the wallet's
// own key, confirm it, create an API key, and call the AI models with it.
//
// Needs a server with mainnet configured (an Alchemy NEXT_PUBLIC_RPC_MAINNET,
// RECEIPTS_ADDRESS_MAINNET, RECEIPT_SIGNER_KEY, UPSTREAM_API_KEY) and:
//   BASE_URL=http://localhost:3459 SESSION_SECRET=… DATABASE_PATH=data/kredit.db \
//   WALLET_KEY=<a wallet with mainnet history and a little ETH> node scripts/mainnet-check.mjs
// The claim is a real transaction (a fraction of a cent of gas) and the model
// calls spend real credits. The key it makes is revoked at the end.
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";
import { sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const rpc = process.env.RPC_MAINNET || process.env.NEXT_PUBLIC_RPC_MAINNET || undefined;
const account = privateKeyToAccount(process.env.WALLET_KEY);
const wallet = createWalletClient({ account, chain: robinhood, transport: http(rpc) });
const reader = createPublicClient({ chain: robinhood, transport: http(rpc) });
const MODEL = process.env.CHECK_MODEL ?? "openai/gpt-4o-mini";

const ABI = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "receipt", type: "tuple", components: [
    { name: "wallet", type: "address" }, { name: "credits", type: "uint64" }, { name: "txCount", type: "uint32" }, { name: "recordRoot", type: "bytes32" },
    { name: "rulesVersion", type: "uint32" }, { name: "referrer", type: "address" }, { name: "nonce", type: "uint64" }, { name: "deadline", type: "uint64" } ] },
    { name: "signature", type: "bytes" }], outputs: [{ name: "", type: "bytes32" }] },
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
const chat = (key, body) => fetch(`${base}/v1/chat/completions`, {
  method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body),
});

console.log(`wallet ${account.address}, server ${base}`);
const before = await get("/api/account");
console.log(`balance before: ${before.balance} credits`);

// --- scan the real mainnet record
const record = await get("/api/record?network=mainnet");
check("mainnet scan works", typeof record.total === "number", record.error ?? `${record.successfulTxs} successful txs, ${record.total} credits`);
check("claims go through the contract", Boolean(record.onchain?.contract), record.onchain?.contract);
const claimable = record.claimable ?? 0;
console.log(`claimable now: ${claimable}`);

// --- claim on-chain, if there is anything new to claim
let claimedTx = null;
if (claimable > 0) {
  const issued = await post("/api/claim", { network: "mainnet" });
  check("the server signs a receipt", issued.status === 200 && issued.body.onchain === true, issued.body.error ?? `${issued.body.credits} credits, nonce ${issued.body.receipt?.nonce}`);
  const r = issued.body.receipt;
  const receipt = { ...r, credits: BigInt(r.credits), nonce: BigInt(r.nonce), deadline: BigInt(r.deadline) };
  const hash = await wallet.writeContract({ abi: ABI, address: issued.body.contract, functionName: "claim", args: [receipt, issued.body.signature] });
  const mined = await reader.waitForTransactionReceipt({ hash });
  const events = parseEventLogs({ abi: ABI, eventName: "Claimed", logs: mined.logs });
  check("the contract wrote the receipt on mainnet", mined.status === "success" && events.length === 1, `https://robinhoodchain.blockscout.com/tx/${hash}`);
  let confirmed;
  for (let attempt = 0; attempt < 30; attempt++) {
    confirmed = await post("/api/claim/confirm", { network: "mainnet", hash });
    if (confirmed.status !== 404) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  check("confirming pays the credits", confirmed.status === 200 && confirmed.body.granted === claimable, JSON.stringify(confirmed.body));
  claimedTx = hash;
} else {
  console.log("nothing new to claim for this wallet; skipping the on-chain claim");
}
const account1 = await get("/api/account");
check("the balance covers a model call", account1.balance > 0, `${account1.balance} credits`);
if (claimedTx) check("the activity links the receipt", account1.activity.some((row) => row.txHash === claimedTx.toLowerCase()));

// --- the AI models
const created = await post("/api/keys", { name: "mainnet check" });
check("an API key is created", created.status === 201 || created.status === 200, created.body.error ?? created.body.prefix);
const key = created.body.key;

const models = await (await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${key}` } })).json();
const ids = (models.data ?? []).map((m) => m.id);
check("the model list has real models", ids.length > 1, `${ids.length} models`);

const echo = await chat(key, { model: "kredit/echo", messages: [{ role: "user", content: "ping" }] });
const echoBody = await echo.json();
check("the echo model answers and bills", echo.status === 200 && echoBody.choices?.[0]?.message?.content === "Kredit echo: ping",
  `charged ${echo.headers.get("x-kredit-credits-charged")}, balance ${echo.headers.get("x-kredit-balance")}`);

const real = await chat(key, { model: MODEL, messages: [{ role: "user", content: "Reply with the single word: ready" }], max_tokens: 16 });
const realBody = await real.json();
check(`a real model (${MODEL}) answers through the gateway`, real.status === 200 && typeof realBody.choices?.[0]?.message?.content === "string",
  real.status === 200 ? `"${realBody.choices[0].message.content.trim()}", charged ${real.headers.get("x-kredit-credits-charged")} credits` : JSON.stringify(realBody).slice(0, 200));

const after = await get("/api/account");
check("spending shows in the ledger", after.balance < account1.balance && after.activity.some((row) => row.kind === "spend"), `${account1.balance} -> ${after.balance}`);

// --- clean up the key
const revoked = await fetch(`${base}/api/keys/${created.body.id}`, { method: "DELETE", headers: { cookie } });
check("the check's key is revoked", revoked.ok);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
