import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_PATH = ":memory:";
const { getBalance, recordTopUp, recordUsage, TopUpUsedError } = await import("./ledger.ts");
const { cleanName, distribution, getName, setName } = await import("./distribution.ts");
const { db } = await import("./db.ts");

const ALICE = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
const BOB = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb";
const TOKEN = "0x1111111111111111111111111111111111111111";
const ONE = BigInt(10) ** BigInt(18);

const grant = (address: string, amount: number, kind: string) =>
  db().prepare("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, ?, 'test')").run(address.toLowerCase(), amount, kind);

const payment = (hash: string, amount: bigint, credits: number) => ({
  network: "testnet" as const,
  hash,
  address: ALICE,
  token: TOKEN,
  symbol: "FUEL",
  decimals: 18,
  amount,
  credits,
});

test("a token payment becomes credits exactly once", () => {
  assert.equal(recordTopUp(payment("0xABC", ONE * BigInt(5), 500)), 500);
  assert.throws(() => recordTopUp(payment("0xabc", ONE * BigInt(5), 500)), TopUpUsedError); // same hash, other case
  assert.equal(getBalance(ALICE), 500);
});

test("distribution ranks wallets by what they earned, not what they kept", () => {
  grant(ALICE, 600, "claim");
  grant(ALICE, 84, "gasback");
  grant(BOB, 2000, "royalty");
  recordUsage({ keyId: "k", address: BOB, model: "fuel/echo", inputTokens: 1, outputTokens: 1, credits: 1900 });
  recordTopUp(payment("0xdef", ONE * BigInt(2) + ONE / BigInt(2), 250));

  const { totals, wallets, active } = distribution();
  assert.deepEqual(wallets.map((wallet) => wallet.address), [BOB.toLowerCase(), ALICE.toLowerCase()]);
  assert.equal(wallets[0].earned, 2000); // spending does not shrink it
  assert.equal(wallets[1].earned, 500 + 600 + 84 + 250);
  assert.deepEqual(wallets[1].bySource, { claim: 600, milestone: 0, gasback: 84, royalty: 0, topup: 750 });
  assert.deepEqual(wallets[1].tokensPaid, [{ symbol: "FUEL", decimals: 18, amount: (ONE * BigInt(7) + ONE / BigInt(2)).toString() }]);
  assert.deepEqual(totals, {
    wallets: 2,
    credits: 3434,
    tokensPaid: [{ symbol: "FUEL", decimals: 18, amount: (ONE * BigInt(7) + ONE / BigInt(2)).toString() }],
  });
  // The ticker has one line per wallet, whoever used the most credits first.
  assert.deepEqual(
    active.map(({ address, claimed, used }) => ({ address, claimed, used })),
    [
      { address: BOB.toLowerCase(), claimed: 2000, used: 1900 },
      { address: ALICE.toLowerCase(), claimed: 684, used: 0 }, // bought credits are not claims
    ],
  );
  // Everything handed to the page must be a plain object, or React refuses to render it.
  for (const item of [totals, ...wallets, ...active]) assert.equal(Object.getPrototypeOf(item), Object.prototype);
});

test("names are optional, validated, and searchable", () => {
  assert.equal(cleanName("  Mira   Okafor "), "Mira Okafor");
  assert.equal(cleanName("x"), null); // too short
  assert.equal(cleanName("<script>"), null);
  assert.equal(cleanName("a".repeat(25)), null);

  setName(ALICE, "Mira Okafor");
  assert.equal(getName(ALICE.toLowerCase()), "Mira Okafor");
  assert.deepEqual(distribution({ search: "mira" }).wallets.map((wallet) => wallet.name), ["Mira Okafor"]);
  assert.equal(distribution({ search: "0xbbbb" }).wallets.length, 1);
  assert.equal(distribution({ search: "nobody" }).wallets.length, 0);

  setName(ALICE, null);
  assert.equal(getName(ALICE), null);
});
