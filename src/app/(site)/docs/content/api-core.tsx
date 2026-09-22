import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { ECHO_MODEL } from "@/lib/gateway";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { snippets } from "@/lib/snippets";
import { BaseUrl, OriginCode, OriginTabs } from "../quickstart";
import { Callout, Doc, Endpoint, H2, Param, Params, Table } from "../ui";

// The API reference, core pages. Every message, code and number here is the
// one the gateway itself uses (src/lib/gateway.ts, proxy.ts, dialects.ts).

const RATE_LIMIT = 60;

export function Authentication() {
  return (
    <Doc
      slug="api/authentication"
      lede="Every request to /v1 carries an API key that belongs to a wallet. The key spends that wallet's credits and nothing else."
    >
      <H2>Keys</H2>
      <p>
        Keys are created on the dashboard, under <Link href="/dashboard/keys">Keys</Link>, or from the{" "}
        <Link href="/docs">docs home</Link> once you are signed in. A key starts with <code>kredit_sk_</code> and is 42
        characters long. It is shown exactly once, when it is created: Kredit stores only a SHA-256 hash of it, so
        nobody, including us, can read it back later.
      </p>
      <ul>
        <li>
          A wallet can hold up to <strong>{MAX_ACTIVE_KEYS} active keys</strong>. One per tool is a good habit, so a
          leak in one place never takes the others down.
        </li>
        <li>Revoking a key takes effect on the very next request.</li>
        <li>A key sees only what it needs to spend: its wallet&apos;s balance, holds and usage. Never the wallet&apos;s other keys or where its credits came from.</li>
      </ul>

      <H2>Sending the key</H2>
      <p>
        Send it as a bearer token. Every <code>/v1</code> endpoint also accepts it in <code>x-api-key</code>, which is
        what Anthropic SDKs send, so both of these work everywhere:
      </p>
      <CodeBlock title="Headers" code={`Authorization: Bearer kredit_sk_…\n\n# or, as Anthropic clients do\nx-api-key: kredit_sk_…`} />
      <BaseUrl />

      <H2>Managing keys from your own code</H2>
      <p>
        Keys are managed with the wallet session, not with another key. These two routes are what the dashboard
        calls; they need the signed-in session cookie.
      </p>
      <Endpoint method="POST" path="/api/keys" note="session cookie" />
      <Params>
        <Param name="name" type="string">
          A label for the key, trimmed to 40 characters. Defaults to <code>My key</code> when empty.
        </Param>
      </Params>
      <p>
        Answers <code>201</code> with <code>{`{ "id", "key", "prefix", "name" }`}</code>. The <code>key</code> field is
        the only time the full key is returned. A sixth key answers <code>409</code> with{" "}
        <code>You can have at most {MAX_ACTIVE_KEYS} active keys. Revoke one first.</code>
      </p>
      <Endpoint method="DELETE" path="/api/keys/{id}" note="session cookie" />
      <p>
        Answers <code>{`{ "ok": true }`}</code>, or <code>404</code> when the id is unknown, belongs to another wallet or
        is already revoked. The list of active keys comes back with <code>GET /api/account</code>.
      </p>

      <H2>Wrong or missing key</H2>
      <CodeBlock
        title="401"
        code={`{
  "error": {
    "message": "Invalid or revoked API key. Create one on your Kredit dashboard.",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}`}
      />
      <Callout kind="warn" title="Keep keys on a server">
        <p>
          A key can spend every credit in its wallet. Never ship one in code that runs in someone else&apos;s browser
          or in a public repository. If one leaks, revoke it on the dashboard; the others keep working.
        </p>
      </Callout>
    </Doc>
  );
}

