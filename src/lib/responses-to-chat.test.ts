import assert from "node:assert/strict";
import { test } from "node:test";
import { chatBodyFromResponses, isResponsesShaped } from "./responses-to-chat.ts";

test("only a body with `input` and no `messages` is Responses-shaped", () => {
  assert.equal(isResponsesShaped({ input: "hi" }), true);
  assert.equal(isResponsesShaped({ messages: [] }), false);
  assert.equal(isResponsesShaped({ input: "hi", messages: [] }), false);
});

test("Cursor's agent request becomes a chat completion request", () => {
  const body = chatBodyFromResponses({
    model: "openai/gpt-5",
    instructions: "You are terse.",
    input: [
      { role: "user", content: [{ type: "input_text", text: "Weather in Paris?" }] },
      { type: "reasoning", id: "rs_1", summary: [] },
      { type: "function_call", call_id: "call_1", name: "get_weather", arguments: '{"city":"Paris"}' },
      { type: "function_call_output", call_id: "call_1", output: "sunny" },
    ],
    tools: [{ type: "function", name: "get_weather", description: "Weather", parameters: { type: "object" }, strict: true }],
    tool_choice: "auto",
    stream: true,
    stream_options: { include_usage: true },
    include: ["reasoning.encrypted_content"],
    reasoning: { effort: "low", summary: "auto" },
    text: { verbosity: "low" },
    max_output_tokens: 500,
    store: false,
  });
  assert.deepEqual(body, {
    model: "openai/gpt-5",
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      { role: "system", content: "You are terse." },
      { role: "user", content: "Weather in Paris?" },
      { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"Paris"}' } }] },
      { role: "tool", tool_call_id: "call_1", content: "sunny" },
    ],
    tools: [{ type: "function", function: { name: "get_weather", description: "Weather", parameters: { type: "object" }, strict: true } }],
    tool_choice: "auto",
    max_completion_tokens: 500,
    reasoning_effort: "low",
  });
});

test("a string input is one user message and images keep their parts", () => {
  assert.deepEqual(chatBodyFromResponses({ model: "m", input: "hi" }).messages, [{ role: "user", content: "hi" }]);
  const withImage = chatBodyFromResponses({
    model: "m",
    input: [{ role: "user", content: [{ type: "input_text", text: "What is this?" }, { type: "input_image", image_url: "https://x/y.png", detail: "low" }] }],
  });
  assert.deepEqual(withImage.messages, [
    { role: "user", content: [{ type: "text", text: "What is this?" }, { type: "image_url", image_url: { url: "https://x/y.png", detail: "low" } }] },
  ]);
});

test("a forced tool and a JSON schema format are translated too", () => {
  const body = chatBodyFromResponses({
    model: "m",
    input: "hi",
    tools: [{ type: "web_search" }, { type: "function", name: "f", parameters: {} }],
    tool_choice: { type: "function", name: "f" },
    text: { format: { type: "json_schema", name: "answer", schema: { type: "object" }, strict: true } },
  });
  assert.deepEqual(body.tools, [{ type: "function", function: { name: "f", parameters: {} } }]);
  assert.deepEqual(body.tool_choice, { type: "function", function: { name: "f" } });
  assert.deepEqual(body.response_format, { type: "json_schema", json_schema: { name: "answer", schema: { type: "object" }, strict: true } });
});
