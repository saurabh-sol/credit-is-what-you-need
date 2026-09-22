import { privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, encodePacked, keccak256, parseEventLogs, toHex, type Address, type Hash, type Hex } from "viem";
import { chains, publicClient } from "./chain.ts";
import { db, transaction } from "./db.ts";
import { applyPlan, previewClaim } from "./ledger.ts";
import type { NetworkId } from "./networks.ts";
import { RECEIPTS_ABI, RECEIPT_TYPES, receiptDomain, type SignedReceipt, ZERO_ADDRESS } from "./receipts-abi.ts";
import { getReferrer } from "./referrals.ts";
import { RULES_VERSION, type ClaimPlan, type ScoredTask } from "./scoring.ts";

// On-chain receipts. The server still scores a wallet from the explorer and
// plans the claim exactly as before; but instead of writing the ledger it
// signs the plan as an EIP-712 receipt. The wallet submits that receipt to
// the KreditReceipts contract, and the ledger is written once the chain has
// it (`Claimed` event). So every claim has a transaction on Blockscout, and
// anyone can recompute its record root from the transaction hashes.

export const RECEIPT_TTL_S = 600; // a signed receipt is good for ten minutes

export type ReceiptsConfig = { network: NetworkId; contract: Address; chainId: number };

const isAddress = (value: string | undefined): value is Address => /^0x[0-9a-fA-F]{40}$/.test(value ?? "");
const isKey = (value: string | undefined): value is Hex => /^0x[0-9a-fA-F]{64}$/.test(value ?? "");
const lower = (address: string) => address.toLowerCase();

// Off (null) for a network until its contract address and the signer key are set.
export function receiptsConfig(
  network: NetworkId,
  env: Record<string, string | undefined> = process.env,
): ReceiptsConfig | null {
  const contract = env[network === "testnet" ? "RECEIPTS_ADDRESS_TESTNET" : "RECEIPTS_ADDRESS_MAINNET"];
  if (!isAddress(contract) || !isKey(env.RECEIPT_SIGNER_KEY)) return null;
  return { network, contract: lower(contract) as Address, chainId: chains[network].chain.id };
}

export const signerAccount = (env: Record<string, string | undefined> = process.env) =>
  isKey(env.RECEIPT_SIGNER_KEY) ? privateKeyToAccount(env.RECEIPT_SIGNER_KEY) : null;

// keccak256 of the claimed transaction hashes, sorted, packed. Anyone can
// recompute it from the explorer and the `Claimed` event.
export function recordRoot(hashes: string[]): Hash {
  const sorted = [...new Set(hashes.map(lower))].sort() as Hash[];
  return keccak256(encodePacked(["bytes32[]"], [sorted]));
}

export class ReceiptError extends Error {}

export type ReceiptMessage = {
  wallet: Address;
  credits: bigint;
  txCount: number;
  recordRoot: Hash;
  rulesVersion: number;
  referrer: Address;
  nonce: bigint;
  deadline: bigint;
};

type PendingRow = {
  receiptId: string;
  network: NetworkId;
  address: string;
  nonce: number;
  credits: number;
  plan: string;
  deadline: number;
  txHash: string | null;
  settledAt: string | null;
};

const pendingFor = (address: string, network: NetworkId) =>
  db()
    .prepare(
      "SELECT receipt_id AS receiptId, network, address, nonce, credits, plan, deadline, tx_hash AS txHash, settled_at AS settledAt FROM pending_claims WHERE address = ? AND network = ? AND settled_at IS NULL",
    )
    .all(lower(address), network) as PendingRow[];

// Writes a receipt's plan into the ledger, once. Returns what it paid.
function settle(row: PendingRow, txHash: string) {
  return transaction(() => {
    const fresh = db()
      .prepare("SELECT settled_at FROM pending_claims WHERE receipt_id = ?")
      .get(row.receiptId) as { settled_at: string | null } | undefined;
    if (!fresh || fresh.settled_at) return null;
    const plan = JSON.parse(row.plan) as ClaimPlan;
    const paid = applyPlan(row.address, row.network, plan, { txHash, network: row.network });
    db()
      .prepare("UPDATE pending_claims SET tx_hash = ?, settled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE receipt_id = ?")
      .run(lower(txHash), row.receiptId);
    return paid;
  });
}

// Receipts this wallet already put on-chain but the server has not written
// yet (the browser closed before it could confirm, say). The contract keeps
// `claimed[receiptId]`, so no log search is needed.
async function settleLanded(config: ReceiptsConfig, address: string) {
  const open = pendingFor(address, config.network);
  if (open.length === 0) return;
  const client = publicClient(config.network);
  const onChainNonce = Number(
    await client.readContract({ abi: RECEIPTS_ABI, address: config.contract, functionName: "nonces", args: [address as Address] }),
  );
  for (const row of open) {
    if (row.nonce >= onChainNonce) continue; // not claimed yet (or never will be)
    const landed = await client.readContract({
      abi: RECEIPTS_ABI,
      address: config.contract,
      functionName: "claimed",
      args: [row.receiptId as Hash],
    });
    if (landed) {
      settle(row, await txHashFor(config, address, row.receiptId));
    } else {
      // Another receipt with this nonce landed instead; this one can never be claimed.
      db().prepare("UPDATE pending_claims SET settled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE receipt_id = ?").run(row.receiptId);
    }
  }
}