export function ChatCompletions() {
  return (
    <Doc
      slug="api/chat-completions"
      lede="The OpenAI Chat Completions shape. Same request, same response, same streaming events, so existing clients work unchanged."
    >
      <Endpoint method="POST" path="/v1/chat/completions" />
      <p>
        The body is passed to the model provider as is. Kredit reads <code>model</code>, <code>messages</code>,{" "}
        <code>stream</code> and the max-tokens field, checks your balance, and forwards the rest untouched: tools,
        images, response formats, temperature, whatever your client sends.
      </p>
      <OriginTabs
        tabs={[
          { name: "curl", code: snippets.curl({ origin: "{origin}" }) },
          { name: "Python", code: snippets.Python({ origin: "{origin}" }) },
          { name: "Node", code: snippets.Node({ origin: "{origin}" }) },
        ]}
      />

      <H2>Request</H2>
      <Params>
        <Param name="model" type="string" required>
          A model id from <code>GET /v1/models</code>, such as <code>openai/gpt-4o</code>, or the built-in{" "}
          <code>{ECHO_MODEL}</code>.
        </Param>
        <Param name="messages" type="array" required>
          A non-empty array of OpenAI-style messages. Text content is counted by length; each image or file part
          counts as a flat 1,000 input tokens for the balance check, so one photo never looks like a book.
        </Param>
        <Param name="stream" type="boolean">
          <code>true</code> for server-sent events. See <Link href="/docs/api/streaming">Streaming</Link>.
        </Param>
        <Param name="max_tokens · max_completion_tokens" type="integer">
          The most output you want. When <code>max_completion_tokens</code> is present it wins. If your balance
          cannot cover it, Kredit lowers it to what you can afford before the call goes out. See{" "}
          <Link href="/docs/api/billing#a-thin-balance">Pricing and billing</Link>.
        </Param>
        <Param name="anything else" type="passed through">
          Forwarded to the provider unchanged, except for provider-routing fields (<code>provider</code>,{" "}
          <code>providerOptions</code>, <code>provider_options</code>, <code>models</code>, <code>route</code>,{" "}
          <code>byok</code>), which are removed because they could change what you are billed for.
        </Param>
      </Params>

      <H2>Response</H2>
      <p>
        The provider&apos;s JSON, verbatim, plus two headers: <code>x-kredit-credits-charged</code> and{" "}
        <code>x-kredit-balance</code>. Failed calls carry neither, because nothing was charged.
      </p>
      <OriginCode
        title="200"
        code={`HTTP/1.1 200 OK
content-type: application/json
x-kredit-credits-charged: 11
x-kredit-balance: 4989
x-request-id: 7f1c…

{ "id": "chatcmpl-…", "object": "chat.completion", "model": "openai/gpt-4o",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "…" }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 300, "completion_tokens": 500, "total_tokens": 800 } }`}
      />

      <H2>The echo model</H2>
      <p>
        <code>{ECHO_MODEL}</code> answers on every Kredit server, even one with no AI provider connected. It replies
        with <code>Kredit echo: </code> followed by your last user message, and it is billed by length at $3 in and
        $15 out per million tokens, like a mid-priced model. It is the fastest way to prove a key works end to end and
        to watch the billing headers move.
      </p>
      <CodeBlock
        title="Echo reply"
        code={`{ "id": "kredit-echo-1758560000000", "object": "chat.completion", "model": "${ECHO_MODEL}",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "Kredit echo: hi" }, "finish_reason": "stop" }] }`}
      />

      <H2>Before the call goes out</H2>
      <p>The gateway checks, in this order, and stops at the first that fails:</p>
      <ol>
        <li>The key is valid and under {RATE_LIMIT} requests this minute.</li>
        <li>The balance is above zero. At zero or below the answer is <code>402 insufficient_credits</code>.</li>
        <li>The body is JSON with <code>model</code> and a non-empty <code>messages</code> array.</li>
        <li>The model is a chat model with a known price. Unknown ids are <code>404 model_not_found</code>.</li>
        <li>
          The balance covers the prompt plus at least 16 output tokens. If it does not, the call is refused with the
          number of credits it would need.
        </li>
      </ol>
      <p>
        Only then is the request sent. If the provider cannot be reached, you get{" "}
        <code>502 provider_unreachable</code> and nothing is charged. If the provider answers with an error of its own,
        its status and body are relayed to you unchanged, and nothing is charged either.
      </p>
    </Doc>
  );
}

