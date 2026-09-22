import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_PATH = ":memory:";
const { claim, createKey, findKey, getBalance, KeyLimitError, listKeys, listLedger, MAX_ACTIVE_KEYS, recordUsage, revokeKey } =
  await import("./ledger.ts");
const { listInvited, ReferralError, referralTotals, setReferrer } = await import("./referrals.ts");
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
  const first = claim(ALICE, "mainnet", tasks);
  assert.equal(first.granted, 600);
  assert.equal(getBalance(ALICE), 600);

  const second = claim(ALICE, "mainnet", tasks);
  assert.equal(second.granted, 0);
  assert.equal(getBalance(ALICE), 600);
});

test("only new transactions are paid on a later claim", () => {
  const before = getBalance(ALICE);
  const result = claim(ALICE, "mainnet", [task(50, "2026-09-02")]);
  assert.equal(result.granted, 50);
  assert.equal(getBalance(ALICE), before + 50);
});

test("the daily cap holds across separate claims", () => {
  const day = "2026-09-03";
  assert.equal(claim(BOB, "mainnet", [task(500, day), task(400, day)]).granted, 900);
  // 100 left for that day, even though this claim earned 500.
  assert.equal(claim(BOB, "mainnet", [task(500, day)]).granted, 100);
  assert.equal(claim(BOB, "mainnet", [task(500, day)]).granted, 0);
});

test("the same network+hash can never be claimed twice, even by another wallet", () => {
  const shared = [task(50, "2026-09-04")];
  claim(ALICE, "mainnet", shared);
  assert.equal(claim(BOB, "mainnet", shared).granted, 0);
});

test("milestones pay once", () => {
  const carol = "0xCCCCccccCCCCccccCCCCccccCCCCccccCCCCcccc";
  const tasks = Array.from({ length: 10 }, (_, i) => task(10, `2026-08-${String(i + 1).padStart(2, "0")}`));
  const first = claim(carol, "mainnet", tasks);
  const streak = 20 + 30 + 40 + 50 + 60 + 70 + 80 + 90 + 100; // ten days in a row
  assert.equal(first.granted, 10 * 10 + 100 + streak);
  assert.equal(first.milestones, 1);
  assert.equal(first.streak, streak);
  assert.equal(claim(carol, "mainnet", tasks).granted, 0);
  assert.deepEqual(listLedger(carol).map((entry) => entry.kind).sort(), ["claim", "milestone", "streak"]);
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
  assert.equal(findKey("not-a-kredit-key"), null);

  assert.equal(revokeKey(BOB, created.id), false); // someone else can't revoke it
  assert.equal(revokeKey(ALICE, created.id), true);
  assert.equal(findKey(created.key), null);
  assert.equal(listKeys(ALICE).length, 0);
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

// --- Streaks. Each consecutive active day after the first pays a bonus, once.
test("a streak day is paid once, even when its transactions were claimed earlier", () => {
  const erin = "0xEEEEeeeeEEEEeeeeEEEEeeeeEEEEeeeeEEEEeeee";
  const monday = task(10, "2026-07-06");
  assert.equal(claim(erin, "mainnet", [monday]).streak, 0); // one day is not a streak

  const tuesday = task(10, "2026-07-07");
  const later = claim(erin, "mainnet", [monday, tuesday]); // the scan always shows the whole record
  assert.equal(later.tasks, 1);
  assert.equal(later.streak, 20); // day 2 of the streak
  assert.equal(later.granted, 10 + 20);

  assert.equal(claim(erin, "mainnet", [monday, tuesday]).granted, 0);
  const wednesday = task(10, "2026-07-08");
  assert.equal(claim(erin, "mainnet", [monday, tuesday, wednesday]).streak, 30); // only the new day
});

test("the streak bonus is not limited by the daily task cap", () => {
  const hank = "0x8888888888888888888888888888888888888888";
  const days = ["2026-07-20", "2026-07-21", "2026-07-22"];
  const tasks = days.flatMap((day) => Array.from({ length: 30 }, () => task(50, day)));
  const result = claim(hank, "mainnet", tasks);
  // 3 capped days + the 10-tx and 50-tx milestones (20 count per day) + days 2 and 3 of the streak
  assert.equal(result.granted, 3 * 1000 + 100 + 300 + 20 + 30);
});

// --- Referrals. The inviter gets 10% of every claim, on top; the invitee keeps it all.
test("an inviter earns a share of each claim their invitee makes", () => {
  const inviter = "0x7777777777777777777777777777777777777777";
  const friend = "0x6666666666666666666666666666666666666666";
  setReferrer(friend, inviter);

  const tasks = [task(500, "2026-06-01"), task(50, "2026-06-01")];
  const first = claim(friend, "mainnet", tasks);
  assert.equal(first.granted, 550);
  assert.equal(first.referral, 55);
  assert.equal(getBalance(friend), 550); // nothing taken from the friend
  assert.equal(getBalance(inviter), 55);
  assert.ok(listLedger(inviter).some((entry) => entry.kind === "referral" && entry.amount === 55));

  assert.equal(claim(friend, "mainnet", tasks).referral, 0); // nothing new, nothing shared
  assert.equal(claim(friend, "mainnet", [task(9, "2026-06-10")]).referral, 0); // 10% of 9 rounds down to nothing
  assert.deepEqual(referralTotals(inviter), { count: 1, earned: 55 });
  assert.deepEqual(listInvited(inviter).map((row) => [row.address, row.claimed, row.paid]), [[friend, 559, 55]]);
});

test("an inviter is named once, before the first claim, and never in a loop", () => {
  const a = "0x1111111111111111111111111111111111111111";
  const b = "0x2222222222222222222222222222222222222222";
  const c = "0x3333333333333333333333333333333333333333";
  assert.throws(() => setReferrer(a, a), ReferralError); // yourself
  setReferrer(b, a);
  assert.throws(() => setReferrer(b, c), ReferralError); // already has one
  setReferrer(c, b);
  assert.throws(() => setReferrer(a, c), ReferralError); // a -> b -> c -> a would be a loop
  assert.throws(() => setReferrer(ALICE, a), ReferralError); // Alice has claimed already
  assert.equal(referralTotals(a).count, 1);
});

