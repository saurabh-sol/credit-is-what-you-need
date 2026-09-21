import assert from "node:assert/strict";
import { test } from "node:test";
import { planRoyalties, type ContractCall } from "./royalties.ts";

const BUILDER = "0xB0B0b0b0b0b0B0B0b0b0B0b0B0B0b0B0b0B0B0b0";
const PRICE = BigInt(250_000); // $2,500
const ETH_0_001 = "1000000000000000"; // $2.50 of gas -> 20% = $0.50 = 500 credits

let n = 0;
const call = (from: string, over: Partial<ContractCall> = {}): ContractCall => ({
  hash: `0x${(++n).toString(16).padStart(64, "0")}`,
  from,
  ok: true,
  feeWei: ETH_0_001,
  ...over,
});

test("the builder earns 20% of the gas other people spend", () => {
  const plan = planRoyalties(BUILDER, [{ contract: "0xc1", calls: [call("0xaaa"), call("0xbbb"), call("0xaaa")] }], new Set(), 0, PRICE);
  assert.equal(plan.credits, 1500);
  assert.deepEqual(plan.contracts, [{ contract: "0xc1", newCalls: 3, newUsers: 2 }]);
});

test("your own calls, failed calls and already-paid calls earn nothing", () => {
  const paid = call("0xaaa");
  const calls = [call(BUILDER.toUpperCase().replace("0X", "0x")), call("0xaaa", { ok: false }), paid];
  const plan = planRoyalties(BUILDER, [{ contract: "0xc1", calls }], new Set([paid.hash]), 0, PRICE);
  assert.equal(plan.credits, 0);
  assert.equal(plan.payable.length, 0);
});

test("fractions carry over, and the carry is untouched when there is nothing new", () => {
  const tiny = "600000000000"; // 0.3 credits of royalty
  const first = planRoyalties(BUILDER, [{ contract: "0xc1", calls: [call("0xaaa", { feeWei: tiny })] }], new Set(), 900_000, PRICE);
  assert.deepEqual([first.credits, first.carryMicro], [1, 200_000]); // 0.9 + 0.3 = 1.2
  const idle = planRoyalties(BUILDER, [{ contract: "0xc1", calls: [] }], new Set(), 900_000, PRICE);
  assert.deepEqual([idle.credits, idle.carryMicro], [0, 900_000]);
});

test("several contracts are added together", () => {
  const plan = planRoyalties(
    BUILDER,
    [{ contract: "0xc1", calls: [call("0xaaa")] }, { contract: "0xc2", calls: [call("0xbbb"), call("0xccc")] }],
    new Set(), 0, PRICE,
  );
  assert.equal(plan.credits, 1500);
  assert.equal(plan.contracts.length, 2);
});