export function Responses() {
  return (
    <Doc
      slug="api/responses"
      lede="The OpenAI Responses shape, which the newer OpenAI SDKs use by default. Same key, same billing, same base URL."
    >
      <Endpoint method="POST" path="/v1/responses" />
      <OriginCode
        title="Node"
        code={`import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{origin}/v1", apiKey: process.env.KREDIT_KEY });
const response = await client.responses.create({
  model: "openai/gpt-4o",
  instructions: "Answer in one sentence.",
  input: "What does a Kredit credit buy?",
});
console.log(response.output_text);`}
      />

      <H2>Request</H2>
      <Params>
        <Param name="model" type="string" required>
          A chat model id from <code>GET /v1/models</code>.
        </Param>
        <Param name="input" type="string | array" required>
          A string or an array of input items, exactly as the OpenAI API defines them.
        </Param>
        <Param name="instructions" type="string">
          Counted toward the input estimate for the balance check, then forwarded as is.
        </Param>
        <Param name="max_output_tokens" type="integer">
          Lowered by Kredit when your balance cannot cover it, so an answer is never cut off by an empty balance
          halfway through.
        </Param>
        <Param name="stream" type="boolean">
          Server-sent events. Usage is read from the <code>response.completed</code> event.
        </Param>
      </Params>

      <H2>Response</H2>
      <p>
        The provider&apos;s JSON plus the two billing headers on non-streamed answers. Cached input tokens reported in{" "}
        <code>input_tokens_details.cached_tokens</code> are billed at the model&apos;s cache price.
      </p>
      <Callout>
        <p>
          A streamed Responses call carries no in-band credit report. Check <code>GET /v1/account</code> or the
          dashboard for the charge. Only Chat Completions streams get the extra Kredit chunk.
        </p>
      </Callout>
      <p>
        Errors come back in the OpenAI shape. A body without <code>model</code> and <code>input</code> answers{" "}
        <code>400 invalid_body</code> with{" "}
        <code>Send a JSON body with `model` and `input` (a string or an array of items).</code>
      </p>
    </Doc>
  );
}

export function Messages() {
  return (
    <Doc
      slug="api/messages"
      lede="The Anthropic Messages shape, for Anthropic SDKs and Claude Code. Errors come back in Anthropic's shape too, so those clients behave normally."
    >
      <Endpoint method="POST" path="/v1/messages" />
      <OriginTabs
        tabs={[
          { name: "Node", code: snippets.Anthropic({ origin: "{origin}" }) },
          { name: "Claude Code", code: snippets["Claude Code"]({ origin: "{origin}" }) },
          {
            name: "curl",
            code: `curl {origin}/v1/messages \\
  -H "x-api-key: $KREDIT_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{ "model": "anthropic/claude-sonnet-4.5", "max_tokens": 256,
        "messages": [{ "role": "user", "content": "hi" }] }'`,
          },
        ]}
      />

      <H2>Request</H2>
      <Params>
        <Param name="model" type="string" required>
          A chat model id. Anthropic models look like <code>anthropic/claude-sonnet-4.5</code>, but any chat model on
          the server works through this endpoint.
        </Param>
        <Param name="max_tokens" type="integer" required>
          Required by the Anthropic API and by Kredit. Must be a positive integer; it is lowered when your balance
          cannot cover it.
        </Param>
        <Param name="messages" type="array" required>
          A non-empty array of Anthropic-style messages.
        </Param>
        <Param name="system" type="string | array">
          Counted toward the input estimate, then forwarded.
        </Param>
        <Param name="anthropic-version" type="header">
          Forwarded to the provider. Defaults to <code>2023-06-01</code> when your client sends none.
        </Param>
      </Params>

      <H2>Billing details</H2>
      <p>
        Cache reads and cache writes reported by the model are billed at its cache prices. Streams are read from{" "}
        <code>message_start</code>, <code>message_delta</code> and <code>content_block_delta</code> events and settled
        when the stream ends. A streamed Messages call carries no in-band credit report.
      </p>

      <H2>Errors</H2>
      <CodeBlock
        title="Anthropic error shape"
        code={`{
  "type": "error",
  "error": {
    "type": "billing_error",
    "message": "You are out of credits. Earn more on your Kredit dashboard.",
    "code": "insufficient_credits"
  }
}`}
      />
      <Table
        head={["Status", "Anthropic type", "Kredit code"]}
        rows={[
          ["400", <code key="a">invalid_request_error</code>, <code key="b">invalid_body · model_not_supported</code>],
          ["401", <code key="a">authentication_error</code>, <code key="b">invalid_api_key</code>],
          ["402", <code key="a">billing_error</code>, <code key="b">insufficient_credits</code>],
          ["404", <code key="a">not_found_error</code>, <code key="b">model_not_found</code>],
          ["429", <code key="a">rate_limit_error</code>, <code key="b">rate_limit_exceeded</code>],
          ["5xx", <code key="a">api_error</code>, <code key="b">provider_unreachable · provider_not_configured</code>],
        ]}
      />
    </Doc>
  );
}

