import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { catalog } from "@/lib/catalog";
import { costExamples } from "@/lib/cost-examples";
import { ECHO_MODEL } from "@/lib/gateway";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { CREDITS_PER_USD, MARGIN, MIN_CREDITS_PER_REQUEST } from "@/lib/pricing";
import { featuredProviders, makerOf } from "@/lib/providers";
import { OriginCode } from "../quickstart";
import { Callout, Doc, Endpoint, H2, H3, number, Param, Params, Table } from "../ui";

// The API reference, remaining pages. Numbers are read from the pricing and
// gateway modules, so this page cannot drift from what is billed.

const RATE_LIMIT = 60;
const marginPercent = Math.round(MARGIN * 100);

export function Embeddings() {
  return (
    <Doc slug="api/embeddings" lede="OpenAI-shaped embeddings. Billed on input tokens only, so the cost is known before the call and no hold is taken.">
      <Endpoint method="POST" path="/v1/embeddings" />
      <OriginCode
        title="curl"
        code={`curl {origin}/v1/embeddings \\
  -H "Authorization: Bearer $KREDIT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "openai/text-embedding-3-small", "input": ["a wallet", "a credit"] }'`}
      />
      <H2>Request</H2>
      <Params>
        <Param name="model" type="string" required>
          An embedding model. Sending a chat model here answers <code>400 model_not_supported</code> with{" "}
          <code>&quot;&lt;model&gt;&quot; is not an embedding model.</code>
        </Param>
        <Param name="input" type="string | string[]" required>
          One string or an array of strings. For the balance check the array is joined with newlines and estimated at
          four characters per token.
        </Param>
      </Params>
      <H2>Response</H2>
      <p>
        The provider&apos;s JSON, plus <code>x-kredit-credits-charged</code> and <code>x-kredit-balance</code>. The
        charge is computed from the <code>usage</code> the provider reports. There is no streaming.
      </p>
      <p>
        If the estimated cost is more than your balance, the call is refused before it goes out with{" "}
        <code>402 insufficient_credits</code> and the message{" "}
        <code>This call needs about N credits, more than your balance covers.</code>
      </p>
    </Doc>
  );
}

export function Images() {
  return (
    <Doc slug="api/images" lede="Text to image. Priced per image or by token, as the model is sold, and settled the moment the pictures come back.">
      <Endpoint method="POST" path="/v1/images/generations" />
      <OriginCode
        title="curl"
        code={`curl {origin}/v1/images/generations \\
  -H "Authorization: Bearer $KREDIT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "openai/gpt-image-2", "prompt": "a receipt printed on cream paper", "n": 1, "size": "1024x1024" }'`}
      />
      <H2>Request</H2>
      <Params>
        <Param name="model" type="string" required>
          An image model from <code>GET /v1/models</code> (type <code>image</code>).
        </Param>
        <Param name="prompt" type="string" required>
          What to draw. Must not be empty.
        </Param>
        <Param name="n" type="integer">
          How many pictures, clamped to 1 to 4. Defaults to 1.
        </Param>
        <Param name="size" type="string">
          Forwarded when it looks like <code>WIDTHxHEIGHT</code>, such as <code>1024x1024</code>, <code>1536x1024</code>{" "}
          or <code>1024x1536</code>.
        </Param>
        <Param name="aspect_ratio" type="string">
          Forwarded when it looks like <code>W:H</code>, such as <code>16:9</code>.
        </Param>
      </Params>
      <H2>Response</H2>
      <CodeBlock
        title="200"
        code={`{
  "created": 1758560000,
  "data": [{ "b64_json": "…", "media_type": "image/png" }],
  "usage": { "input_tokens": 12, "output_tokens": 4160 }
}`}
      />
      <H2>How it is priced</H2>
      <ul>
        <li>
          Models sold per image cost <code>n × price per image</code>, known before the call.
        </li>
        <li>
          Models sold by token are estimated at 4,160 output tokens per picture plus your prompt. That worst case is
          held while the model works and the real usage is charged afterwards.
        </li>
        <li>
          If your available balance (balance minus holds) cannot cover the worst case, the call is refused with{" "}
          <code>402 insufficient_credits</code>.
        </li>
      </ul>
      <Callout>
        <p>
          Images and video are made through Vercel AI Gateway. On a server whose provider is not the gateway they
          answer <code>503 provider_not_configured</code>.
        </p>
      </Callout>
    </Doc>
  );
}

