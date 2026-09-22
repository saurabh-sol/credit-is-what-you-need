"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/code-block";
import { CheckIcon, CloseIcon, SearchIcon } from "@/components/icons";
import { MakerLogo, ModelLogo } from "@/components/model-logo";
import type { Capability, CatalogModel, ModelType } from "@/lib/catalog";
import { formatCredits } from "@/lib/format";
import { makerOf } from "@/lib/providers";
import { SITE_URL } from "@/lib/site";
import { snippets } from "@/lib/snippets";
import { credits, tokens, TURN_IN, TURN_OUT, turnCost, turnUnit } from "./price";

// The catalog: every model the server can reach. A strip of maker tiles
// narrows the list; each maker is a card of its models with the price of a
// turn and a bar that shows how that price compares. A model row opens into
// its details. The page gives it the data.

export type Maker = { id: string; name: string; logo?: string; count: number };

const KINDS: { id: ModelType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "language", label: "Chat" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "embedding", label: "Embeddings" },
  { id: "evaluation", label: "Evaluation" },
];

const CAPABILITIES: { id: Capability; label: string; icon: React.ReactNode }[] = [
  { id: "tools", label: "Tool use", icon: <path d="M14.5 5.5a3.5 3.5 0 0 0 4 4l-9 9a2 2 0 0 1-3-3l9-9Z" /> },
  { id: "vision", label: "Vision", icon: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></> },
  { id: "reasoning", label: "Reasoning", icon: <path d="M12 3c.6 4.7 2.3 6.4 9 9-6.7 2.6-8.4 4.3-9 9-.6-4.7-2.3-6.4-9-9 6.7-2.6 8.4-4.3 9-9Z" /> },
  { id: "structured", label: "Structured output", icon: <path d="M8 4c-2 0-2.5 1-2.5 3v2.5C5.5 11 4.5 12 3.5 12c1 0 2 1 2 2.5V17c0 2 .5 3 2.5 3m8-16c2 0 2.5 1 2.5 3v2.5c0 1.5 1 2.5 2 2.5-1 0-2 1-2 2.5V17c0 2-.5 3-2.5 3" /> },
  { id: "caching", label: "Prompt caching", icon: <><ellipse cx="12" cy="6" rx="7" ry="2.5" /><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></> },
  { id: "audio", label: "Audio in", icon: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21" /></> },
  { id: "video", label: "Video in", icon: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-2.5v9L16 14" /></> },
  { id: "pdf", label: "Files in", icon: <path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Zm0 0V8h4.5" /> },
];
const capabilityLabel = new Map(CAPABILITIES.map((entry) => [entry.id, entry.label]));

function CapabilityIcon({ id, className = "size-3.5" }: { id: Capability; className?: string }) {
  const entry = CAPABILITIES.find((capability) => capability.id === id);
  if (!entry) return null;
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0 fill-none stroke-current`} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {entry.icon}
    </svg>
  );
}

const ChevronIcon = ({ className = "size-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`${className} shrink-0 fill-none stroke-current`} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);


const released = (seconds?: number) =>
  seconds ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(seconds * 1000)) : "";

const playgroundMode: Partial<Record<ModelType, string>> = { language: "text", image: "image", video: "video", evaluation: "evaluate" };
const kindName: Record<ModelType, string> = { language: "Chat", image: "Image", video: "Video", embedding: "Embedding", evaluation: "Evaluation", other: "Other" };
const docsFor: Record<ModelType, string> = {
  language: "/docs/api/chat-completions",
  image: "/docs/api/images",
  video: "/docs/api/videos",
  embedding: "/docs/api/embeddings",
  evaluation: "/docs/api/evaluations",
  other: "/docs/api/models",
};

// The makers people look for first; the rest follow by how many models they have.
const FEATURED = ["openai", "anthropic", "google", "x-ai", "meta-llama", "mistralai", "deepseek", "qwen", "moonshotai", "z-ai", "minimax"];

type Sort = "featured" | "newest" | "cheapest" | "priciest" | "name";
const SORTS: { id: Sort; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "newest", label: "Newest" },
  { id: "cheapest", label: "Cheapest" },
  { id: "priciest", label: "Priciest" },
  { id: "name", label: "Name" },
];

const Mark = ({ value }: { value?: boolean }) =>
  value === undefined ? <span className="text-mist/50">–</span> : value ? <CheckIcon className="inline size-3.5 text-fog" /> : <CloseIcon className="inline size-3.5 text-mist/50" />;

export function CatalogTable({ makers, models, live }: { makers: Maker[]; models: CatalogModel[]; live: boolean }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ModelType | "all">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [needs, setNeeds] = useState<Set<Capability>>(new Set());
  const [sort, setSort] = useState<Sort>("featured");
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      models.filter(
        (model) =>
          (kind === "all" || model.type === kind) &&
          (picked.size === 0 || picked.has(makerOf(model.id))) &&
          [...needs].every((capability) => model.capabilities?.includes(capability)) &&
          (!needle || `${model.id} ${model.name} ${makerOf(model.id)}`.toLowerCase().includes(needle)),
      ),
    [models, kind, picked, needs, needle],
  );

  // The priciest turn of each kind in view, so every bar is drawn to the same scale.
  const ceiling = useMemo(() => {
    const top = new Map<ModelType, number>();
    for (const model of filtered) {
      const cost = turnCost(model.price);
      if (Number.isFinite(cost)) top.set(model.type, Math.max(top.get(model.type) ?? 0, cost));
    }
    return top;
  }, [filtered]);

  // Models sorted, then grouped under their makers; the groups take the order
  // of their first model, so "cheapest" puts the maker with the cheapest model first.
  const groups = useMemo(() => {
    const compare = (a: CatalogModel, b: CatalogModel) => {
      if (sort === "newest") return (b.released ?? 0) - (a.released ?? 0) || a.name.localeCompare(b.name);
      if (sort === "cheapest") return turnCost(a.price) - turnCost(b.price) || a.name.localeCompare(b.name);
      if (sort === "priciest") return turnCost(b.price) - turnCost(a.price) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    };
    const sorted = [...filtered].sort(compare);
    const byMaker = new Map<string, CatalogModel[]>();
    for (const model of sorted) {
      const maker = makerOf(model.id);
      byMaker.set(maker, [...(byMaker.get(maker) ?? []), model]);
    }
    const info = new Map(makers.map((entry) => [entry.id, entry]));
    const rank = (id: string) => (FEATURED.includes(id) ? FEATURED.indexOf(id) - FEATURED.length : 0);
    const list = [...byMaker.entries()].map(([id, list]) => ({ maker: info.get(id) ?? { id, name: id, count: list.length }, models: list }));
    if (sort === "featured") list.sort((a, b) => rank(a.maker.id) - rank(b.maker.id) || b.maker.count - a.maker.count || a.maker.name.localeCompare(b.maker.name));
    if (sort === "name") list.sort((a, b) => a.maker.name.localeCompare(b.maker.name));
    return list;
  }, [filtered, makers, sort]);

  if (!live) return null;

  const filtering = kind !== "all" || picked.size > 0 || needs.size > 0 || needle;
  const allFolded = groups.length > 0 && groups.every((group) => folded.has(group.maker.id));
  const rank = (id: string) => (FEATURED.includes(id) ? FEATURED.indexOf(id) - FEATURED.length : 0);
  const strip = [...makers].sort((a, b) => rank(a.id) - rank(b.id) || b.count - a.count || a.name.localeCompare(b.name));

  return (
    <section className="mt-16" aria-label="Model catalog">
      {/* Makers as a strip of tiles; tap one to keep only its models. */}
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Makers</h2>
        {picked.size > 0 && (
          <button type="button" onClick={() => setPicked(new Set())} className="text-xs text-mist underline decoration-line underline-offset-4 hover:text-fog">
            Show all makers
          </button>
        )}
      </div>
      <ul className="-mx-4 mt-4 flex snap-x list-none gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {strip.map((entry) => {
          const active = picked.has(entry.id);
          return (
            <li key={entry.id} className="m-0 shrink-0 snap-start">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setPicked(toggle(picked, entry.id))}
                className={`card card-lift flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition ${active ? "border-accent/60 bg-accent/5" : "hover:border-fog/25"}`}
              >
                <MakerLogo maker={entry} className="size-5" />
                <span className="leading-4">
                  <span className="block text-[0.8125rem] font-medium text-fog">{entry.name}</span>
                  <span className="block font-mono text-[0.625rem] text-mist tabular-nums">{entry.count}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* The filter bar stays under the site header while the cards scroll. */}
      <div className="sticky top-16 z-20 -mx-4 mt-6 border-y border-line bg-ink/85 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <label className="field flex min-w-52 flex-1 items-center gap-2 rounded-full px-4 py-2 text-mist">
            <SearchIcon />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${formatCredits(models.length)} models`}
              aria-label="Search models"
              className="w-full bg-transparent text-[0.8125rem] text-fog placeholder:text-mist focus:outline-none"
            />
          </label>
          <div role="radiogroup" aria-label="Kind of model" className="inline-flex overflow-x-auto rounded-full border border-line bg-surface p-0.5">
            {KINDS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={kind === entry.id}
                onClick={() => setKind(entry.id)}
                className={`rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${kind === entry.id ? "bg-fog text-ink" : "text-mist hover:text-fog"}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <label className="field flex w-auto items-center gap-2 rounded-full px-4 py-2 text-xs text-mist">
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort models" className="bg-transparent text-fog focus:outline-none">
              {SORTS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {CAPABILITIES.map((entry) => {
            const active = needs.has(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={active}
                onClick={() => setNeeds(toggle(needs, entry.id))}
                className={`chip gap-1.5 transition ${active ? "border-accent/60 bg-accent/10 text-fog" : "hover:border-fog/25 hover:text-fog"}`}
              >
                <CapabilityIcon id={entry.id} className="size-3" />
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-mist tabular-nums" role="status">
        <p>
          {filtered.length === models.length ? `${formatCredits(models.length)} models` : `${formatCredits(filtered.length)} of ${formatCredits(models.length)} models`} from{" "}
          {formatCredits(groups.length)} {groups.length === 1 ? "maker" : "makers"}. A turn is a {formatCredits(TURN_IN)}-token prompt with a {TURN_OUT}-token answer;
          1,000 credits = $1.
          {filtering && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setKind("all");
                  setPicked(new Set());
                  setNeeds(new Set());
                }}
                className="underline decoration-line underline-offset-4 hover:text-fog"
              >
                Clear filters
              </button>
            </>
          )}
        </p>
        {groups.length > 1 && (
          <button
            type="button"
            onClick={() => setFolded(allFolded ? new Set() : new Set(groups.map((group) => group.maker.id)))}
            className="underline decoration-line underline-offset-4 hover:text-fog"
          >
            {allFolded ? "Expand all" : "Collapse all"}
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="card mt-4 px-4 py-12 text-center text-sm text-mist">No model matches that.</p>
      ) : (
        <div className="mt-4 grid gap-4">
          {groups.map((group) => {
            const shut = folded.has(group.maker.id);
            const from = Math.min(...group.models.map((model) => turnCost(model.price)));
            return (
              <article key={group.maker.id} className="card overflow-hidden">
                <button
                  type="button"
                  aria-expanded={!shut}
                  onClick={() => setFolded(toggle(folded, group.maker.id))}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-fog/[0.025] sm:px-5"
                >
                  <MakerLogo maker={group.maker} className="size-7" />
                  <span className="min-w-0 flex-1 leading-5">
                    <span className="block text-[0.9375rem] font-semibold text-fog">{group.maker.name}</span>
                    <span className="block font-mono text-[0.6875rem] text-mist tabular-nums">
                      {group.models.length} {group.models.length === 1 ? "model" : "models"}
                      {Number.isFinite(from) && ` · from ${credits(from)} credits a turn`}
                    </span>
                  </span>
                  <ChevronIcon className={`size-4 text-mist transition ${shut ? "-rotate-90" : ""}`} />
                </button>

                {!shut && (
                  <ul className="m-0 list-none border-t border-line p-0">
                    {group.models.map((model, index) => {
                      const open = openId === model.id;
                      const mode = playgroundMode[model.type];
                      const tryHref = mode && model.price ? `/playground?model=${encodeURIComponent(model.id)}&mode=${mode}` : null;
                      const cost = turnCost(model.price);
                      const top = ceiling.get(model.type) ?? 0;
                      // Square root, so a 100× price gap is still a bar you can read, not a sliver.
                      const share = Number.isFinite(cost) && top > 0 ? Math.max(0.03, Math.sqrt(cost / top)) : 0;
                      return (
                        <li key={model.id} className="m-0 border-b border-line/70 last:border-b-0">
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={open}
                            onClick={() => setOpenId(open ? null : model.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setOpenId(open ? null : model.id);
                              }
                            }}
                            style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
                            className={`flex animate-rise cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-fog/[0.03] sm:px-5 ${open ? "bg-fog/[0.03]" : ""}`}
                          >
                            <ModelLogo model={model.id} className="size-5 shrink-0 text-mist" />
                            <span className="min-w-0 flex-1 leading-5">
                              <span className="block truncate text-[0.875rem] font-medium text-fog">{model.name}</span>
                              <span className="block truncate font-mono text-[0.6875rem] text-mist">{model.id}</span>
                            </span>
                            <span className="hidden w-24 shrink-0 items-center gap-1.5 text-mist lg:flex">
                              {model.capabilities?.slice(0, 4).map((capability) => (
                                <span key={capability} title={capabilityLabel.get(capability)}>
                                  <CapabilityIcon id={capability} />
                                </span>
                              ))}
                              {(model.capabilities?.length ?? 0) > 4 && <span className="font-mono text-[0.625rem]">+{model.capabilities!.length - 4}</span>}
                            </span>
                            <span className="hidden w-14 shrink-0 text-right font-mono text-[0.6875rem] text-mist tabular-nums md:block">{tokens(model.contextWindow)}</span>
                            <span className="hidden w-24 shrink-0 text-right font-mono text-[0.6875rem] text-mist tabular-nums xl:block">{released(model.released)}</span>
                            <span className="w-28 shrink-0 text-right sm:w-36">
                              {model.price ? (
                                <>
                                  <span className="block font-mono text-sm text-fog tabular-nums">
                                    {credits(cost)} <span className="text-[0.6875rem] text-mist">{turnUnit(model.price)}</span>
                                  </span>
                                  <span className="mt-1 ml-auto block h-1 w-20 overflow-hidden rounded-full bg-raised sm:w-28">
                                    <span
                                      className="block h-full rounded-full bg-gradient-to-r from-accent-dim to-accent"
                                      style={{ width: `${share * 100}%` }}
                                    />
                                  </span>
                                </>
                              ) : (
                                <span className="font-mono text-[0.6875rem] text-mist">not for sale here</span>
                              )}
                            </span>
                            {tryHref ? (
                              <Link href={tryHref} onClick={(event) => event.stopPropagation()} className="btn-ghost hidden shrink-0 px-3 py-1 text-xs md:inline-flex">
                                Try
                              </Link>
                            ) : (
                              <span className="hidden w-12 shrink-0 md:block" />
                            )}
                            <ChevronIcon className={`size-3.5 shrink-0 text-mist transition ${open ? "rotate-180" : ""}`} />
                          </div>
                          {open && <ModelDetail model={model} tryHref={tryHref} />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// A model's full card, opened under its row.
function ModelDetail({ model, tryHref }: { model: CatalogModel; tryHref: string | null }) {
  const price = model.price;
  const facts: [string, React.ReactNode][] = [];
  if (price?.per === "million_tokens") {
    facts.push(["Input", `${credits(price.input)} / M tokens`], ["Output", `${credits(price.output)} / M tokens`]);
    if (model.cacheRead !== undefined) facts.push(["Cached input", `${credits(model.cacheRead)} / M tokens`]);
    facts.push(["Typical turn", `${credits(turnCost(price))} credits`]);
  } else if (price?.per === "image") {
    facts.push(["Per image", `${credits(price.credits)} credits`]);
  } else if (price?.per === "second") {
    facts.push(["Per second", `from ${credits(price.from)} credits at ${price.resolution}`]);
    for (const rate of price.rates) facts.push([`${rate.resolution}${rate.audio ? " + audio" : ""}`, `${credits(rate.credits)} / s`]);
  } else {
    facts.push(["Price", "not published, so it cannot be called"]);
  }
  if (model.contextWindow) facts.push(["Context", `${formatCredits(model.contextWindow)} tokens`]);
  if (model.maxOutputTokens) facts.push(["Max output", `${formatCredits(model.maxOutputTokens)} tokens`]);
  if (model.modalities) facts.push(["Modalities", `${model.modalities.input.join(", ") || "text"} → ${model.modalities.output.join(", ") || "text"}`]);
  if (model.released) facts.push(["Released", released(model.released)]);
  facts.push(["Zero data retention", <Mark key="zdr" value={model.zdr} />]);
  facts.push(["Never trains on prompts", <Mark key="training" value={model.noTraining} />]);

  const curl = model.type === "language" ? snippets.curl({ origin: SITE_URL, model: model.id, message: "hi" }) : null;

  return (
    <div className="animate-rise grid gap-6 border-t border-line/70 bg-ink/50 px-4 py-5 sm:px-5 md:grid-cols-[1.1fr_1fr] md:px-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold tracking-tight">{model.name}</h3>
          <span className="chip">{kindName[model.type]}</span>
          <CopyButton text={model.id} label="Copy id" />
        </div>
        {model.description && <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-mist">{model.description}</p>}
        {model.capabilities && model.capabilities.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {model.capabilities.map((capability) => (
              <span key={capability} className="chip gap-1.5">
                <CapabilityIcon id={capability} className="size-3" />
                {capabilityLabel.get(capability)}
              </span>
            ))}
          </div>
        )}
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-mist">{label}</dt>
              <dd className="font-mono text-xs text-fog tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          {tryHref && (
            <Link href={tryHref} className="btn-primary px-4 py-2">
              Try in the playground
            </Link>
          )}
          <Link href={docsFor[model.type]} className="btn-ghost px-4 py-2">
            API reference
          </Link>
        </div>
      </div>
      {curl && (
        <div className="code-block self-start">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span className="font-mono text-[0.6875rem] tracking-wider text-mist uppercase">curl</span>
            <CopyButton text={curl} />
          </div>
          <pre className="text-xs whitespace-pre-wrap">{curl}</pre>
        </div>
      )}
    </div>
  );
}
