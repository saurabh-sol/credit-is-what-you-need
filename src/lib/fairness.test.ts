import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeDayCount,
  applyDiversity,
  CALLS_FULL_PER_TARGET_PER_DAY,
  CALLS_HALF_PER_TARGET_PER_DAY,
  claimGate,
  concentration,
  DAILY_EMISSIONS_BUDGET,
  DEPLOYS_PAID_PER_DAY,
  HOLD_THRESHOLD,
  REFERRAL_DAILY_CAP,
  REFERRAL_MIN_ACTIVE_DAYS,
  REFERRAL_MIN_CLAIM,
  referralPayable,
  riskOf,
  WALLET_MIN_AGE_DAYS,
  walletAgeDays,
} from "./fairness.ts";
import { buildReceipt, planClaim, scoreTx, type ClaimState, type ScannedTx, type ScoredTask } from "./scoring.ts";

let counter = 0;
const tx = (over: Partial<ScannedTx> = {}): ScannedTx => ({
  hash: `0x${(++counter).toString(16).padStart(64, "0")}`,
  timestamp: "2026-09-01T10:00:00.000000Z",
  ok: true,
  to: "0x1111111111111111111111111111111111111111",
  toIsContract: false,
  toName: null,
  method: null,
  createdContract: null,
  feeWei: "1000",
  ...over,
});
const task = (over: Partial<ScoredTask> = {}): ScoredTask => ({
  hash: `0x${(++counter).toString(16).padStart(64, "0")}`,
  timestamp: "2026-09-01T10:00:00.000000Z",
  kind: "contract_call",
  label: "call",
  credits: 50,
  feeWei: "1000",
  contract: null,
  target: "0xaaaa",
  ...over,
});
const freshState = (): ClaimState => ({ claimedHashes: new Set(), grantedPerDay: new Map(), claimedMilestones: new Set(), claimedStreakDays: new Set() });

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-22T12:00:00Z");

test("a wallet claims once its first transaction is old enough", () => {
  const young = [{ timestamp: new Date(NOW - 1 * DAY).toISOString() }];
  const old = [{ timestamp: new Date(NOW - 10 * DAY).toISOString() }, { timestamp: new Date(NOW - 1 * DAY).toISOString() }];
  assert.ok(walletAgeDays(young, false, NOW) < WALLET_MIN_AGE_DAYS);
  assert.equal(claimGate(young, false, NOW)?.code, "wallet_age");
  assert.equal(claimGate(old, false, NOW), null);
  // A truncated scan means more than 1,000 transactions: old enough by definition.
  assert.equal(claimGate(young, true, NOW), null);
  // An empty record has no age, and cannot claim anyway.
  assert.equal(claimGate([], false, NOW)?.code, "wallet_age");
  // The gate says when.
  const until = Date.parse(claimGate(young, false, NOW)!.until);
  assert.equal(until, NOW - 1 * DAY + WALLET_MIN_AGE_DAYS * DAY);
});

test("dust transfers are not tasks; transfers with value and unknown values are", () => {
  assert.equal(scoreTx(tx({ valueWei: "0" }), {}), null);
  assert.equal(scoreTx(tx({ valueWei: "1" }), {}), null);
  assert.equal(scoreTx(tx({ valueWei: "100000000000000" }), {})?.credits, 10); // exactly 0.0001 ETH
  assert.equal(scoreTx(tx(), {})?.credits, 10); // value unknown: benefit of the doubt
  // Contract calls carry no value and are not dust.
  assert.equal(scoreTx(tx({ toIsContract: true, valueWei: "0" }), {})?.credits, 50);
});

test("repeat calls to one target on one day pay full, then half, then nothing", () => {
  const full = CALLS_FULL_PER_TARGET_PER_DAY;
  const half = CALLS_HALF_PER_TARGET_PER_DAY;
  const tasks = Array.from({ length: full + half + 3 }, (_, i) => task({ timestamp: `2026-09-01T10:${String(i).padStart(2, "0")}:00Z` }));
  const priced = applyDiversity(tasks).map((entry) => entry.credits);
  assert.deepEqual(priced, [...Array(full).fill(50), ...Array(half).fill(25), 0, 0, 0]);
  // Another target the same day, and the same target the next day, start over.
  const other = applyDiversity([...tasks, task({ target: "0xbbbb" }), task({ timestamp: "2026-09-02T10:00:00Z" })]);
  assert.equal(other[other.length - 2].credits, 50);
  assert.equal(other[other.length - 1].credits, 50);
});

