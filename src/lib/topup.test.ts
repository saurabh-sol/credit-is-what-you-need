import assert from "node:assert/strict";
import { test } from "node:test";
import {
  creditsForPayment,
  formatTokenAmount,
  parseTokenAmount,
  paymentIn,
  purchaseIn,
  swapConfig,
  topUpConfig,
  type ReceiptLog,
} from "./topup.ts";

const TOKEN = "0x1111111111111111111111111111111111111111";
const TREASURY = "0x2222222222222222222222222222222222222222";
const ALICE = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
const BOB = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const pad = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
const transfer = (token: string, from: string, to: string, amount: bigint): ReceiptLog => ({
  address: token,
  topics: [TRANSFER, pad(from), pad(to)],
  data: `0x${amount.toString(16).padStart(64, "0")}`,
});
const want = { token: TOKEN, treasury: TREASURY, payer: ALICE };
const ONE = BigInt(10) ** BigInt(18);

test("counts a transfer from the payer to the treasury", () => {
  assert.equal(paymentIn([transfer(TOKEN, ALICE, TREASURY, ONE * BigInt(5))], want), ONE * BigInt(5));
});

test("ignores transfers of another token, from someone else, or to someone else", () => {
  const logs = [
    transfer("0x3333333333333333333333333333333333333333", ALICE, TREASURY, ONE), // worthless look-alike token
    transfer(TOKEN, BOB, TREASURY, ONE), // someone else's payment
    transfer(TOKEN, ALICE, BOB, ONE), // not to the treasury
  ];
  assert.equal(paymentIn(logs, want), BigInt(0));
});

test("ignores events that are not ERC-20 transfers", () => {
  const approval = { ...transfer(TOKEN, ALICE, TREASURY, ONE), topics: ["0x8c5be1e5", pad(ALICE), pad(TREASURY)] };
  const nftTransfer = { ...transfer(TOKEN, ALICE, TREASURY, ONE), topics: [TRANSFER, pad(ALICE), pad(TREASURY), pad(BOB)] };
  assert.equal(paymentIn([approval, nftTransfer], want), BigInt(0));
});

test("adds up several payments and matches addresses in any case", () => {
  const logs = [transfer(TOKEN.toUpperCase().replace("0X", "0x"), ALICE, TREASURY, ONE), transfer(TOKEN, ALICE.toLowerCase(), TREASURY, ONE)];
  assert.equal(paymentIn(logs, want), ONE * BigInt(2));
});

test("credits round down and respect decimals and fractional prices", () => {
  assert.equal(creditsForPayment(ONE * BigInt(3), { decimals: 18, creditsPerToken: 100 }), 300);
  assert.equal(creditsForPayment(ONE / BigInt(1000), { decimals: 18, creditsPerToken: 100 }), 0); // 0.1 credit
  assert.equal(creditsForPayment(BigInt(2_500_000), { decimals: 6, creditsPerToken: 2.5 }), 6); // 6.25 -> 6
  assert.equal(creditsForPayment(BigInt(0), { decimals: 18, creditsPerToken: 100 }), 0);
});

test("parses and formats token amounts", () => {
  assert.equal(parseTokenAmount("12.5", 18), ONE * BigInt(12) + ONE / BigInt(2));
  assert.equal(parseTokenAmount("0", 18), null);
  assert.equal(parseTokenAmount("-1", 18), null);
  assert.equal(parseTokenAmount("1e3", 18), null);
  assert.equal(parseTokenAmount("1.1234567", 6), null); // more precision than the token has
  assert.equal(formatTokenAmount(ONE * BigInt(1234) + ONE / BigInt(2), 18), "1,234.5");
  assert.equal(formatTokenAmount(ONE, 18), "1");
});

