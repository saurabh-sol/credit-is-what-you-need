import assert from "node:assert/strict";
import { test } from "node:test";
import {
  costOfCredits,
  creditsForPayment,
  formatTokenAmount,
  formatUsd,
  parseCredits,
  purchaseIn,
  topUpConfig,
  USDG_MAINNET,
  type ReceiptLog,
} from "./topup.ts";

const CHECKOUT = "0x4444444444444444444444444444444444444444";
const TREASURY = "0x2222222222222222222222222222222222222222";
const ALICE = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
const BOB = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb";
const USDG = USDG_MAINNET.address;
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const PURCHASED = "0xb362243af1e2070d7d5bf8d713f2e0fab64203f1b71462afbe20572909788c5e";

const pad = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
const words = (...values: bigint[]) => `0x${values.map((value) => value.toString(16).padStart(64, "0")).join("")}`;
const purchased = (checkout: string, buyer: string, token: string, ethIn: bigint, amount: bigint, credits: bigint): ReceiptLog => ({
  address: checkout,
  topics: [PURCHASED, pad(buyer), pad(token)],
  data: words(ethIn, amount, credits),
});
const transfer = (token: string, from: string, to: string, amount: bigint): ReceiptLog => ({
  address: token,
  topics: [TRANSFER, pad(from), pad(to)],
  data: words(amount),
});
const want = { checkout: CHECKOUT, token: USDG, buyer: ALICE };
const price = { usdgPerCredit: 800 };

test("1,000 credits cost $0.80 and $0.80 buys 1,000 credits", () => {
  assert.equal(costOfCredits(1_000, price), BigInt(800_000));
  assert.equal(creditsForPayment(BigInt(800_000), price), 1_000);
  assert.equal(formatUsd(BigInt(800_000)), "$0.80");
  assert.equal(formatUsd(BigInt(16_000_000)), "$16.00");
  assert.equal(formatUsd(BigInt(800)), "$0.0008");
});

test("credits round down and never exceed what was paid", () => {
  assert.equal(creditsForPayment(BigInt(799), price), 0);
  assert.equal(creditsForPayment(BigInt(1_599), price), 1);
  assert.equal(creditsForPayment(BigInt(1_000_000), price), 1_250);
  assert.equal(creditsForPayment(BigInt(0), price), 0);
  assert.equal(creditsForPayment(BigInt(1_000_000), { usdgPerCredit: 1_000 }), 1_000);
});

test("parses credit amounts and formats USDG", () => {
  assert.equal(parseCredits("1000"), 1_000);
  assert.equal(parseCredits(" 20,000 "), 20_000);
  assert.equal(parseCredits("0"), null);
  assert.equal(parseCredits("12.5"), null);
  assert.equal(parseCredits("-1"), null);
  assert.equal(parseCredits("1e3"), null);
  assert.equal(formatTokenAmount(BigInt(800_000), 6), "0.8");
  assert.equal(formatTokenAmount(BigInt(1_234_500_000), 6), "1,234.5");
});

test("reads the purchase the checkout recorded for the buyer, paid in USDG or ETH", () => {
  const usdgBuy = purchased(CHECKOUT, ALICE, USDG, BigInt(0), BigInt(800_000), BigInt(1_000));
  assert.deepEqual(purchaseIn([transfer(USDG, ALICE, TREASURY, BigInt(800_000)), usdgBuy], want), {
    ethIn: BigInt(0),
    amount: BigInt(800_000),
    credits: BigInt(1_000),
  });
  const ethBuy = purchased(CHECKOUT.toUpperCase().replace("0X", "0x"), ALICE.toLowerCase(), USDG, BigInt(3e14), BigInt(808_000), BigInt(1_010));
  assert.deepEqual(purchaseIn([ethBuy], want), { ethIn: BigInt(3e14), amount: BigInt(808_000), credits: BigInt(1_010) });
});

test("ignores purchases from another contract, buyer or token, and malformed data", () => {
  const logs = [
    purchased("0x5555555555555555555555555555555555555555", ALICE, USDG, BigInt(0), BigInt(800_000), BigInt(1_000)), // a look-alike contract
    purchased(CHECKOUT, BOB, USDG, BigInt(0), BigInt(800_000), BigInt(1_000)), // someone else's purchase
    purchased(CHECKOUT, ALICE, "0x3333333333333333333333333333333333333333", BigInt(0), BigInt(800_000), BigInt(1_000)), // another token
    { ...purchased(CHECKOUT, ALICE, USDG, BigInt(0), BigInt(800_000), BigInt(1_000)), data: words(BigInt(0), BigInt(800_000)) }, // short data
    transfer(USDG, ALICE, TREASURY, BigInt(800_000)), // a bare transfer is not a purchase
  ];
  assert.equal(purchaseIn(logs, want), null);
  assert.equal(purchaseIn([], want), null);
});

test("top-ups are off until the checkout and treasury are set", () => {
  assert.equal(topUpConfig({}), null);
  assert.equal(topUpConfig({ TOPUP_CHECKOUT_ADDRESS: CHECKOUT }), null);
  assert.equal(topUpConfig({ TOPUP_CHECKOUT_ADDRESS: "nope", TOPUP_TREASURY_ADDRESS: TREASURY }), null);
  assert.equal(topUpConfig({ TOPUP_CHECKOUT_ADDRESS: CHECKOUT, TOPUP_TREASURY_ADDRESS: TREASURY, TOPUP_USDG_PER_CREDIT: "0" }), null);
  assert.equal(topUpConfig({ TOPUP_CHECKOUT_ADDRESS: CHECKOUT, TOPUP_TREASURY_ADDRESS: TREASURY, TOPUP_USDG_PER_CREDIT: "8.5" }), null);
  assert.equal(topUpConfig({ TOPUP_CHECKOUT_ADDRESS: CHECKOUT, TOPUP_TREASURY_ADDRESS: TREASURY, TOPUP_POOL_FEE: "1234" }), null);
  assert.equal(topUpConfig({ TOPUP_CHECKOUT_ADDRESS: CHECKOUT, TOPUP_TREASURY_ADDRESS: TREASURY, TOPUP_MAX_CREDITS_PER_BUY: "0" }), null);
});

test("the config defaults to USDG at $0.0008 through the 0.01% pool", () => {
  const config = topUpConfig({ TOPUP_CHECKOUT_ADDRESS: CHECKOUT.toUpperCase().replace("0X", "0x"), TOPUP_TREASURY_ADDRESS: TREASURY });
  assert.deepEqual(config, {
    network: "mainnet",
    checkout: CHECKOUT,
    token: USDG,
    treasury: TREASURY,
    symbol: "USDG",
    decimals: 6,
    usdgPerCredit: 800,
    router: "0xcaf681a66d020601342297493863e78c959e5cb2",
    quoter: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
    weth: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    poolFee: 100,
    maxCreditsPerBuy: 100_000,
  });
  assert.equal(creditsForPayment(BigInt(800_000), config!), 1_000);
  const custom = topUpConfig({
    TOPUP_CHECKOUT_ADDRESS: CHECKOUT,
    TOPUP_TREASURY_ADDRESS: TREASURY,
    TOPUP_USDG_PER_CREDIT: "1000",
    TOPUP_POOL_FEE: "500",
    TOPUP_MAX_CREDITS_PER_BUY: "5000",
    TOPUP_USDG_ADDRESS: BOB,
  });
  assert.equal(custom?.usdgPerCredit, 1_000);
  assert.equal(custom?.poolFee, 500);
  assert.equal(custom?.maxCreditsPerBuy, 5_000);
  assert.equal(custom?.token, BOB.toLowerCase());
});