export function Streaming() {
  return (
    <Doc
      slug="api/streaming"
      lede="Set stream to true and the answer arrives as server-sent events, token by token. You are billed for what was produced, when it is done."
    >
      <OriginCode
        title="Streaming"
        code={`curl -N {origin}/v1/chat/completions \\
  -H "Authorization: Bearer $KREDIT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "${ECHO_MODEL}", "stream": true, "messages": [{ "role": "user", "content": "hi" }] }'

data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"Kredit echo: hi"}}]}
data: {"object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}
data: {"id":"kredit-charge-1758560000000","object":"chat.completion.chunk","choices":[],"kredit":{"credits_charged":1,"balance":4999}}
data: [DONE]`}
      />

      <H2>How a stream is billed</H2>
      <ul>
        <li>
          Before the first byte, Kredit places a <strong>hold</strong> on your balance for the most the answer could
          cost. The hold is released the moment the stream settles, and <code>GET /v1/account</code> shows it under{" "}
          <code>held</code> while a call is running.
        </li>
        <li>
          When the stream ends, the provider&apos;s reported usage is charged. If the provider reported none, the
          tokens are estimated from the text that was produced.
        </li>
        <li>
          If you disconnect early, the charge is settled at that moment for what was produced up to then. Nothing is
          charged for output that never happened.
        </li>
        <li>The provider&apos;s events are forwarded line by line; keep-alive comments are passed through.</li>
      </ul>

      <H2>Where the charge is reported</H2>
      <p>
        Response headers are sent before the answer exists, so a proxied stream cannot carry{" "}
        <code>x-kredit-credits-charged</code>. Instead:
      </p>
      <Table
        head={["Endpoint", "In-band report"]}
        rows={[
          [
            <code key="a">/v1/chat/completions</code>,
            <>
              One extra chunk before <code>data: [DONE]</code>, with an empty <code>choices</code> array and a{" "}
              <code>kredit</code> object holding <code>credits_charged</code> and <code>balance</code>. Clients that
              ignore unknown fields never notice it.
            </>,
          ],
          [<code key="a">/v1/responses</code>, "None. Read the balance from GET /v1/account afterwards."],
          [<code key="a">/v1/messages</code>, "None. Read the balance from GET /v1/account afterwards."],
        ]}
      />
      <Callout kind="tip">
        <p>
          For Chat Completions, Kredit adds <code>stream_options.include_usage: true</code> to the upstream request so
          the provider reports exact token counts at the end of the stream. You do not need to set it yourself.
        </p>
      </Callout>
    </Doc>
  );
}
