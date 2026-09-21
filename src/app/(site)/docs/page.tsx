import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { ArrowRightIcon, PlayIcon } from "@/components/icons";
import { ModelLogo, ProviderLogo } from "@/components/model-logo";
import { catalog } from "@/lib/catalog";
import { costExamples } from "@/lib/cost-examples";
import { ECHO_MODEL } from "@/lib/gateway";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { CREDITS_PER_USD, MARGIN, MIN_CREDITS_PER_REQUEST } from "@/lib/pricing";
import { featuredProviders, makerOf } from "@/lib/providers";
import { KeyPanel } from "./key-panel";
import { BaseUrl, ModelsExample, Quickstart, StreamingExample } from "./quickstart";
import { SectionNav } from "./section-nav";
import type { SectionId } from "./sections";

export const metadata = { title: "API — Kredit" };
// The model list depends on how this server is configured, so it is read per request.
export const dynamic = "force-dynamic";

const endpoints = [
  { method: "POST", path: "/v1/chat/completions", text: "Chat with a model. Same request and response shape as OpenAI, including streaming." },
  { method: "GET", path: "/v1/models", text: "The models your key can reach on this server." },
];

const errors = [
  ["401", "invalid_api_key", "The key is missing, mistyped or revoked."],
  ["402", "insufficient_credits", "Your balance can't cover this call. When it is low, answers are kept short enough to pay for; when even that doesn't fit, the call is refused."],
  ["400", "invalid_body", "The JSON needs a model and a non-empty messages array."],
  ["429", "rate_limit_exceeded", "More than 60 requests in a minute on one key."],
  ["503", "provider_not_configured", `This server has no AI provider yet; only ${ECHO_MODEL} answers.`],
  ["502", "provider_unreachable", "The AI provider could not be reached. You were not charged."],
];

const billingHeaders = [
  ["x-kredit-credits-charged", "What this request cost, in credits."],
  ["x-kredit-balance", "Your balance after the charge."],
];

const tools = [
  ["Cursor", "Settings, Models, then override the OpenAI base URL with the one shown here and paste your Kredit key as the OpenAI API key."],
  ["Postman", "POST to /v1/chat/completions, set Auth to Bearer Token, and send a JSON body with model and messages."],
  ["OpenAI SDKs", "Pass base_url (Python) or baseURL (Node) and your Kredit key as api_key. Nothing else changes."],
];

// The same bodies the gateway sends, so what you read here is what your client gets.
const errorExample = `HTTP/1.1 402 Payment Required

{
  "error": {
    "message": "You are out of credits. Earn more on your Kredit dashboard.",
    "type": "invalid_request_error",
    "code": "insufficient_credits"
  }
}`;

const limitExample = `HTTP/1.1 429 Too Many Requests

{
  "error": {
    "message": "Rate limit reached: 60 requests per minute per key.",
    "type": "invalid_request_error",
    "code": "rate_limit_exceeded"
  }
}`;

const number = (value: number) => value.toLocaleString("en-US");

type SectionProps = {
  id: SectionId;
  title: string;
  /** Shown beside the prose on wide screens, below it everywhere else. */
  code?: React.ReactNode;
  /** Lets the content run under the code column too, for grids that want the room. */
  wide?: boolean;
  children: React.ReactNode;
};

// Prose on the left, its code on the right and staying in view while you read.
function Section({ id, title, code, wide, children }: SectionProps) {
  return (
    <section
      id={id}
      // The page already scrolls past the header; the extra margin clears the pill row on small screens.
      className="scroll-mt-8 border-t border-line py-10 first:border-t-0 first:pt-0 xl:grid xl:grid-cols-[minmax(0,1fr)_27rem] xl:gap-12 2xl:grid-cols-[minmax(0,1fr)_32rem]"
    >
      <div className={`prose-docs min-w-0 text-sm ${wide ? "xl:col-span-2" : "max-w-[45rem]"}`}>
        <h2 className="text-lg leading-7 font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
      {code && <div className="mt-6 min-w-0 space-y-4 xl:sticky xl:top-24 xl:mt-0 xl:self-start">{code}</div>}
    </section>
  );
}

// A small heading inside a section. The utilities win over the prose heading styles.
function Label({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <h3 className="section-label mt-8 text-[0.8125rem] font-medium">
      {children}
      {note && <span className="font-normal text-mist">{note}</span>}
    </h3>
  );
}