test("top-ups are off until fully configured", () => {
  assert.equal(topUpConfig({}), null);
  assert.equal(topUpConfig({ TOPUP_TOKEN_ADDRESS: TOKEN, TOPUP_TREASURY_ADDRESS: TREASURY }), null); // no price
  assert.equal(topUpConfig({ TOPUP_TOKEN_ADDRESS: "nope", TOPUP_TREASURY_ADDRESS: TREASURY, TOPUP_CREDITS_PER_TOKEN: "100" }), null);
  assert.deepEqual(
    topUpConfig({ TOPUP_TOKEN_ADDRESS: TOKEN, TOPUP_TREASURY_ADDRESS: TREASURY, TOPUP_CREDITS_PER_TOKEN: "100", TOPUP_TOKEN_SYMBOL: "KRDT" }),
    { network: "mainnet", token: TOKEN, treasury: TREASURY, symbol: "KRDT", decimals: 18, creditsPerToken: 100, swap: null },
  );
});

const SWAP = "0x4444444444444444444444444444444444444444";
const PURCHASED = "0xb362243af1e2070d7d5bf8d713f2e0fab64203f1b71462afbe20572909788c5e";
const words = (...values: bigint[]) => `0x${values.map((value) => value.toString(16).padStart(64, "0")).join("")}`;
const purchased = (swap: string, buyer: string, token: string, ethIn: bigint, amount: bigint, credits: bigint): ReceiptLog => ({
  address: swap,
  topics: [PURCHASED, pad(buyer), pad(token)],
  data: words(ethIn, amount, credits),
});
const wantSwap = { swap: SWAP, token: TOKEN, buyer: ALICE };

test("reads the purchase the swap contract recorded for the buyer", () => {
  const log = purchased(SWAP, ALICE, TOKEN, ONE * BigInt(2), ONE * BigInt(200_000), BigInt(2_000));
  assert.deepEqual(purchaseIn([transfer(TOKEN, BOB, TREASURY, ONE), log], wantSwap), {
    ethIn: ONE * BigInt(2),
    amount: ONE * BigInt(200_000),
    credits: BigInt(2_000),
  });
});

test("ignores purchases from another contract, buyer or token, and malformed data", () => {
  const logs = [
    purchased("0x5555555555555555555555555555555555555555", ALICE, TOKEN, ONE, ONE, BigInt(1)), // a look-alike contract
    purchased(SWAP, BOB, TOKEN, ONE, ONE, BigInt(1)), // someone else's purchase
    purchased(SWAP, ALICE, "0x3333333333333333333333333333333333333333", ONE, ONE, BigInt(1)), // another token
    { ...purchased(SWAP, ALICE, TOKEN, ONE, ONE, BigInt(1)), data: words(ONE, ONE) }, // short data
    { ...purchased(SWAP, ALICE, TOKEN, ONE, ONE, BigInt(1)), topics: [TRANSFER, pad(ALICE), pad(TOKEN)] }, // another event
  ];
  assert.equal(purchaseIn(logs, wantSwap), null);
  assert.equal(purchaseIn([], wantSwap), null);
});

test("the swap config needs the contract address and a real fee tier", () => {
  const base = {
    TOPUP_TOKEN_ADDRESS: TOKEN,
    TOPUP_TREASURY_ADDRESS: TREASURY,
    TOPUP_CREDITS_PER_TOKEN: "0.01",
    TOPUP_TOKEN_SYMBOL: "KRD",
  };
  assert.equal(topUpConfig(base)?.swap, null);
  assert.equal(swapConfig({ TOPUP_SWAP_ADDRESS: "nope" }), null);
  assert.equal(swapConfig({ TOPUP_SWAP_ADDRESS: SWAP, TOPUP_POOL_FEE: "1234" }), null);
  assert.equal(swapConfig({ TOPUP_SWAP_ADDRESS: SWAP, TOPUP_MAX_CREDITS_PER_BUY: "0" }), null);
  const config = topUpConfig({ ...base, TOPUP_SWAP_ADDRESS: SWAP.toUpperCase().replace("0X", "0x"), TOPUP_POOL_FEE: "500" });
  assert.equal(config?.creditsPerToken, 0.01);
  assert.deepEqual(config?.swap, {
    address: SWAP,
    router: "0xcaf681a66d020601342297493863e78c959e5cb2",
    quoter: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
    weth: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    poolFee: 500,
    maxCreditsPerBuy: 100_000,
  });
  // 200,000 tokens at 100 tokens per credit = 2,000 credits.
  assert.equal(creditsForPayment(ONE * BigInt(200_000), config!), 2_000);
});
