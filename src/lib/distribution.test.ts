import assert from "node:assert/strict";
import { test } from "node:test";

await (await import("./test-db.ts")).useTestDatabase();
const { getBalance, recordTopUp, recordUsage, TopUpUsedError } = await import("./ledger.ts");
const { cleanName, distribution, getName, setName } = await import("./distribution.ts");
const { run } = await import("./db.ts");

const ALICE = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
const BOB = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb";
const TOKEN = "0x1111111111111111111111111111111111111111";
const ONE = BigInt(10) ** BigInt(18);

const grant = (address: string, amount: number, kind: string) =>
  run("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, ?, 'test')", [address.toLowerCase(), amount, kind]);

const payment = (hash: string, amount: bigint, credits: number) => ({
  network: "mainnet" as const,
  hash,
  address: ALICE,
  token: TOKEN,
  symbol: "KRDT",
  decimals: 18,
  amount,
  credits,
});

test("a token payment becomes credits exactly once", async () => {
  assert.equal(await recordTopUp(payment("0xABC", ONE * BigInt(5), 500)), 500);
  await assert.rejects(() => recordTopUp(payment("0xabc", ONE * BigInt(5), 500)), TopUpUsedError); // same hash, other case
  assert.equal(await getBalance(ALICE), 500);
});

test("distribution ranks wallets by what they earned, not what they kept", async () => {
  await grant(ALICE, 600, "claim");
  await grant(ALICE, 84, "streak");
  await grant(BOB, 2000, "referral");
  await recordUsage({ keyId: "k", address: BOB, model: "kredit/echo", inputTokens: 1, outputTokens: 1, credits: 1500 });
  await recordUsage({ keyId: "k", address: BOB, model: "openai/gpt-4o-mini", inputTokens: 1, outputTokens: 1, credits: 300 });
  await recordUsage({ keyId: "k", address: BOB, model: "openai/gpt-4o-mini", inputTokens: 1, outputTokens: 1, credits: 100 });
  await recordTopUp(payment("0xdef", ONE * BigInt(2) + ONE / BigInt(2), 250));

  const { totals, wallets, active } = await distribution();
  assert.deepEqual(wallets.map((wallet) => wallet.address), [BOB.toLowerCase(), ALICE.toLowerCase()]);
  assert.equal(wallets[0].earned, 2000); // spending does not shrink it
  // Spending shows as one total and the models it went to, the biggest spend first.
  assert.equal(wallets[0].used, 1900);
  assert.deepEqual(wallets[0].models, [
    { model: "kredit/echo", credits: 1500, calls: 1 },
    { model: "openai/gpt-4o-mini", credits: 400, calls: 2 },
  ]);
  assert.equal(wallets[1].used, 0);
  assert.deepEqual(wallets[1].models, []);
  assert.equal(wallets[1].earned, 500 + 600 + 84 + 250);
  assert.deepEqual(wallets[1].bySource, { claim: 600, milestone: 0, streak: 84, referral: 0, topup: 750 });
  assert.deepEqual(wallets[1].tokensPaid, [{ symbol: "KRDT", decimals: 18, amount: (ONE * BigInt(7) + ONE / BigInt(2)).toString() }]);
  assert.deepEqual(totals, {
    wallets: 2,
    credits: 3434,
    tokensPaid: [{ symbol: "KRDT", decimals: 18, amount: (ONE * BigInt(7) + ONE / BigInt(2)).toString() }],
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
  // Timestamps come back as ISO strings, as the pages expect.
  assert.match(wallets[0].lastEarnedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});

test("names are optional, validated, and searchable", async () => {
  assert.equal(cleanName("  Mira   Okafor "), "Mira Okafor");
  assert.equal(cleanName("x"), null); // too short
  assert.equal(cleanName("<script>"), null);
  assert.equal(cleanName("a".repeat(25)), null);

  await setName(ALICE, "Mira Okafor");
  assert.equal(await getName(ALICE.toLowerCase()), "Mira Okafor");
  assert.deepEqual((await distribution({ search: "mira" })).wallets.map((wallet) => wallet.name), ["Mira Okafor"]);
  assert.equal((await distribution({ search: "0xbbbb" })).wallets.length, 1);
  assert.equal((await distribution({ search: "nobody" })).wallets.length, 0);

  await setName(ALICE, null);
  assert.equal(await getName(ALICE), null);
});
