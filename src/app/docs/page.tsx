import Link from "next/link";
import { ArrowRightIcon, PlayIcon } from "@/components/icons";
import { ModelLogo, ProviderLogo } from "@/components/model-logo";
import { Reveal } from "@/components/motion/reveal";
import { TextReveal } from "@/components/motion/text-reveal";
import { catalog } from "@/lib/catalog";
import { ECHO_MODEL } from "@/lib/gateway";
import { MAX_ACTIVE_KEYS } from "@/lib/ledger";
import { CREDITS_PER_USD, MARGIN, MIN_CREDITS_PER_REQUEST } from "@/lib/pricing";
import { featuredProviders, providerOf } from "@/lib/providers";
import { KeyPanel } from "./key-panel";
import { BaseUrl, Quickstart, StreamingExample } from "./quickstart";

export const metadata = { title: "API — Fuel" };
// The model list depends on how this server is configured, so it is read per request.
export const dynamic = "force-dynamic";

const sections = [
  ["key", "Get your key"],
  ["quickstart", "Quickstart"],
  ["auth", "Authentication"],
  ["endpoints", "Endpoints"],
  ["streaming", "Streaming"],
  ["billing", "Credits and billing"],
  ["errors", "Errors"],
  ["limits", "Limits"],
  ["models", "Models"],
  ["tools", "Use it in your tools"],
];

const endpoints = [
  { method: "POST", path: "/v1/chat/completions", text: "Chat with a model. Same request and response shape as OpenAI, including streaming." },
  { method: "GET", path: "/v1/models", text: "The models your key can reach on this server." },
];

const errors = [
  ["401", "invalid_api_key", "The key is missing, mistyped or revoked."],
  ["402", "insufficient_credits", "Your balance is empty. Earn or buy more, then retry."],
  ["400", "invalid_body", "The JSON needs a model and a non-empty messages array."],
  ["429", "rate_limit_exceeded", "More than 60 requests in a minute on one key."],
  ["503", "provider_not_configured", `This server has no AI provider yet; only ${ECHO_MODEL} answers.`],
  ["502", "provider_unreachable", "The AI provider could not be reached. You were not charged."],
];

const tools = [
  ["Cursor", "Settings, Models, then override the OpenAI base URL with the one above and paste your Fuel key as the OpenAI API key."],
  ["Postman", "POST to /v1/chat/completions, set Auth to Bearer Token, and send a JSON body with model and messages."],
  ["OpenAI SDKs", "Pass base_url (Python) or baseURL (Node) and your Fuel key as api_key. Nothing else changes."],
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Reveal as="section" className="border-t border-line py-12 first:border-t-0 first:pt-0">
      <h2 id={id}>{title}</h2>
      {children}
    </Reveal>
  );
}