export function Videos() {
  return (
    <Doc slug="api/videos" lede="Text to video. Priced per second at a rate you can read from the model list, fixed before the clip is made.">
      <Endpoint method="POST" path="/v1/videos/generations" />
      <OriginCode
        title="curl"
        code={`curl {origin}/v1/videos/generations \\
  -H "Authorization: Bearer $KREDIT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "google/veo-3.1-fast-generate-001", "prompt": "coins stacking up on a desk",
        "duration": 4, "resolution": "720p", "aspect_ratio": "16:9", "generate_audio": false }'`}
      />
      <H2>Request</H2>
      <Params>
        <Param name="model" type="string" required>
          A video model from <code>GET /v1/models</code> (type <code>video</code>).
        </Param>
        <Param name="prompt" type="string" required>
          What to film. Must not be empty.
        </Param>
        <Param name="duration" type="number">
          Seconds, clamped to 1 to 20. Defaults to 4.
        </Param>
        <Param name="resolution" type="string">
          Defaults to <code>720p</code>. Must be one the model offers; otherwise <code>400 invalid_body</code> lists what
          it does offer.
        </Param>
        <Param name="aspect_ratio" type="string">
          Defaults to <code>16:9</code>. Forwarded when it looks like <code>W:H</code>.
        </Param>
        <Param name="generate_audio" type="boolean">
          Defaults to <code>false</code>. Some models price audio separately; the matching rate is used.
        </Param>
      </Params>
      <H2>Response</H2>
      <CodeBlock
        title="200"
        code={`{
  "created": 1758560000,
  "data": [{ "b64_json": "…", "media_type": "video/mp4" }],
  "duration": 4,
  "resolution": "720p",
  "generate_audio": false
}`}
      />
      <p>
        The charge is <code>duration × rate per second</code>, computed and held before the call and charged exactly
        as held. The request stays open until the clip is rendered, which can take a minute or more. A cancelled
        request answers <code>499 cancelled</code> and is not charged.
      </p>
    </Doc>
  );
}

