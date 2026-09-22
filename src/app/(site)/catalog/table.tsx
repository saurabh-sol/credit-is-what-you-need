"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/code-block";
import { CheckIcon, CloseIcon, SearchIcon } from "@/components/icons";
import { MakerLogo, ModelLogo } from "@/components/model-logo";
import type { Capability, CatalogModel, CatalogPrice, ModelType } from "@/lib/catalog";
import { formatCredits } from "@/lib/format";
import { makerOf } from "@/lib/providers";
import { SITE_URL } from "@/lib/site";
import { snippets } from "@/lib/snippets";

// The catalog: every model the server can reach, in a table grouped by maker.
// Each maker is a row that folds its models away; a model row opens into its
// details. The filter bar sticks under the header. The page gives it the data.

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

// A typical turn: a 1,000-token prompt and a 500-token answer, the basis the
// cheapest/priciest sort compares on.
const TURN_IN = 1_000;
const TURN_OUT = 500;

function turnCost(price: CatalogPrice | null) {
  if (!price) return Infinity;
  if (price.per === "image") return price.credits;
  if (price.per === "second") return price.from;
  return (price.input * TURN_IN + price.output * TURN_OUT) / 1_000_000;
}

// Credits with the decimals a small number needs and none a big one does.
const credits = (value: number) => (value < 10 ? value.toFixed(2).replace(/\.?0+$/, "") : formatCredits(Math.round(value)));

const tokens = (count?: number) => (count ? (count >= 1_000_000 ? `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `${Math.round(count / 1000)}K`) : "");

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

// Cells share one grid, so the header lines up with every row.
const COLUMNS = "grid-cols-[minmax(0,1fr)_5.5rem_4.5rem] md:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_4rem_4.5rem] xl:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_4rem_7rem_3rem_6.5rem_6.5rem_4.5rem]";
const cell = "px-3 py-3 leading-5";
const num = `${cell} text-right font-mono text-xs tabular-nums whitespace-nowrap`;

// A dropdown that closes on a click outside or Escape.
function Menu({ label, active, children, width = "w-64" }: { label: React.ReactNode; active?: boolean; children: React.ReactNode; width?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`btn-ghost gap-1.5 px-3.5 py-2 text-xs whitespace-nowrap ${active ? "border-accent/55 text-fog" : ""}`}
      >
        {label}
        <ChevronIcon className={`size-3.5 text-mist transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`card absolute right-0 z-30 mt-2 ${width} animate-rise overflow-hidden p-1.5 shadow-[0_18px_40px_-20px_var(--shade,rgb(0_0_0/0.35))]`}>
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[0.8125rem] text-fog transition hover:bg-fog/5"
    >
      {children}
      {checked && <CheckIcon className="ml-auto size-3.5 text-accent" />}
    </button>
  );
}

const Mark = ({ value }: { value?: boolean }) =>
  value === undefined ? (
    <span className="text-mist/50">–</span>
  ) : value ? (
    <CheckIcon className="inline size-3.5 text-fog" />
  ) : (
    <CloseIcon className="inline size-3.5 text-mist/50" />
  );