export default async function Docs() {
  const { live, models } = await catalog();

  // How many models each maker has on this server, biggest first.
  const counts = new Map<string, number>();
  for (const model of models) {
    const maker = model.id.split("/")[0];
    if (providerOf(model.id)) counts.set(maker, (counts.get(maker) ?? 0) + 1);
  }
  const makers = live
    ? featuredProviders.filter((maker) => counts.has(maker.id)).sort((a, b) => counts.get(b.id)! - counts.get(a.id)!)
    : featuredProviders;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 pb-24">
      <header className="max-w-3xl">
        <p className="eyebrow animate-rise">API</p>
        <TextReveal
          as="h1"
          text="One key for the models you already use."
          className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
        />
        <p style={{ animationDelay: "250ms" }} className="mt-6 max-w-[60ch] animate-rise text-lg leading-relaxed text-mist">
          Fuel speaks the OpenAI API format. Change the base URL, paste your key,
          and your credits pay for the call. Every response tells you what it
          cost and what is left.
        </p>
        <div style={{ animationDelay: "350ms" }} className="mt-8 flex animate-rise flex-wrap items-center gap-3">
          <a href="#key" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            Get your key <ArrowRightIcon />
          </a>
          <Link href="/playground" className="btn-ghost px-5 py-2.5 text-sm">
            <PlayIcon className="size-3.5 text-lime" /> Try the playground
          </Link>
          <span className="chip ml-1">
            <span className={`live-dot ${live ? "" : "opacity-50"}`} />
            {live ? `Provider connected · ${(models.length - 1).toLocaleString("en-US")} models` : `Test mode · ${ECHO_MODEL} only`}
          </span>
        </div>
      </header>

      <div className="mt-16 grid gap-12 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 border-l border-line text-sm">
            {sections.map(([id, title]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="-ml-px block border-l border-transparent py-1.5 pl-4 text-mist transition hover:border-lime hover:text-fog"
                >
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="prose-docs min-w-0">
          <Section id="key" title="Get your key">
            <p>
              Keys belong to your wallet. Create up to {MAX_ACTIVE_KEYS}, one per tool, and revoke any of
              them at once if it leaks. A key is shown a single time, when you create it.
            </p>
            <div className="mt-6">
              <KeyPanel />
            </div>
          </Section>

          <Section id="quickstart" title="Quickstart">
            <p>
              Send your first request with <code>{ECHO_MODEL}</code>, a built-in model that repeats your
              message. It works on every Fuel server and costs the minimum charge, so it is the fastest
              way to check a key end to end.
            </p>
            <div className="mt-6">
              <Quickstart />
            </div>
          </Section>

          <Section id="auth" title="Authentication">
            <p>
              Send your key as a bearer token in the <code>Authorization</code> header. Keys start with{" "}
              <code>fuel_sk_</code>. Keep them on a server or in a tool you trust, never in code that runs
              in someone else&apos;s browser.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <BaseUrl />
              <div className="code-block">
                <div className="border-b border-line bg-raised/50 px-4 py-2.5 font-mono text-xs text-mist">Header</div>
                <pre>
                  <code>
                    Authorization: Bearer <span className="text-lime">fuel_sk_…</span>
                  </code>
                </pre>
              </div>
            </div>
          </Section>

          <Section id="endpoints" title="Endpoints">
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {endpoints.map((endpoint) => (
                <li key={endpoint.path} className="grid gap-2 py-5 sm:grid-cols-[18rem_1fr] sm:items-baseline">
                  <p className="flex items-center gap-3 font-mono text-sm text-fog">
                    <span className="chip text-lime">{endpoint.method}</span>
                    {endpoint.path}
                  </p>
                  <p className="mt-0">{endpoint.text}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="streaming" title="Streaming">
            <p>
              Set <code>stream</code> to <code>true</code> and the reply arrives as server-sent events, token by
              token. The charge is settled when the stream ends, or when you disconnect, for what was
              produced up to then.
            </p>
            <div className="mt-6">
              <StreamingExample />
            </div>
          </Section>

          <Section id="billing" title="Credits and billing">
            <p>
              <strong>{CREDITS_PER_USD.toLocaleString("en-US")} credits pay for $1 of AI usage.</strong> A call costs what the
              provider charged for it plus a {Math.round(MARGIN * 100)}% service fee, rounded up to a whole credit, with a
              minimum of {MIN_CREDITS_PER_REQUEST} credit per request. Failed calls are free.
            </p>
            <p>Every non-streamed response carries two headers, so your code always knows where it stands:</p>
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {[
                ["x-fuel-credits-charged", "What this request cost, in credits."],
                ["x-fuel-balance", "Your balance after the charge."],
              ].map(([header, text]) => (
                <li key={header} className="grid gap-2 py-4 sm:grid-cols-[18rem_1fr] sm:items-baseline">
                  <code className="w-fit">{header}</code>
                  <p className="mt-0">{text}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="errors" title="Errors">
            <p>
              Errors use the OpenAI shape, <code>{`{ "error": { "message", "type", "code" } }`}</code>, so
              existing clients show them properly.
            </p>
            <div className="mt-6 overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Code</th>
                    <th>What happened</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map(([status, code, text], index) => (
                    <tr key={code} style={{ "--i": index } as React.CSSProperties}>
                      <td className="font-mono text-lime">{status}</td>
                      <td className="font-mono whitespace-nowrap text-fog">{code}</td>
                      <td className="text-mist">{text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="limits" title="Limits">
            <p>
              Each key may make <strong>60 requests per minute</strong>. A wallet can hold{" "}
              <strong>{MAX_ACTIVE_KEYS} active keys</strong>; revoke one to make room for another. Revoking takes
              effect on the very next request.
            </p>
          </Section>

          <Section id="models" title="Models">
            <p>
              {live
                ? "This server is connected to its AI provider. Use any model id from the list your key returns at /v1/models."
                : `This server has no AI provider connected yet, so only ${ECHO_MODEL} answers. Once one is connected, models from these makers become available under ids like openai/… or anthropic/….`}
            </p>
            {/* Cells draw their own right and bottom rules, so an uneven last row leaves no filler block. */}
            <ul className="mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-line sm:grid-cols-3 md:grid-cols-4 [&>li]:-mr-px [&>li]:-mb-px [&>li]:border-r [&>li]:border-b [&>li]:border-line">
              <li className="flex items-center gap-3 bg-ink p-5">
                <ModelLogo model={ECHO_MODEL} className="size-6" />
                <div className="min-w-0">
                  <p className="mt-0 truncate text-sm font-medium text-fog">Fuel</p>
                  <p className="mt-0 font-mono text-xs">echo · always on</p>
                </div>
              </li>
              {makers.map((maker) => (
                <li key={maker.id} className="group flex items-center gap-3 bg-ink p-5 transition-colors duration-500 hover:bg-surface">
                  <ProviderLogo logo={maker.logo} className="size-6 text-mist transition-colors duration-500 group-hover:text-fog" />
                  <div className="min-w-0">
                    <p className="mt-0 truncate text-sm font-medium text-fog">{maker.name}</p>
                    <p className="mt-0 font-mono text-xs">
                      {live ? `${counts.get(maker.id)} models` : `${maker.id}/…`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-sm">
              Logos belong to their owners and only show whose models can be reached. Availability depends on
              the provider this server is connected to.
            </p>
          </Section>

          <Section id="tools" title="Use it in your tools">
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {tools.map(([name, text]) => (
                <li key={name} className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr] sm:items-baseline">
                  <p className="mt-0 font-medium text-fog">{name}</p>
                  <p className="mt-0">{text}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