export async function Models() {
  const { live, models } = await catalog();
  const counts = new Map<string, number>();
  for (const model of models) {
    const maker = makerOf(model.id);
    counts.set(maker, (counts.get(maker) ?? 0) + 1);
  }
  const makers = live
    ? featuredProviders.filter((maker) => counts.has(maker.id)).sort((a, b) => counts.get(b.id)! - counts.get(a.id)!)
    : featuredProviders;

  return (
    <Doc slug="api/models" lede="Every model your key can call, with its type and its price in credits. The list is read from the provider, so it is never out of date by more than ten minutes.">
      <Endpoint method="GET" path="/v1/models" />
      <OriginCode
        title="curl"
        code={`curl {origin}/v1/models -H "Authorization: Bearer $KREDIT_KEY"

{ "object": "list", "data": [
  { "id": "anthropic/claude-sonnet-4.5", "object": "model", "owned_by": "anthropic", "name": "Claude Sonnet 4.5",
    "type": "language", "context_window": 200000,
    "pricing": { "credits_per_million_input": 3600, "credits_per_million_output": 18000 } },
  { "id": "openai/gpt-image-2", "type": "image", "pricing": { "credits_per_image": 48 } },
  { "id": "google/veo-3.1-fast-generate-001", "type": "video", "pricing": { "credits_per_second_from": 180, "at_resolution": "720p" } },
  { "id": "${ECHO_MODEL}", "owned_by": "kredit", "name": "Echo (test model)", "type": "language",
    "pricing": { "credits_per_million_input": 3600, "credits_per_million_output": 18000 } }
] }`}
      />
      <H2>Fields</H2>
      <Params>
        <Param name="id" type="string">
          <code>provider/model</code>, for example <code>openai/gpt-4o</code>. A variant suffix such as{" "}
          <code>:online</code> is priced like its base model.
        </Param>
        <Param name="type" type="string">
          <code>language</code>, <code>embedding</code>, <code>image</code>, <code>video</code> or <code>other</code>.
          Each endpoint accepts only its own type.
        </Param>
        <Param name="context_window" type="integer">
          Present when the provider publishes it.
        </Param>
        <Param name="pricing" type="object | null">
          Credits with Kredit&apos;s {marginPercent}% margin already included. Per million tokens for language and
          embedding models, per image for image models, per second (from the cheapest resolution) for video. A
          model whose price is unknown is listed with <code>null</code> and cannot be called: nothing is ever billed by
          guesswork.
        </Param>
      </Params>

      <H2>Makers on this server</H2>
      <p>
        {live
          ? `This server is connected to its provider and lists ${number(models.length - 1)} models plus ${ECHO_MODEL}.`
          : `This server has no provider connected, so only ${ECHO_MODEL} answers today. Once one is connected, models from these makers appear under ids like openai/… or anthropic/….`}
      </p>
      <Table
        head={["Maker", "Id prefix", live ? "#Models" : "Status"]}
        rows={makers.map((maker) => [maker.name, <code key={maker.id}>{maker.id}/…</code>, live ? number(counts.get(maker.id) ?? 0) : "waiting for a provider"])}
        min="24rem"
      />
      <Callout>
        <p>
          The catalog is cached for ten minutes and refreshed from the provider with a ten-second timeout. If the
          provider&apos;s list cannot be read, calls to real models answer <code>502 provider_unreachable</code> rather
          than guessing a price, and <code>{ECHO_MODEL}</code> keeps working.
        </p>
      </Callout>
    </Doc>
  );
}

export function Billing() {
  return (
    <Doc slug="api/billing" lede={`${number(CREDITS_PER_USD)} credits pay for $1 of AI usage. A call costs what the provider charged for it plus a ${marginPercent}% service fee, rounded up to a whole credit.`}>
      <H2>The formula</H2>
      <CodeBlock title="Credits for a call" code={`credits = max(${MIN_CREDITS_PER_REQUEST}, ceil(provider_usd × ${1 + MARGIN} × ${number(CREDITS_PER_USD)}))`} />
      <p>
        <code>provider_usd</code> is the model&apos;s published price applied to the tokens the provider reports:
        input tokens at the input price, output tokens at the output price, cached input at the model&apos;s cache
        prices when it has them. Models with long-context tiers are priced by the size of the prompt, and the tier
        applies to the whole call.
      </p>
      <p>
        <strong>Failed calls are free.</strong> A provider that cannot be reached, a provider error, an invalid body
        or an empty balance never produces a charge.
      </p>

      <H2>What requests cost</H2>
      <p>
        Worked out by the same pricing function that bills you, for a mid-priced model at $3 in and $15 out per
        million tokens. Every model&apos;s own price is on <code>GET /v1/models</code>.
      </p>
      <Table
        head={["Request", "#In / out tokens", "#Credits", "#≈ USD"]}
        rows={costExamples.map((example) => [
          <span key={example.name}>
            <span className="block text-fog">{example.name}</span>
            <span className="block text-xs text-mist">{example.detail}</span>
          </span>,
          `${number(example.inputTokens)} / ${number(example.outputTokens)}`,
          number(example.credits),
          `$${example.usd.toFixed(3)}`,
        ])}
        min="30rem"
      />

      <H2>Headers on every billed response</H2>
      <Table
        head={["Header", "Meaning"]}
        rows={[
          [<code key="a">x-kredit-credits-charged</code>, "What this request cost, in credits."],
          [<code key="a">x-kredit-balance</code>, "Your balance after the charge."],
          [<code key="a">x-request-id</code>, "A unique id for this request, on every /v1 response, for support."],
          [<code key="a">x-ratelimit-limit · x-ratelimit-remaining</code>, "Your per-minute allowance and what is left of it, on authenticated responses."],
        ]}
      />
      <p>
        Non-streamed calls always carry the two billing headers. Proxied streams cannot, because headers go out
        before the answer exists; see <Link href="/docs/api/streaming">Streaming</Link>.
      </p>

      <H2 id="a-thin-balance">A thin balance</H2>
      <p>
        Kredit never lets an answer stop halfway because the credits ran out. Before a call goes out it works out
        the most the answer could cost, from your requested <code>max_tokens</code> or the model&apos;s own maximum
        (16,384 when the provider publishes none):
      </p>
      <ul>
        <li>
          If your available balance covers it, the request is sent unchanged and that amount is <strong>held</strong>{" "}
          until the call settles. Holds are what <code>GET /v1/account</code> reports as <code>held</code>.
        </li>
        <li>
          If it does not, the max-tokens field is <strong>lowered to what you can afford</strong>, never below 16
          tokens, and the call goes out with that.
        </li>
        <li>
          If even 16 tokens of answer do not fit, the call is refused with <code>402 insufficient_credits</code> and the
          message tells you how many credits it would need.
        </li>
      </ul>
      <p>
        A call is allowed whenever the balance is above zero, so the very last call can take it slightly below zero.
        Free models are never shortened.
      </p>

      <H2>Counting tokens before the provider does</H2>
      <p>
        For the balance check, text is estimated at four characters per token and each attached image or file part
        counts as a flat 1,000 tokens. The provider&apos;s reported usage is what you are actually charged for; the
        estimate only decides whether the call may start.
      </p>
    </Doc>
  );
}

