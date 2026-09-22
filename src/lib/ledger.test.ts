import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

process.env.DATABASE_PATH = ":memory:";
const { claim, claimRoyalties, listContracts, rememberContracts, createKey, findKey, getBalance, KeyLimitError, listKeys, listLedger, MAX_ACTIVE_KEYS, recordUsage, revokeKey } =
  await import("./ledger.ts");
import type { ScoredTask } from "./scoring.ts";

const ALICE = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
const BOB = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb";

let counter = 0;
const task = (credits: number, day = "2026-09-01", feeWei = "0"): ScoredTask => ({
  hash: `0x${(++counter).toString(16).padStart(64, "0")}`,
  timestamp: `${day}T10:00:00.000000Z`,
  kind: "contract_call",
  label: "test",
  credits,
  feeWei,
  contract: null,
});

test("a claim pays once; claiming again pays nothing", () => {
  const tasks = [task(50), task(50), task(500)];
  const first = claim(ALICE, "testnet", tasks);
  assert.equal(first.granted, 600);
  assert.equal(getBalance(ALICE), 600);

  const second = claim(ALICE, "testnet", tasks);
  assert.equal(second.granted, 0);
  assert.equal(getBalance(ALICE), 600);
});

test("only new transactions are paid on a later claim", () => {
  const before = getBalance(ALICE);
  const result = claim(ALICE, "testnet", [task(50, "2026-09-02")]);
  assert.equal(result.granted, 50);
  assert.equal(getBalance(ALICE), before + 50);
});

test("the daily cap holds across separate claims", () => {
  const day = "2026-09-03";
  assert.equal(claim(BOB, "testnet", [task(500, day), task(400, day)]).granted, 900);
  // 100 left for that day, even though this claim earned 500.
  assert.equal(claim(BOB, "testnet", [task(500, day)]).granted, 100);
  assert.equal(claim(BOB, "testnet", [task(500, day)]).granted, 0);
});

test("the same network+hash can never be claimed twice, even by another wallet", () => {
  const shared = [task(50, "2026-09-04")];
  claim(ALICE, "testnet", shared);
  assert.equal(claim(BOB, "testnet", shared).granted, 0);
});

test("milestones pay once", () => {
  const carol = "0xCCCCccccCCCCccccCCCCccccCCCCccccCCCCcccc";
  const tasks = Array.from({ length: 10 }, (_, i) => task(10, `2026-08-${String(i + 1).padStart(2, "0")}`));
  const first = claim(carol, "testnet", tasks);
  assert.equal(first.granted, 10 * 10 + 100);
  assert.equal(first.milestones, 1);
  assert.equal(claim(carol, "testnet", tasks).granted, 0);
  assert.deepEqual(listLedger(carol).map((entry) => entry.kind).sort(), ["claim", "milestone"]);
});

test("addresses are case-insensitive", () => {
  assert.equal(getBalance(ALICE.toLowerCase()), getBalance(ALICE));
});

test("keys: created once, found by value, gone when revoked", () => {
  const created = createKey(ALICE, "postman");
  assert.ok(created.key.startsWith("kredit_sk_"));
  assert.ok(created.prefix.startsWith(created.key.slice(0, "kredit_sk_".length + 4)));
  assert.equal(findKey(created.key)?.address, ALICE.toLowerCase());
  assert.equal(findKey("kredit_sk_wrong"), null);
  assert.equal(findKey("fuel_sk_wrong"), null);
  assert.equal(findKey("not-a-kredit-key"), null);

  assert.equal(revokeKey(BOB, created.id), false); // someone else can't revoke it
  assert.equal(revokeKey(ALICE, created.id), true);
  assert.equal(findKey(created.key), null);
  assert.equal(listKeys(ALICE).length, 0);
});

test("a key made before the rename still works", async () => {
  const legacy = "fuel_sk_made-before-the-rename";
  const { db } = await import("./db.ts");
  db()
    .prepare("INSERT INTO api_keys (id, address, key_hash, prefix, name) VALUES (?, ?, ?, ?, ?)")
    .run("legacy-key", BOB.toLowerCase(), createHash("sha256").update(legacy).digest("hex"), "fuel_sk_made…name", "legacy");
  assert.deepEqual({ ...findKey(legacy) }, { id: "legacy-key", address: BOB.toLowerCase(), name: "legacy", prefix: "fuel_sk_made…name" });
  assert.equal(revokeKey(BOB, "legacy-key"), true);
  assert.equal(findKey(legacy), null);
});

test("the full key is never stored", async () => {
  const created = createKey(ALICE, "secret-check");
  const { db } = await import("./db.ts");
  const dump = JSON.stringify(db().prepare("SELECT * FROM api_keys").all());
  assert.ok(!dump.includes(created.key));
  revokeKey(ALICE, created.id);
});

test("active keys are limited", () => {
  const dave = "0xDDDDddddDDDDddddDDDDddddDDDDddddDDDDdddd";
  for (let i = 0; i < MAX_ACTIVE_KEYS; i++) createKey(dave, `key ${i}`);
  assert.throws(() => createKey(dave, "one too many"), KeyLimitError);
});

