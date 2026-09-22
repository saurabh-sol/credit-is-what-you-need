import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReceipt, DAILY_TASK_CAP, scoreTx, type ScannedTx } from "./scoring.ts";
import { STREAK_LABEL } from "./streaks.ts";

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

const PARTNER = "0xC1940D5fd58ce735A44a53f910852B12250F6a14";
const partners = { [PARTNER.toLowerCase()]: { name: "Index Basket", credits: 250 } };

test("every kind of task earns its credits", () => {
  assert.equal(scoreTx(tx(), {})?.credits, 10);
  assert.equal(scoreTx(tx({ toIsContract: true, method: "swap" }), {})?.credits, 50);
  assert.equal(scoreTx(tx({ to: null, createdContract: "0xabc" }), {})?.credits, 500);
  assert.equal(scoreTx(tx({ to: PARTNER, toIsContract: true }), partners)?.credits, 250);
});

test("partner match ignores address casing", () => {
  assert.equal(scoreTx(tx({ to: PARTNER.toUpperCase().replace("0X", "0x") }), partners)?.kind, "partner");
});

test("failed transactions earn nothing but still count gas", () => {
  const receipt = buildReceipt([tx({ ok: false, feeWei: "500" }), tx({ feeWei: "700" })]);
  assert.equal(receipt.total, 10);
  assert.equal(receipt.failedTxs, 1);
  assert.equal(receipt.gasSpentWei, "1200");
});

test("contract calls are labelled with method and contract name", () => {
  const named = scoreTx(tx({ toIsContract: true, method: "buy", toName: "Market" }), {});
  assert.equal(named?.label, "buy on Market");
  const raw = scoreTx(tx({ toIsContract: true, method: "0xa2a88919" }), {});
  assert.equal(raw?.label, "contract call");
});

test("milestones are added once the wallet has enough successful transactions", () => {
  const days = (i: number) => `2026-08-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`;
  const txs = Array.from({ length: 50 }, (_, i) => tx({ timestamp: days(i) }));
  const receipt = buildReceipt(txs);
  const labels = receipt.lines.map((line) => line.label);
  assert.ok(labels.includes("Reached 10 transactions"));
  assert.ok(labels.includes("Reached 50 transactions"));
  assert.ok(!labels.includes("Reached 100 transactions"));
  // 28 days in a row also earn a streak bonus: days 2-10 grow by 10, then 100 a day.
  const streak = (20 + 30 + 40 + 50 + 60 + 70 + 80 + 90 + 100) + 18 * 100;
  assert.equal(receipt.lines.find((line) => line.label.startsWith(STREAK_LABEL))?.credits, streak);
  assert.equal(receipt.total, 50 * 10 + 100 + 300 + streak);
});

test("daily cap limits what one day of activity can earn", () => {
  // 30 contract calls in one day = 1,500 credits, capped to 1,000.
  const txs = Array.from({ length: 30 }, () => tx({ toIsContract: true }));
  const receipt = buildReceipt(txs);
  const cap = receipt.lines.find((line) => line.label.startsWith("Daily cap"));
  assert.equal(cap?.credits, -500);
  assert.equal(receipt.total, DAILY_TASK_CAP + 100); // plus the 10-tx milestone
});

test("a one-day burst cannot buy the big milestones", () => {
  const txs = Array.from({ length: 1000 }, () => tx({ toIsContract: true }));
  const labels = buildReceipt(txs).lines.map((line) => line.label);
  assert.ok(labels.includes("Reached 10 transactions")); // 20 count for the day
  assert.ok(!labels.includes("Reached 50 transactions"));
});

test("an empty record gives an empty receipt", () => {
  const receipt = buildReceipt([]);
  assert.deepEqual(receipt.lines, []);
  assert.equal(receipt.total, 0);
});

test("the receipt shows a streak line only for consecutive active days", () => {
  const sameDay = buildReceipt([tx(), tx(), tx()]);
  assert.ok(!sameDay.lines.some((line) => line.label.startsWith(STREAK_LABEL)));

  const threeDays = buildReceipt([
    tx({ timestamp: "2026-09-01T10:00:00Z" }),
    tx({ timestamp: "2026-09-02T23:59:00Z" }),
    tx({ timestamp: "2026-09-03T00:01:00Z" }),
  ]);
  const line = threeDays.lines.find((label) => label.label.startsWith(STREAK_LABEL));
  assert.equal(line?.label, `${STREAK_LABEL} (3 days in a row)`);
  assert.equal(line?.credits, 20 + 30);
  assert.equal(threeDays.total, 3 * 10 + 50);
});

test("failed transactions do not keep a streak alive", () => {
  const receipt = buildReceipt([
    tx({ timestamp: "2026-09-01T10:00:00Z" }),
    tx({ timestamp: "2026-09-02T10:00:00Z", ok: false }),
    tx({ timestamp: "2026-09-03T10:00:00Z" }),
  ]);
  assert.ok(!receipt.lines.some((line) => line.label.startsWith(STREAK_LABEL)));
  assert.equal(receipt.total, 20);
});