// The transaction that carried a receipt, found through its `Claimed` event.
// Only needed on the recovery path; the normal path is told the hash.
async function txHashFor(config: ReceiptsConfig, address: string, receiptId: string) {
  const client = publicClient(config.network);
  const logs = await client.getContractEvents({
    abi: RECEIPTS_ABI,
    address: config.contract,
    eventName: "Claimed",
    args: { wallet: address as Address, receiptId: receiptId as Hash },
    fromBlock: BigInt(process.env[`RECEIPTS_FROM_BLOCK_${config.network.toUpperCase()}`] ?? 0),
    toBlock: "latest",
  });
  return logs[0]?.transactionHash ?? "0x";
}

export type IssuedReceipt = {
  receipt: SignedReceipt;
  signature: Hex;
  receiptId: Hash;
  contract: Address;
  chainId: number;
  credits: number;
};

// Plans the claim and signs it. Nothing is paid until the chain confirms it.
export async function issueReceipt(config: ReceiptsConfig, address: string, tasks: ScoredTask[]): Promise<IssuedReceipt> {
  const signer = signerAccount();
  if (!signer) throw new ReceiptError("Receipts are not set up on the server.");
  const wallet = lower(address) as Address;

  await settleLanded(config, wallet);
  const plan = previewClaim(wallet, config.network, tasks);
  if (plan.total <= 0) throw new ReceiptError("Nothing to claim yet.");

  const client = publicClient(config.network);
  const nonce = await client.readContract({ abi: RECEIPTS_ABI, address: config.contract, functionName: "nonces", args: [wallet] });

  const hashes = plan.txGrants.filter((grant) => grant.granted > 0).map((grant) => grant.hash);
  const message: ReceiptMessage = {
    wallet,
    credits: BigInt(plan.total),
    txCount: hashes.length,
    recordRoot: recordRoot(hashes),
    rulesVersion: RULES_VERSION,
    referrer: (getReferrer(wallet) ?? ZERO_ADDRESS) as Address,
    nonce,
    deadline: BigInt(Math.floor(Date.now() / 1000) + RECEIPT_TTL_S),
  };
  const domain = receiptDomain(config.chainId, config.contract);
  const signature = await signer.signTypedData({ domain, types: RECEIPT_TYPES, primaryType: "Receipt", message });
  const receiptId = receiptIdOf(message);

  db()
    .prepare(
      "INSERT INTO pending_claims (receipt_id, network, address, nonce, credits, plan, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(receiptId, config.network, wallet, Number(nonce), plan.total, JSON.stringify(plan), Number(message.deadline));

  return {
    receipt: {
      ...message,
      credits: message.credits.toString(),
      nonce: message.nonce.toString(),
      deadline: message.deadline.toString(),
    },
    signature,
    receiptId,
    contract: config.contract,
    chainId: config.chainId,
    credits: plan.total,
  };
}

// The EIP-712 struct hash: what the contract calls the receipt id.
const RECEIPT_TYPEHASH = keccak256(
  toHex(`Receipt(${RECEIPT_TYPES.Receipt.map((field) => `${field.type} ${field.name}`).join(",")})`),
);
export function receiptIdOf(message: ReceiptMessage): Hash {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, ...RECEIPT_TYPES.Receipt.map((field) => ({ type: field.type }))],
      [RECEIPT_TYPEHASH, ...RECEIPT_TYPES.Receipt.map((field) => message[field.name])],
    ),
  );
}

export class NotMinedError extends Error {}

// The browser sent the hash of its claim transaction: read the `Claimed`
// events in it and write the ledger for every receipt of this wallet.
export async function confirmClaim(config: ReceiptsConfig, address: string, hash: Hash) {
  const client = publicClient(config.network);
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash });
  } catch {
    throw new NotMinedError("That transaction is not confirmed yet.");
  }
  if (receipt.status !== "success") throw new ReceiptError("The claim transaction failed on-chain, so nothing was paid.");

  const events = parseEventLogs({ abi: RECEIPTS_ABI, eventName: "Claimed", logs: receipt.logs }).filter(
    (log) => lower(log.address) === config.contract && lower(log.args.wallet) === lower(address),
  );
  if (events.length === 0) throw new ReceiptError("No Kredit receipt from your wallet was found in that transaction.");

  const open = pendingFor(address, config.network);
  let granted = 0;
  let already = 0;
  for (const event of events) {
    const row = open.find((candidate) => candidate.receiptId === event.args.receiptId);
    if (!row) {
      // Settled before (a retry), or issued by another server. Check which.
      const known = db().prepare("SELECT settled_at FROM pending_claims WHERE receipt_id = ?").get(event.args.receiptId);
      if (known) already += 1;
      else throw new ReceiptError("That receipt was not issued by this server.");
      continue;
    }
    const paid = settle(row, hash);
    if (paid) granted += paid.total;
    else already += 1;
  }
  return { granted, already, txHash: hash };
}
