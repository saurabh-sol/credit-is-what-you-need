import assert from "node:assert/strict";
import { test } from "node:test";

await (await import("./test-db.ts")).useTestDatabase();
const {
  appendMessage,
  clearWorkspace,
  createConversation,
  deleteConversation,
  deleteCreation,
  getConversation,
  listConversations,
  listCreations,
  listMessages,
  MAX_MESSAGE_CHARS,
  priceMessage,
  saveCreation,
  titleFrom,
  updateConversation,
} = await import("./workspace.ts");

const ALICE = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
const BOB = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb";

test("a conversation is named after its first message and keeps its messages in order", async () => {
  const chat = await createConversation(ALICE, { model: "kredit/echo", title: "  What is   gas?  ", system: "Be terse." });
  assert.equal(chat.title, "What is gas?");
  assert.equal(chat.system, "Be terse.");
  assert.equal(chat.messages, 0);

  const first = await appendMessage(ALICE, chat.id, { role: "user", content: "What is gas?", attachments: ["notes.txt"] });
  const reply = await appendMessage(ALICE, chat.id, { role: "assistant", content: "Gas pays for computation.", model: "kredit/echo", ms: 812 });
  assert.ok(first && reply && reply.id > first.id);

  const messages = await listMessages(ALICE, chat.id);
  assert.deepEqual(
    messages.map((message) => [message.role, message.content, message.attachments]),
    [
      ["user", "What is gas?", ["notes.txt"]],
      ["assistant", "Gas pays for computation.", []],
    ],
  );
  assert.equal(messages[1].credits, null);
  await priceMessage(ALICE, reply!.id, 3);
  assert.equal((await listMessages(ALICE, chat.id))[1].credits, 3);
  assert.equal((await getConversation(ALICE, chat.id))?.messages, 2);
});

test("a wallet sees only its own conversations, and a long message is cut to the limit", async () => {
  const mine = await createConversation(BOB, { model: "openai/gpt-4o", title: "Bob's" });
  assert.equal(await getConversation(ALICE, mine.id), null);
  assert.equal(await appendMessage(ALICE, mine.id, { role: "user", content: "not yours" }), null);
  assert.deepEqual((await listConversations(BOB)).map((chat) => chat.title), ["Bob's"]);

  await appendMessage(BOB, mine.id, { role: "user", content: "x".repeat(MAX_MESSAGE_CHARS + 10) });
  assert.equal((await listMessages(BOB, mine.id))[0].content.length, MAX_MESSAGE_CHARS);
});

test("renaming, switching model and deleting", async () => {
  const chat = await createConversation(ALICE, { model: "kredit/echo", title: "Old name" });
  const renamed = await updateConversation(ALICE, chat.id, { title: "New name", model: "anthropic/claude-sonnet-4.5", system: null });
  assert.equal(renamed?.title, "New name");
  assert.equal(renamed?.model, "anthropic/claude-sonnet-4.5");
  assert.equal(await updateConversation(BOB, chat.id, { title: "Hijack" }), null);

  await appendMessage(ALICE, chat.id, { role: "user", content: "hi" });
  assert.ok(await deleteConversation(ALICE, chat.id));
  assert.equal(await getConversation(ALICE, chat.id), null);
  assert.deepEqual(await listMessages(ALICE, chat.id), []); // gone with it
  assert.equal(await deleteConversation(ALICE, chat.id), false);
});

test("the newest conversation comes first", async () => {
  const older = await createConversation(BOB, { model: "kredit/echo", title: "older" });
  const newer = await createConversation(BOB, { model: "kredit/echo", title: "newer" });
  const titles = (await listConversations(BOB)).map((chat) => chat.title);
  assert.ok(titles.indexOf("newer") < titles.indexOf("older"));
  await appendMessage(BOB, older.id, { role: "user", content: "bump" });
  const again = (await listConversations(BOB)).map((chat) => chat.title);
  assert.ok(again.indexOf("older") < again.indexOf("newer"));
  void newer;
});

test("the library keeps pictures with their prompt and cost, per wallet", async () => {
  const id = await saveCreation(ALICE, { kind: "image", prompt: "a cat", model: "openai/gpt-image-2", credits: 48, files: [{ base64: "AAAA", mediaType: "image/png" }] });
  const mine = await listCreations(ALICE);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, id);
  assert.deepEqual(mine[0].files, [{ base64: "AAAA", mediaType: "image/png" }]);
  assert.deepEqual((await listCreations(ALICE, { withFiles: false }))[0].files, []);
  assert.deepEqual(await listCreations(BOB), []);
  assert.equal(await deleteCreation(BOB, id), false);
  assert.ok(await deleteCreation(ALICE, id));
  assert.deepEqual(await listCreations(ALICE), []);
});

test("clearing the workspace removes everything the wallet kept", async () => {
  const chat = await createConversation(ALICE, { model: "kredit/echo", title: "to clear" });
  await appendMessage(ALICE, chat.id, { role: "user", content: "bye" });
  await saveCreation(ALICE, { kind: "video", prompt: "waves", model: "google/veo", files: [{ base64: "BBBB", mediaType: "video/mp4" }] });
  await clearWorkspace(ALICE);
  assert.deepEqual(await listConversations(ALICE), []);
  assert.deepEqual(await listCreations(ALICE), []);
});

test("titles are trimmed and capped", () => {
  assert.equal(titleFrom(""), "New chat");
  assert.equal(titleFrom("a".repeat(200)).length, 80);
});
