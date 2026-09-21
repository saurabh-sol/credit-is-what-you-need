import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_PATH = ":memory:";
const { closeAllSessions, closeSession, openSession, sessionIsLive, spendNonce } = await import("./session-store.ts");

const ALICE = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
const BOB = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb";

test("a session is live for its own wallet until it is closed", () => {
  const id = openSession(ALICE, 60);
  assert.equal(sessionIsLive(id, ALICE.toLowerCase()), true);
  assert.equal(sessionIsLive(id, BOB), false);
  closeSession(id);
  assert.equal(sessionIsLive(id, ALICE), false);
});

test("an expired session is dead", () => {
  assert.equal(sessionIsLive(openSession(ALICE, -1), ALICE), false);
});

test("signing out everywhere ends every session of that wallet only", () => {
  const laptop = openSession(ALICE, 60);
  const phone = openSession(ALICE, 60);
  const bob = openSession(BOB, 60);
  assert.equal(closeAllSessions(ALICE), 2);
  assert.equal(sessionIsLive(laptop, ALICE) || sessionIsLive(phone, ALICE), false);
  assert.equal(sessionIsLive(bob, BOB), true);
});

test("a nonce can be spent once", () => {
  assert.equal(spendNonce("abc123", 300), true);
  assert.equal(spendNonce("abc123", 300), false);
  assert.equal(spendNonce("other", 300), true);
});
