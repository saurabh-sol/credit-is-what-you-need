import assert from "node:assert/strict";
import { test } from "node:test";
import { asTextCompletion, chatBodyFromPrompt, textCompletionStream } from "./legacy-completions.ts";

test("a prompt becomes one user message and text-only fields are dropped", () => {
  assert.deepEqual(chatBodyFromPrompt({ model: "m", prompt: ["a", "b"], max_tokens: 5, suffix: "x", echo: true, stop: ["\n"] }), {
    model: "m",
    max_tokens: 5,
    stop: ["\n"],
    messages: [{ role: "user", content: "a\nb" }],
  });
  assert.equal(typeof chatBodyFromPrompt({ model: "m" }), "string");
});

test("a chat completion is reshaped into a text completion", () => {
  const out = asTextCompletion({
    id: "x",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1 },
  });
  assert.deepEqual(out, {
    id: "x",
    object: "text_completion",
    choices: [{ index: 0, text: "hello", logprobs: null, finish_reason: "stop" }],
    usage: { prompt_tokens: 1 },
  });
});

test("streamed chunks are rewritten line by line and [DONE] is kept", async () => {
  const chunk = JSON.stringify({ object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "hi" }, finish_reason: null }] });
  const input = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(`data: ${chunk.slice(0, 10)}`);
      controller.enqueue(`${chunk.slice(10)}\n\n: keep-alive\n\ndata: [DONE]\n\n`);
      controller.close();
    },
  });
  let text = "";
  const reader = input.pipeThrough(textCompletionStream()).getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read()) text += next.value;
  const lines = text.split("\n").filter(Boolean);
  assert.deepEqual(JSON.parse(lines[0].slice(6)).choices, [{ index: 0, text: "hi", logprobs: null, finish_reason: null }]);
  assert.equal(lines[1], ": keep-alive");
  assert.equal(lines[2], "data: [DONE]");
});