export default async function Docs() {
  const { live, models } = await catalog();
  const modelCount = models.length - 1; // the echo model is ours, not the provider's

  // How many models each maker has on this server, biggest first.
  const counts = new Map<string, number>();
  for (const model of models) {
    const maker = makerOf(model.id);
    counts.set(maker, (counts.get(maker) ?? 0) + 1);
  }
  const makers = live
    ? featuredProviders.filter((maker) => counts.has(maker.id)).sort((a, b) => counts.get(b.id)! - counts.get(a.id)!)
    : featuredProviders;

  const typicalCharge = costExamples[1].credits;
  const billingExample = `HTTP/1.1 200 OK
content-type: application/json
x-kredit-credits-charged: ${typicalCharge}
x-kredit-balance: ${5_000 - typicalCharge}`;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-24 xl:max-w-[88rem]">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pb-8 lg:border-b lg:border-line">
        <div>
          <p className="eyebrow">API</p>
          <h1 className="page-title mt-3">One key for the models you already use</h1>
          <p className="page-lede">
            Kredit speaks the OpenAI API format. Change the base URL, paste your key, and your credits pay for the
            call. Every response tells you what it cost and what is left.
          </p>
          <span className="chip mt-4">
            <span className={`live-dot ${live ? "" : "opacity-50"}`} />
            {live ? `Provider connected · ${number(modelCount)} models` : `Test mode · ${ECHO_MODEL} only`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="#key" className="btn-sm btn-sm-primary">
            Get your key <ArrowRightIcon className="size-3.5" />
          </a>
          <Link href="/playground" className="btn-sm">
            <PlayIcon className="size-3.5 text-mist" /> Open playground
          </Link>
        </div>
      </header>

      <div className="lg:mt-10 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-12">
        <SectionNav />

        <div className="mt-8 min-w-0 lg:mt-0">
          <Section id="key" title="Get your key" code={<KeyPanel />}>
            <p>
              Keys belong to your wallet. Create up to {MAX_ACTIVE_KEYS}, one per tool, and revoke any of them at once
              if it leaks. A key is shown a single time, when you create it.
            </p>
          </Section>

          <Section id="quickstart" title="Quickstart" code={<Quickstart />}>
            <p>
              Send your first request with <code>{ECHO_MODEL}</code>, a built-in model that repeats your message. It
              works on every Kredit server and is billed by length like any other model, so it is the fastest way to
              check a key end to end.
            </p>
          </Section>

          <Section
            id="auth"
            title="Authentication"
            code={
              <>
                <BaseUrl />
                <CodeBlock title="Header" code="Authorization: Bearer kredit_sk_…" />
              </>
            }
          >
            <p>
              Send your key as a bearer token in the <code>Authorization</code> header. Keys start with{" "}
              <code>kredit_sk_</code>. Keep them on a server or in a tool you trust, never in code that runs in someone
              else&apos;s browser.
            </p>
          </Section>

          <Section id="endpoints" title="Endpoints" code={<ModelsExample />}>
            <p>Two endpoints, both under the base URL and both authenticated the same way.</p>
            <ul className="mt-5 border-t border-line/60">
              {endpoints.map((endpoint) => (
                <li key={endpoint.path} className="entity max-w-none items-start">
                  <span className="chip mt-0.5 w-12 justify-center px-0 text-fog">{endpoint.method}</span>
                  <div className="min-w-0">
                    <p className="mt-0 font-mono text-[0.8125rem] leading-6 break-all text-fog">{endpoint.path}</p>
                    <p className="mt-0 text-[0.8125rem] leading-relaxed">{endpoint.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="streaming" title="Streaming" code={<StreamingExample />}>
            <p>
              Set <code>stream</code> to <code>true</code> and the reply arrives as server-sent events, token by
              token. The charge is settled when the stream ends, or when you disconnect, for what was produced up to
              then.
            </p>
          </Section>

          <Section id="billing" title="Credits and billing" code={<CodeBlock title="Response headers" code={billingExample} />}>
            <p>
              <strong>{number(CREDITS_PER_USD)} credits pay for $1 of AI usage.</strong> A call costs what the provider
              charged for it plus a {Math.round(MARGIN * 100)}% service fee, rounded up to a whole credit, with a
              minimum of {MIN_CREDITS_PER_REQUEST} credit per request. Failed calls are free.
            </p>
            <p>
              You pay for length: <strong>longer questions and longer answers cost more</strong>, because both the
              tokens you send and the tokens that come back are counted. <code>{ECHO_MODEL}</code> is billed by length
              in exactly the same way, so a test call shows you a real charge.
            </p>

            <Label note={`${number(CREDITS_PER_USD)} credits = $1`}>What requests cost</Label>
            <div className="overflow-x-auto">
              <table className="grid-table min-w-[30rem]">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th className="num">In / out tokens</th>
                    <th className="num">Credits</th>
                    <th className="num">≈ USD</th>
                  </tr>
                </thead>
                <tbody>
                  {costExamples.map((example) => (
                    <tr key={example.name}>
                      <td>
                        <span className="block text-fog">{example.name}</span>
                        <span className="block text-xs text-mist">{example.detail}</span>
                      </td>
                      <td className="num whitespace-nowrap text-mist">
                        {number(example.inputTokens)} / {number(example.outputTokens)}
                      </td>
                      <td className="num text-fog">{number(example.credits)}</td>
                      <td className="num text-mist">${example.usd.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs">
              Worked out with the same pricing function that bills you, at Kredit&apos;s fallback token price. When the
              provider reports its own price for a call, you are billed at that instead.
            </p>

            <Label>Headers on every response</Label>
            <ul>
              {billingHeaders.map(([header, text]) => (
                <li key={header} className="entity max-w-none flex-wrap gap-x-4 gap-y-1">
                  <code className="w-fit sm:w-52 sm:shrink-0 sm:border-0 sm:bg-transparent sm:p-0">{header}</code>
                  <span className="text-[0.8125rem] leading-relaxed">{text}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs">Non-streamed responses carry both, so your code always knows where it stands.</p>
          </Section>

          <Section id="errors" title="Errors" code={<CodeBlock title="Error body" code={errorExample} />}>
            <p>
              Errors use the OpenAI shape, <code>{`{ "error": { "message", "type", "code" } }`}</code>, so existing
              clients show them properly.
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="grid-table min-w-[32rem]">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Code</th>
                    <th>What happened</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map(([status, code, text]) => (
                    <tr key={code}>
                      <td className="font-mono text-fog">{status}</td>
                      <td className="font-mono whitespace-nowrap text-fog">{code}</td>
                      <td className="text-mist">{text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="limits" title="Limits" code={<CodeBlock title="Over the limit" code={limitExample} />}>
            <p>
              Each key may make <strong>60 requests per minute</strong>. A wallet can hold{" "}
              <strong>{MAX_ACTIVE_KEYS} active keys</strong>; revoke one to make room for another. Revoking takes effect
              on the very next request.
            </p>
          </Section>

          <Section id="models" title="Models" wide>
            <p>
              {live
                ? "This server is connected to its AI provider. Use any model id from the list your key returns at /v1/models."
                : `This server has no AI provider connected yet, so only ${ECHO_MODEL} answers. Once one is connected, models from these makers become available under ids like openai/… or anthropic/….`}
            </p>
            <Label note={live ? `${number(modelCount)} models in total` : "Waiting for a provider"}>
              {live ? "Makers on this server" : "Makers Kredit can reach"}
            </Label>
            {/* Cells draw their own right and bottom rules, so an uneven last row leaves no filler block. */}
            <ul className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-line sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5 [&>li]:-mr-px [&>li]:-mb-px [&>li]:max-w-none [&>li]:border-r [&>li]:border-b [&>li]:border-line">
              <li className="flex items-center gap-3 px-4 py-3.5">
                <ModelLogo model={ECHO_MODEL} className="size-5" />
                <div className="min-w-0 leading-5">
                  <span className="block truncate text-[0.8125rem] font-medium text-fog">Kredit</span>
                  <span className="block truncate font-mono text-xs">echo · always on</span>
                </div>
              </li>
              {makers.map((maker) => (
                <li key={maker.id} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-fog/[0.03]">
                  <ProviderLogo logo={maker.logo} className="size-5 text-mist transition-colors group-hover:text-fog" />
                  <div className="min-w-0 leading-5">
                    <span className="block truncate text-[0.8125rem] font-medium text-fog">{maker.name}</span>
                    <span className="block truncate font-mono text-xs tabular-nums">
                      {live ? `${number(counts.get(maker.id) ?? 0)} models` : `${maker.id}/…`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="max-w-[45rem] text-xs">
              Logos belong to their owners and only show whose models can be reached. Availability depends on the
              provider this server is connected to.
            </p>
          </Section>

          <Section id="tools" title="Use it in your tools" code={<BaseUrl />}>
            <p>Use a key anywhere that speaks the OpenAI API: point the tool at the base URL and paste your key.</p>
            <ul className="mt-5 border-t border-line/60">
              {tools.map(([name, text]) => (
                <li key={name} className="entity max-w-none flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="w-28 shrink-0 font-medium text-fog">{name}</span>
                  <span className="min-w-0 flex-1 basis-64 text-[0.8125rem] leading-relaxed">{text}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