export function CatalogTable({ makers, models, live }: { makers: Maker[]; models: CatalogModel[]; live: boolean }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ModelType | "all">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [makerQuery, setMakerQuery] = useState("");
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

  const makerMatches = makers.filter((entry) => !makerQuery || entry.name.toLowerCase().includes(makerQuery.toLowerCase()) || entry.id.includes(makerQuery.toLowerCase()));
  const filtering = kind !== "all" || picked.size > 0 || needs.size > 0 || needle;
  const allFolded = groups.length > 0 && groups.every((group) => folded.has(group.maker.id));

  return (
    <section className="mt-14" aria-label="Model catalog">
      {/* The filter bar stays under the site header while the table scrolls. */}
      <div className="sticky top-16 z-20 -mx-4 border-b border-line bg-ink/85 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <label className="field flex min-w-52 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-mist">
            <SearchIcon />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models and makers…"
              aria-label="Search models"
              className="w-full bg-transparent text-[0.8125rem] text-fog placeholder:text-mist focus:outline-none"
            />
          </label>
          <div role="radiogroup" aria-label="Kind of model" className="inline-flex overflow-x-auto rounded-lg border border-line bg-surface p-0.5">
            {KINDS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={kind === entry.id}
                onClick={() => setKind(entry.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors ${kind === entry.id ? "bg-raised text-fog shadow-[0_1px_2px_var(--shade)]" : "text-mist hover:text-fog"}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Menu label={picked.size ? `${picked.size} ${picked.size === 1 ? "maker" : "makers"}` : "Makers"} active={picked.size > 0} width="w-64">
              <label className="field mb-1.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-mist">
                <SearchIcon className="size-3.5" />
                <input
                  value={makerQuery}
                  onChange={(event) => setMakerQuery(event.target.value)}
                  placeholder="Search makers…"
                  aria-label="Search makers"
                  className="w-full bg-transparent text-xs text-fog placeholder:text-mist focus:outline-none"
                />
              </label>
              <div className="max-h-72 overflow-y-auto">
                <MenuItem checked={picked.size === 0} onClick={() => setPicked(new Set())}>
                  All makers
                </MenuItem>
                {makerMatches.map((entry) => (
                  <MenuItem key={entry.id} checked={picked.has(entry.id)} onClick={() => setPicked(toggle(picked, entry.id))}>
                    <MakerLogo maker={entry} className="size-4" />
                    <span className="truncate">{entry.name}</span>
                    <span className="font-mono text-[0.6875rem] text-mist tabular-nums">{entry.count}</span>
                  </MenuItem>
                ))}
              </div>
            </Menu>
            <Menu label={needs.size ? `${needs.size} ${needs.size === 1 ? "capability" : "capabilities"}` : "Capabilities"} active={needs.size > 0} width="w-56">
              <MenuItem checked={needs.size === 0} onClick={() => setNeeds(new Set())}>
                Any
              </MenuItem>
              {CAPABILITIES.map((entry) => (
                <MenuItem key={entry.id} checked={needs.has(entry.id)} onClick={() => setNeeds(toggle(needs, entry.id))}>
                  <CapabilityIcon id={entry.id} className="size-4 text-mist" />
                  {entry.label}
                </MenuItem>
              ))}
            </Menu>
            <Menu label={`Sort: ${SORTS.find((entry) => entry.id === sort)!.label}`} width="w-44">
              {SORTS.map((entry) => (
                <MenuItem key={entry.id} checked={sort === entry.id} onClick={() => setSort(entry.id)}>
                  {entry.label}
                </MenuItem>
              ))}
            </Menu>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-mist tabular-nums" role="status">
        <p>
          {filtered.length === models.length ? `${formatCredits(models.length)} models` : `${formatCredits(filtered.length)} of ${formatCredits(models.length)} models`} from{" "}
          {formatCredits(groups.length)} {groups.length === 1 ? "maker" : "makers"}. Prices are credits per million tokens; 1,000 credits = $1.
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
        {groups.length > 0 && (
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
        <p className="card mt-3 px-4 py-10 text-center text-sm text-mist">No model matches that.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
          <div className={`grid ${COLUMNS} border-b border-line font-mono text-[0.6875rem] tracking-wider text-mist uppercase`}>
            <div className={cell}>Model</div>
            <div className={num}>Input</div>
            <div className={num}>Output</div>
            <div className={`${num} hidden md:block`}>Context</div>
            <div className={`${cell} hidden xl:block`}>Capabilities</div>
            <div className={`${cell} hidden text-center xl:block`}>ZDR</div>
            <div className={`${cell} hidden text-center xl:block`}>No training</div>
            <div className={`${num} hidden xl:block`}>Released</div>
            <div className={`${cell} hidden md:block`} />
          </div>

          {groups.map((group) => {
            const shut = folded.has(group.maker.id);
            return (
              <div key={group.maker.id}>
                <button
                  type="button"
                  aria-expanded={!shut}
                  onClick={() => setFolded(toggle(folded, group.maker.id))}
                  className="flex w-full items-center gap-3 border-b border-line bg-raised/60 px-3 py-2.5 text-left transition hover:bg-raised"
                >
                  <ChevronIcon className={`size-4 text-mist transition ${shut ? "-rotate-90" : ""}`} />
                  <MakerLogo maker={group.maker} className="size-5" />
                  <span className="text-[0.8125rem] font-medium text-fog">{group.maker.name}</span>
                  <span className="font-mono text-[0.6875rem] text-mist tabular-nums">
                    {group.models.length} {group.models.length === 1 ? "model" : "models"}
                  </span>
                </button>

                {!shut &&
                  group.models.map((model) => {
                    const open = openId === model.id;
                    const mode = playgroundMode[model.type];
                    const tryable = mode && model.price !== null;
                    const price = model.price;
                    return (
                      <div key={model.id} className="border-b border-line last:border-b-0">
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
                          className={`grid ${COLUMNS} cursor-pointer items-center transition-colors hover:bg-fog/[0.03] ${open ? "bg-fog/[0.03]" : ""}`}
                        >
                          <div className={`${cell} flex min-w-0 items-center gap-2.5`}>
                            <ModelLogo model={model.id} className="size-4 text-mist" />
                            <span className="min-w-0">
                              <span className="block truncate font-mono text-[0.8125rem] text-fog">{model.id}</span>
                              <span className="block truncate text-[0.6875rem] text-mist md:hidden">{model.name}</span>
                            </span>
                          </div>
                          {price?.per === "million_tokens" ? (
                            <>
                              <div className={`${num} text-fog`}>{credits(price.input)}</div>
                              <div className={`${num} text-fog`}>{credits(price.output)}</div>
                            </>
                          ) : price?.per === "image" ? (
                            <>
                              <div className={`${num} text-fog`}>{credits(price.credits)}<span className="text-mist"> / img</span></div>
                              <div className={`${num} text-mist`}>–</div>
                            </>
                          ) : price?.per === "second" ? (
                            <>
                              <div className={`${num} text-fog`}>{credits(price.from)}<span className="text-mist"> / s</span></div>
                              <div className={`${num} text-mist`}>–</div>
                            </>
                          ) : (
                            <>
                              <div className={`${num} text-mist`}>–</div>
                              <div className={`${num} text-mist`}>–</div>
                            </>
                          )}
                          <div className={`${num} hidden text-mist md:block`}>{tokens(model.contextWindow) || "–"}</div>
                          <div className={`${cell} hidden items-center gap-1.5 text-mist xl:flex`}>
                            {model.capabilities?.slice(0, 4).map((capability) => (
                              <span key={capability} title={capabilityLabel.get(capability)}>
                                <CapabilityIcon id={capability} />
                              </span>
                            ))}
                            {(model.capabilities?.length ?? 0) > 4 && <span className="font-mono text-[0.6875rem]">+{model.capabilities!.length - 4}</span>}
                            {!model.capabilities?.length && <span className="text-mist/50">–</span>}
                          </div>
                          <div className={`${cell} hidden text-center xl:block`}>
                            <Mark value={model.zdr} />
                          </div>
                          <div className={`${cell} hidden text-center xl:block`}>
                            <Mark value={model.noTraining} />
                          </div>
                          <div className={`${num} hidden text-mist xl:block`}>{released(model.released) || "–"}</div>
                          <div className={`${cell} hidden text-right md:block`}>
                            {tryable ? (
                              <Link
                                href={`/playground?model=${encodeURIComponent(model.id)}&mode=${mode}`}
                                onClick={(event) => event.stopPropagation()}
                                className="btn-ghost px-2.5 py-1 text-xs"
                              >
                                Try
                              </Link>
                            ) : null}
                          </div>
                        </div>

                        {open && <ModelDetail model={model} tryHref={tryable ? `/playground?model=${encodeURIComponent(model.id)}&mode=${mode}` : null} />}
                      </div>
                    );
                  })}
              </div>
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
  facts.push(["Zero data retention", model.zdr === undefined ? "unknown" : model.zdr ? "yes" : "not on every route"]);
  facts.push(["Trains on prompts", model.noTraining === undefined ? "unknown" : model.noTraining ? "never" : "may"]);

  const curl = model.type === "language" ? snippets.curl({ origin: SITE_URL, model: model.id, message: "hi" }) : null;

  return (
    <div className="animate-rise grid gap-6 border-t border-line/60 bg-ink/40 px-4 py-5 md:grid-cols-[1.1fr_1fr] md:px-6">
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