test("the diversity rule is deterministic over the whole record", () => {
  const tasks = Array.from({ length: 8 }, (_, i) => task({ timestamp: `2026-09-01T10:${String(i).padStart(2, "0")}:00Z` }));
  const forward = applyDiversity(tasks).map((entry) => [entry.hash, entry.credits]);
  const shuffled = applyDiversity([...tasks].reverse()).map((entry) => [entry.hash, entry.credits]).reverse();
  assert.deepEqual(forward, shuffled);
});

test("deploys are paid up to a few a day", () => {
  const deploys = Array.from({ length: DEPLOYS_PAID_PER_DAY + 2 }, (_, i) =>
    task({ kind: "deploy", credits: 500, contract: `0xc${i}`, target: null, timestamp: `2026-09-01T1${i}:00:00Z` }),
  );
  const priced = applyDiversity(deploys).map((entry) => entry.credits);
  assert.deepEqual(priced, [...Array(DEPLOYS_PAID_PER_DAY).fill(500), 0, 0]);
});

test("the receipt shows what the repeat rule took off", () => {
  const txs = Array.from({ length: 12 }, (_, i) => tx({ toIsContract: true, timestamp: `2026-09-01T10:${String(i).padStart(2, "0")}:00Z` }));
  const receipt = buildReceipt(txs);
  const line = receipt.lines.find((entry) => entry.label.startsWith("Repeat calls"));
  // 12 calls: 5 x 50 + 5 x 25 + 2 x 0 = 375 of 600.
  assert.equal(line?.credits, -(600 - 375));
  assert.equal(receipt.tasks.reduce((sum, entry) => sum + entry.credits, 0), 375);
  assert.equal(receipt.total, 375 + 100); // plus the 10-transaction milestone
});

test("the emissions budget leaves transactions unclaimed rather than paid for nothing", () => {
  // Days apart, so no streak bonus muddies the sums.
  const tasks = [task({ credits: 500, timestamp: "2026-09-01T10:00:00Z" }), task({ credits: 500, timestamp: "2026-09-05T10:00:00Z" }), task({ credits: 500, timestamp: "2026-09-10T10:00:00Z" })];
  const plan = planClaim(tasks, freshState(), 1100);
  assert.equal(plan.txGrants.length, 2);
  assert.equal(plan.total, 1000);
  assert.equal(plan.deferred, 500);
  assert.equal(plan.activeDays, 3);
  // The default budget is the whole day's.
  assert.equal(planClaim(tasks, freshState()).total, 1500);
  assert.ok(DAILY_EMISSIONS_BUDGET > 1500);
  // Milestones and streaks are outside the budget.
  const many = Array.from({ length: 10 }, (_, i) => task({ credits: 50, timestamp: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00Z` }));
  const tight = planClaim(many, freshState(), 0);
  assert.equal(tight.txGrants.length, 0);
  assert.equal(tight.milestones.length, 1);
  assert.ok(tight.streakDays.length > 0);
});

test("a large claim from a young or one-track wallet is held", () => {
  const spread = Array.from({ length: 10 }, (_, i) => task({ target: `0x${i}` }));
  const oneTrack = Array.from({ length: 10 }, (_, i) => task({ target: i === 0 ? "0xother" : "0xsame" }));
  assert.equal(riskOf(HOLD_THRESHOLD, spread, 30), null); // not over the threshold
  assert.equal(riskOf(HOLD_THRESHOLD + 1, spread, 30), null); // old and varied
  assert.ok(riskOf(HOLD_THRESHOLD + 1, spread, 2)); // young
  assert.ok(riskOf(HOLD_THRESHOLD + 1, oneTrack, 30)); // 90% one target
  assert.equal(concentration(oneTrack), 0.9);
  assert.equal(concentration([]), 0);
});

test("referral shares wait for real activity and stop at the daily cap", () => {
  assert.equal(referralPayable(50, 500, REFERRAL_MIN_ACTIVE_DAYS, 0), 50);
  assert.equal(referralPayable(50, 500, REFERRAL_MIN_ACTIVE_DAYS - 1, 0), 0);
  assert.equal(referralPayable(9, REFERRAL_MIN_CLAIM - 1, 10, 0), 0);
  assert.equal(referralPayable(500, 5000, 10, REFERRAL_DAILY_CAP - 100), 100);
  assert.equal(referralPayable(500, 5000, 10, REFERRAL_DAILY_CAP), 0);
  assert.equal(activeDayCount([{ timestamp: "2026-09-01T01:00:00Z" }, { timestamp: "2026-09-01T23:00:00Z" }, { timestamp: "2026-09-02T00:00:00Z" }]), 2);
});