test("spending lowers the balance and is written to the ledger", () => {
  const before = getBalance(ALICE);
  const key = createKey(ALICE, "spender");
  const after = recordUsage({ keyId: key.id, address: ALICE, model: "kredit/echo", inputTokens: 10, outputTokens: 5, credits: 7 });
  assert.equal(after, before - 7);
  assert.equal(listLedger(ALICE, 1)[0].amount, -7);
  assert.ok(listKeys(ALICE).find((k) => k.id === key.id)?.lastUsedAt);
});

// --- Gas-Back. At $2,500 per ETH, 0.001 ETH of gas = $2.50, and 40% of that = 1,000 credits.
const PRICE = BigInt(250_000); // cents
const ETH_0_001 = "1000000000000000";

test("gas-back pays 40% of the gas spent, once", () => {
  const erin = "0xEEEEeeeeEEEEeeeeEEEEeeeeEEEEeeeeEEEEeeee";
  const tasks = [task(50, "2026-07-01", ETH_0_001)];
  const first = claim(erin, "testnet", tasks, PRICE);
  assert.equal(first.gasBack, 1000);
  assert.equal(first.granted, 50 + 1000);
  assert.equal(claim(erin, "testnet", tasks, PRICE).granted, 0);
  assert.ok(listLedger(erin).some((entry) => entry.kind === "gasback" && entry.amount === 1000));
});

test("transactions claimed before gas-back existed still get it later", () => {
  const frank = "0xFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFf";
  const tasks = [task(50, "2026-07-02", ETH_0_001)];
  assert.equal(claim(frank, "testnet", tasks).granted, 50); // no price: task reward only
  const later = claim(frank, "testnet", tasks, PRICE);
  assert.equal(later.tasks, 0);
  assert.equal(later.gasBack, 1000);
  assert.equal(claim(frank, "testnet", tasks, PRICE).granted, 0);
});

test("fractions of a credit carry over instead of being lost", () => {
  const gina = "0x9999999999999999999999999999999999999999";
  // 0.0000006 ETH of gas at $2,500 = 0.6 credits of gas-back per transaction.
  const tiny = "600000000000";
  assert.equal(claim(gina, "testnet", [task(10, "2026-07-03", tiny)], PRICE).gasBack, 0);
  assert.equal(claim(gina, "testnet", [task(10, "2026-07-04", tiny)], PRICE).gasBack, 1); // 0.6 + 0.6 = 1.2
  assert.equal(claim(gina, "testnet", [task(10, "2026-07-05", tiny)], PRICE).gasBack, 0); // 0.2 + 0.6 = 0.8
  assert.equal(claim(gina, "testnet", [task(10, "2026-07-06", tiny)], PRICE).gasBack, 1); // 0.8 + 0.6 = 1.4
});

test("gas-back is not limited by the daily task cap", () => {
  const hank = "0x8888888888888888888888888888888888888888";
  const tasks = Array.from({ length: 30 }, () => task(50, "2026-07-07", ETH_0_001));
  const result = claim(hank, "testnet", tasks, PRICE);
  assert.equal(result.granted, 1000 + 100 + 30 * 1000); // capped tasks + 10-tx milestone + full gas-back
});

// --- Builder Royalties. 0.001 ETH of gas at $2,500 = $2.50; 20% = 500 credits.
test("royalties: contracts are remembered, usage pays once, own calls never pay", () => {
  const builder = "0x7777777777777777777777777777777777777777";
  const deployed = { ...task(500, "2026-06-01"), kind: "deploy" as const, contract: "0xC0FFEE0000000000000000000000000000000001" };
  rememberContracts(builder, "testnet", [deployed, task(50, "2026-06-02")]);
  rememberContracts(builder, "testnet", [deployed]); // scanning again must not duplicate
  assert.deepEqual(listContracts(builder, "testnet").map((c) => c.address), [deployed.contract.toLowerCase()]);

  const usage = [{
    contract: deployed.contract.toLowerCase(),
    calls: [
      { hash: "0xr1", from: "0xaaa", ok: true, feeWei: ETH_0_001 },
      { hash: "0xr2", from: "0xbbb", ok: true, feeWei: ETH_0_001 },
      { hash: "0xr3", from: builder, ok: true, feeWei: ETH_0_001 }, // the builder's own call
    ],
  }];
  const first = claimRoyalties(builder, "testnet", usage, PRICE);
  assert.deepEqual([first.granted, first.calls], [1000, 2]);
  assert.equal(getBalance(builder), 1000);
  assert.equal(claimRoyalties(builder, "testnet", usage, PRICE).granted, 0);
  assert.equal(listContracts(builder, "testnet")[0].paidCalls, 2);
  assert.ok(listLedger(builder).some((entry) => entry.kind === "royalty" && entry.amount === 1000));
});

test("royalties and the caller's own rewards are independent", () => {
  // The same transaction can pay the caller (task + gas-back) and the builder (royalty).
  const caller = "0x6666666666666666666666666666666666666666";
  const builder = "0x5555555555555555555555555555555555555555";
  const shared = task(50, "2026-06-03", ETH_0_001);
  assert.equal(claim(caller, "testnet", [shared], PRICE).granted, 50 + 1000);
  const usage = [{ contract: "0xc2", calls: [{ hash: shared.hash, from: caller, ok: true, feeWei: ETH_0_001 }] }];
  assert.equal(claimRoyalties(builder, "testnet", usage, PRICE).granted, 500);
  // Together the two wallets got back 60% of the gas value (1,500 of 2,500 credits): never a profit.
});