export function Errors() {
  const rows: [string, string, string][] = [
    ["401", "invalid_api_key", "The key is missing, mistyped or revoked."],
    ["402", "insufficient_credits", "The balance is at zero, or cannot cover this call even with a shortened answer. The message says how many credits it needs."],
    ["400", "invalid_body", "The JSON is missing what the endpoint needs, such as model and messages, or a video option the model does not offer."],
    ["400", "model_not_supported", "The model exists but is the wrong kind for the endpoint, such as an embedding model sent to chat."],
    ["404", "model_not_found", "No model of that id is on this server. GET /v1/models lists them."],
    ["400", "invalid_query", "A from or to date on GET /v1/usage could not be parsed."],
    ["429", "rate_limit_exceeded", `More than ${RATE_LIMIT} requests in a minute on one key.`],
    ["499", "cancelled", "You cancelled an image or video request before it finished. Nothing was charged."],
    ["502", "provider_unreachable", "The AI provider, or its model list, could not be reached. You were not charged."],
    ["502", "provider_error", "The provider failed while making an image or video. You were not charged."],
    ["503", "provider_not_configured", `This server has no AI provider yet; only ${ECHO_MODEL} answers. Images and video also need Vercel AI Gateway as the provider.`],
  ];
  return (
    <Doc slug="api/errors" lede="Errors use the OpenAI shape on every endpoint but /v1/messages, which uses Anthropic's, so the client you already have shows them properly.">
      <CodeBlock
        title="Error body"
        code={`HTTP/1.1 402 Payment Required

{
  "error": {
    "message": "You are out of credits. Earn more on your Kredit dashboard.",
    "type": "invalid_request_error",
    "code": "insufficient_credits"
  }
}`}
      />
      <p>
        <code>type</code> is <code>server_error</code> for 5xx answers and <code>invalid_request_error</code> otherwise.{" "}
        <code>code</code> is the field to switch on.
      </p>
      <H2>Codes</H2>
      <Table
        head={["Status", "Code", "What happened"]}
        rows={rows.map(([status, code, text]) => [<code key="s">{status}</code>, <code key="c">{code}</code>, text])}
        min="34rem"
      />
      <H2>When the provider itself fails</H2>
      <p>
        If the provider answers a chat, responses, messages or embeddings call with an error of its own, Kredit relays
        that status and body to you <strong>unchanged</strong> and charges nothing. So a provider&apos;s 400 for a
        malformed tool schema, or its 429, reaches you exactly as the provider wrote it, wrapped only in CORS headers.
      </p>
      <H3>Anthropic shape</H3>
      <p>
        <code>/v1/messages</code> answers <code>{`{ "type": "error", "error": { "type", "message", "code" } }`}</code>{" "}
        with the Anthropic type derived from the status; the table on the{" "}
        <Link href="/docs/api/messages#errors">Messages</Link> page maps them.
      </p>
    </Doc>
  );
}

