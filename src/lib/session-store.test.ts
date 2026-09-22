import assert from "node:assert/strict";
import { test } from "node:test";

await (await import("./test-db.ts")).useTestDatabase();
const { closeAllSessions, closeSession, openSession, sessionIsLive, spendNonce } = await import("./session-store.ts");

const ALICE = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
const BOB = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb";

test("a session is live for its own wallet until it is closed", async () => {
  const id = await openSession(ALICE, 60);
  assert.equal(await sessionIsLive(id, ALICE.toLowerCase()), true);
  assert.equal(await sessionIsLive(id, BOB), false);
  await closeSession(id);
  assert.equal(await sessionIsLive(id, ALICE), false);
});

test("an expired session is dead", async () => {
  assert.equal(await sessionIsLive(await openSession(ALICE, -1), ALICE), false);
});

test("signing out everywhere ends every session of that wallet only", async () => {
  const laptop = await openSession(ALICE, 60);
  const phone = await openSession(ALICE, 60);
  const bob = await openSession(BOB, 60);
  assert.equal(await closeAllSessions(ALICE), 2);
  assert.equal((await sessionIsLive(laptop, ALICE)) || (await sessionIsLive(phone, ALICE)), false);
  assert.equal(await sessionIsLive(bob, BOB), true);
});

test("a nonce can be spent once", async () => {
  assert.equal(await spendNonce("abc123", 300), true);
  assert.equal(await spendNonce("abc123", 300), false);
  assert.equal(await spendNonce("other", 300), true);
});
