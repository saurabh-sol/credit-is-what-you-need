import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

await (await import("./test-db.ts")).useTestDatabase();
const { receiptIdOf, receiptsConfig, recordRoot, signerAccount } = await import("./receipts.ts");
const { RECEIPT_TYPES, receiptDomain } = await import("./receipts-abi.ts");
const { applyPlan, getBalance, listLedger } = await import("./ledger.ts");
const { all } = await import("./db.ts");
const { isOwnContractCall } = await import("./record.ts");

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const CONTRACT = "0x00000000000000000000000000000000000000AA";

test("the record root and receipt id match the contract (contracts/test/Hash.t.sol)", () => {
  const root = recordRoot(["0x" + "22".repeat(32), "0x" + "11".repeat(32)]); // order does not matter
  assert.equal(root, "0x3e92e0db88d6afea9edc4eedf62fffa4d92bcdfc310dccbe943747fe8302e871");
  const id = receiptIdOf({
    wallet: "0x1111111111111111111111111111111111111111",
    credits: 650n,
    txCount: 2,
    recordRoot: root,
    rulesVersion: 1,
    referrer: "0x2222222222222222222222222222222222222222",
    nonce: 0n,
    deadline: 1760000600n,
  });
  assert.equal(id, "0x1fae44557446427248a4bdfa7304b6efeee822f94d7427dfaf206a2a230a1d6b");
});

test("a duplicate hash counts once in the root", () => {
  const one = "0x" + "ab".repeat(32);
  assert.equal(recordRoot([one, one.toUpperCase().replace("0X", "0x")]), recordRoot([one]));
});

test("receipts stay off until the contract and the signer key are set", () => {
  assert.equal(receiptsConfig("mainnet", {}), null);
  assert.equal(receiptsConfig("mainnet", { RECEIPTS_ADDRESS_MAINNET: CONTRACT }), null);
  assert.equal(receiptsConfig("mainnet", { RECEIPTS_ADDRESS_MAINNET: "nope", RECEIPT_SIGNER_KEY: KEY }), null);
  assert.equal(receiptsConfig("mainnet", { RECEIPT_SIGNER_KEY: KEY }), null);
  const config = receiptsConfig("mainnet", { RECEIPTS_ADDRESS_MAINNET: CONTRACT, RECEIPT_SIGNER_KEY: KEY });
  assert.deepEqual(config, { network: "mainnet", contract: CONTRACT.toLowerCase(), chainId: 4663 });
});

test("a receipt signed by the server verifies against the contract's domain", async () => {
  const signer = signerAccount({ RECEIPT_SIGNER_KEY: KEY });
  assert.ok(signer);
  assert.equal(signer.address, privateKeyToAccount(KEY).address);
  const message = {
    wallet: "0x1111111111111111111111111111111111111111",
    credits: 100n,
    txCount: 1,
    recordRoot: recordRoot(["0x" + "11".repeat(32)]),
    rulesVersion: 1,
    referrer: "0x0000000000000000000000000000000000000000",
    nonce: 3n,
    deadline: 1760000600n,
  } as const;
  const domain = receiptDomain(4663, CONTRACT);
  const signature = await signer.signTypedData({ domain, types: RECEIPT_TYPES, primaryType: "Receipt", message });
  assert.ok(await verifyTypedData({ address: signer.address, domain, types: RECEIPT_TYPES, primaryType: "Receipt", message, signature }));
  // The same receipt on another chain is a different message.
  const elsewhere = receiptDomain(46630, CONTRACT);
  assert.equal(await verifyTypedData({ address: signer.address, domain: elsewhere, types: RECEIPT_TYPES, primaryType: "Receipt", message, signature }), false);
});

test("applying one plan twice pays once and keeps the receipt's transaction", async () => {
  const wallet = "0x3333333333333333333333333333333333333333";
  const plan = {
    txGrants: [
      { hash: "0x" + "01".repeat(32), day: "2026-09-01", earned: 50, granted: 50 },
      { hash: "0x" + "02".repeat(32), day: "2026-09-02", earned: 500, granted: 500 },
    ],
    milestones: [{ txs: 10, credits: 100 }],
    streakDays: [{ day: "2026-09-02", credits: 20 }],
    total: 670,
    deferred: 0,
    activeDays: 2,
  };
  const tx = "0x" + "ee".repeat(32);
  const first = await applyPlan(wallet, "mainnet", plan, { network: "mainnet", txHash: tx });
  assert.equal(first.granted, 670);
  assert.equal(await getBalance(wallet), 670);
  const rows = await listLedger(wallet);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.txHash === tx && row.network === "mainnet"));

  const again = await applyPlan(wallet, "mainnet", plan, { network: "mainnet", txHash: tx });
  assert.equal(again.granted, 0);
  assert.equal(await getBalance(wallet), 670);

  // Old databases get the new ledger columns on open.
  const columns = (await all<{ name: string }>("SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'ledger'")).map((row) => row.name);
  assert.ok(columns.includes("tx_hash") && columns.includes("network"));
});

test("a call to the receipts contract is not a task", () => {
  const tx = { hash: "0x1", timestamp: "2026-09-22T00:00:00Z", ok: true, to: CONTRACT, toIsContract: true, toName: null, method: "claim", createdContract: null, feeWei: "0" };
  assert.equal(isOwnContractCall(tx, CONTRACT.toLowerCase()), true);
  assert.equal(isOwnContractCall({ ...tx, to: "0x00000000000000000000000000000000000000BB" }, CONTRACT.toLowerCase()), false);
  assert.equal(isOwnContractCall(tx, undefined), false);
});