export function Limits() {
  return (
    <Doc slug="api/limits" lede="Enough for a busy tool, and enough headroom that one script cannot drain a wallet by mistake.">
      <Table
        head={["Limit", "Value"]}
        rows={[
          ["Requests per minute", `${RATE_LIMIT} per API key. A wallet with ${MAX_ACTIVE_KEYS} keys gets ${MAX_ACTIVE_KEYS} × ${RATE_LIMIT}.`],
          ["Playground", `${RATE_LIMIT} per minute per wallet.`],
          ["Active API keys", `${MAX_ACTIVE_KEYS} per wallet. Revoke one to make room.`],
          ["Key name", "40 characters."],
          ["Images per request", "1 to 4."],
          ["Video length", "1 to 20 seconds."],
          ["Usage page size", "100 rows by default, 500 at most."],
          ["Model catalog refresh", "Every 10 minutes."],
        ]}
        min="28rem"
      />
      <H2>Over the limit</H2>
      <CodeBlock
        title="429"
        code={`HTTP/1.1 429 Too Many Requests

{
  "error": {
    "message": "Rate limit reached: ${RATE_LIMIT} requests per minute per key.",
    "type": "invalid_request_error",
    "code": "rate_limit_exceeded"
  }
}`}
      />
      <p>
        The window is a rolling 60 seconds, counted per key in memory. Authenticated responses carry{" "}
        <code>x-ratelimit-limit</code> and <code>x-ratelimit-remaining</code> so a client can pace itself before it hits
        the wall. The 401 and 429 responses themselves carry neither.
      </p>
      <H2>CORS</H2>
      <p>
        Every <code>/v1</code> route answers preflight with <code>204</code> and allows any origin, the{" "}
        <code>authorization</code>, <code>x-api-key</code>, <code>anthropic-version</code> and <code>content-type</code>{" "}
        headers, and exposes the billing, request-id and rate-limit headers to browser code. That said, a key in a
        browser is a key anyone can take; keep keys on a server.
      </p>
    </Doc>
  );
}

export function Account() {
  return (
    <Doc slug="api/account" lede="Two read-only endpoints so your code always knows where it stands, without a dashboard.">
      <Endpoint method="GET" path="/v1/account" />
      <OriginCode
        title="curl"
        code={`curl {origin}/v1/account -H "Authorization: Bearer $KREDIT_KEY"

{
  "object": "account",
  "address": "0x71c7…976f",
  "key": { "name": "Cursor", "prefix": "kredit_sk_ab12…wxyz" },
  "balance": 4988,
  "held": 120,
  "available": 4868,
  "usd_value": 4.988,
  "total_spent": 3120,
  "rate_limit": { "requests_per_minute": ${RATE_LIMIT} }
}`}
      />
      <Params>
        <Param name="balance" type="integer">
          Every credit the wallet holds right now.
        </Param>
        <Param name="held" type="integer">
          Credits reserved by calls still running (streams, images, video). Released when they settle.
        </Param>
        <Param name="available" type="integer">
          <code>balance − held</code>, never below zero. What a new call can spend.
        </Param>
        <Param name="usd_value" type="number">
          The balance divided by {number(CREDITS_PER_USD)}.
        </Param>
        <Param name="total_spent" type="integer">
          Everything this wallet has ever spent, across all its keys and the playground.
        </Param>
      </Params>
      <p>A key sees only what it needs to spend. Never the wallet&apos;s other keys, nor where its credits came from.</p>

      <Endpoint method="GET" path="/v1/usage" />
      <OriginCode
        title="curl"
        code={`curl "{origin}/v1/usage?from=2026-09-01&to=2026-10-01&limit=2" -H "Authorization: Bearer $KREDIT_KEY"

{
  "object": "list",
  "period": { "from": "2026-09-01T00:00:00.000Z", "to": "2026-10-01T00:00:00.000Z" },
  "total_credits": 1830,
  "by_model": [{ "model": "openai/gpt-4o", "calls": 41, "input_tokens": 120400, "output_tokens": 38100, "credits": 1830 }],
  "data": [
    { "id": 912, "created_at": "2026-09-22T08:14:02.311Z", "key": "3d9e…", "model": "openai/gpt-4o", "input_tokens": 300, "output_tokens": 500, "credits": 11 },
    { "id": 911, "created_at": "2026-09-22T08:13:40.008Z", "key": "playground", "model": "openai/gpt-4o", "input_tokens": 20, "output_tokens": 60, "credits": 2 }
  ],
  "has_more": true,
  "next": 911
}`}
      />
      <Params>
        <Param name="from · to" type="date">
          Any date <code>new Date()</code> understands, such as <code>2026-09-01</code> or{" "}
          <code>2026-09-01T12:00:00Z</code>. <code>from</code> is inclusive, <code>to</code> exclusive. A date that cannot
          be parsed answers <code>400 invalid_query</code>.
        </Param>
        <Param name="limit" type="integer">
          Rows per page, 1 to 500. Defaults to 100.
        </Param>
        <Param name="before" type="integer">
          Pass the previous page&apos;s <code>next</code> to continue. Rows come newest first.
        </Param>
      </Params>
      <p>
        <code>total_credits</code> and <code>by_model</code> cover the whole period, not just the page.{" "}
        <code>key</code> is the id of the key that made the call, or <code>playground</code> for calls made from the
        browser playground.
      </p>
    </Doc>
  );
}

export function OpenApi() {
  return (
    <Doc slug="api/openapi" lede="A machine-readable description of every endpoint above, for generating a client or importing into Postman.">
      <Endpoint method="GET" path="/v1/openapi.json" note="public, no key needed" />
      <OriginCode title="Fetch it" code={`curl {origin}/v1/openapi.json`} />
      <ul>
        <li>OpenAPI 3.1.0, title <code>Kredit API</code>, version <code>1</code>.</li>
        <li>
          <code>servers</code> points at this host&apos;s <code>/v1</code>, so a generated client needs no base URL of its
          own.
        </li>
        <li>
          Two security schemes: <code>bearerAuth</code> for every route and <code>anthropicKey</code> (the{" "}
          <code>x-api-key</code> header) on <code>/messages</code>.
        </li>
        <li>
          Documents <code>/chat/completions</code>, <code>/responses</code>, <code>/messages</code>,{" "}
          <code>/embeddings</code>, <code>/images/generations</code>, <code>/videos/generations</code>,{" "}
          <code>/models</code>, <code>/account</code> and <code>/usage</code>, with the shared 401, 402, 404, 429 and 502
          responses and the billing headers.
        </li>
        <li>Cached for an hour.</li>
      </ul>
      <H2>Generate a client</H2>
      <OriginCode
        title="Examples"
        code={`# TypeScript types
npx openapi-typescript {origin}/v1/openapi.json -o kredit.d.ts

# Postman: File → Import → paste the URL above`}
      />
      <Callout>
        <p>
          Request bodies for chat, responses, messages and embeddings are described as open objects, because they are
          passed to the provider as is. The spec tells you how to call; the provider&apos;s own documentation tells
          you what each model accepts.
        </p>
      </Callout>
    </Doc>
  );
}
