"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/code-block";
import { SearchIcon } from "@/components/icons";
import { MakerLogo, ModelLogo } from "@/components/model-logo";
import type { CatalogModel, CatalogPrice, ModelType } from "@/lib/catalog";
import { formatCredits } from "@/lib/format";
import { makerOf } from "@/lib/providers";

// The public model board: every model the server can reach, searchable,
// filterable by kind and maker, sortable by the price of a typical turn, with
// a way straight into the playground. The page gives it the data.

export type Maker = { id: string; name: string; logo?: string; count: number };

const KINDS: { id: ModelType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "language", label: "Chat" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "embedding", label: "Embeddings" },
  { id: "evaluation", label: "Evaluation" },
];

// A typical turn: a 1,000-token prompt and a 500-token answer. The same basis
// other catalogs quote, so prices can be compared.
export const TURN_IN = 1_000;
export const TURN_OUT = 500;

// What one typical unit costs: a turn, a picture, or a second of video.
export function unitPrice(price: CatalogPrice | null): { credits: number; unit: string } | null {
  if (!price) return null;
  if (price.per === "image") return { credits: price.credits, unit: "per image" };
  if (price.per === "second") return { credits: price.from, unit: "per second" };
  return { credits: (price.input * TURN_IN + price.output * TURN_OUT) / 1_000_000, unit: "per turn" };
}

const perMillion = (price: CatalogPrice | null) =>
  price?.per === "million_tokens" ? `${formatCredits(price.input)} in · ${formatCredits(price.output)} out / M tokens` : "";

const shown = (credits: number) => (credits < 1 ? credits.toFixed(2).replace(/\.?0+$/, "") : formatCredits(Math.round(credits)));

const context = (tokens?: number) =>
  tokens ? `${tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `${Math.round(tokens / 1000)}K`} ctx` : "";

const playgroundMode: Partial<Record<ModelType, string>> = { language: "text", image: "image", video: "video", evaluation: "evaluate" };

type Sort = "maker" | "cheapest" | "priciest";

export function ModelsBoard({ makers, models, live }: { makers: Maker[]; models: CatalogModel[]; live: boolean }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ModelType | "all">("all");
  const [maker, setMaker] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("maker");

  const needle = query.trim().toLowerCase();
  const list = useMemo(() => {
    const filtered = models.filter(
      (model) =>
        (kind === "all" || model.type === kind) &&
        (!maker || makerOf(model.id) === maker) &&
        (!needle || `${model.id} ${model.name}`.toLowerCase().includes(needle)),
    );
    if (sort === "maker") {
      const rank = new Map(makers.map((entry, index) => [entry.id, index]));
      return filtered.sort((a, b) => (rank.get(makerOf(a.id)) ?? 0) - (rank.get(makerOf(b.id)) ?? 0) || a.name.localeCompare(b.name));
    }
    const cost = (model: CatalogModel) => unitPrice(model.price)?.credits ?? Infinity;
    return filtered.sort((a, b) => (sort === "cheapest" ? cost(a) - cost(b) : cost(b) - cost(a)) || a.name.localeCompare(b.name));
  }, [models, makers, kind, maker, needle, sort]);

  if (!live) return null;

  return (
    <section className="mt-10" aria-label="Model catalog">
      <ul className="grid list-none grid-cols-2 overflow-hidden rounded-xl border border-line p-0 sm:grid-cols-3 lg:grid-cols-6 [&>li]:-mr-px [&>li]:-mb-px [&>li]:border-r [&>li]:border-b [&>li]:border-line">
        {makers.map((entry) => {
          const active = maker === entry.id;
          return (
            <li key={entry.id} className="m-0">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setMaker(active ? null : entry.id)}
                className={`group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${active ? "bg-accent/10" : "hover:bg-fog/[0.03]"}`}
              >
                <MakerLogo maker={entry} className={`size-5 transition-colors ${active ? "text-fog" : "text-mist group-hover:text-fog"}`} />
                <span className="min-w-0 leading-5">
                  <span className="block truncate text-[0.8125rem] font-medium text-fog">{entry.name}</span>
                  <span className="block truncate font-mono text-xs text-mist tabular-nums">
                    {formatCredits(entry.count)} {entry.count === 1 ? "model" : "models"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-mist">Logos belong to their owners and only show whose models can be reached. Click a maker to see just its models.</p>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <label className="field flex min-w-56 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-mist">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${formatCredits(models.length)} models`}
            aria-label="Search models"
            className="w-full bg-transparent text-[0.8125rem] text-fog placeholder:text-mist focus:outline-none"
          />
        </label>
        <div role="radiogroup" aria-label="Kind of model" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {KINDS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={kind === entry.id}
              onClick={() => setKind(entry.id)}
              className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${kind === entry.id ? "bg-raised text-fog shadow-[0_1px_2px_var(--shade)]" : "text-mist hover:text-fog"}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <label className="field flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-mist">
          Sort
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort models" className="bg-transparent text-fog focus:outline-none">
            <option value="maker">by maker</option>
            <option value="cheapest">cheapest first</option>
            <option value="priciest">priciest first</option>
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs text-mist tabular-nums" role="status">
        {list.length === models.length ? `${formatCredits(models.length)} models.` : `${formatCredits(list.length)} of ${formatCredits(models.length)} models.`}{" "}
        A turn is a {formatCredits(TURN_IN)}-token prompt with a {TURN_OUT}-token answer.
        {maker && (
          <>
            {" "}
            <button type="button" onClick={() => setMaker(null)} className="underline decoration-line underline-offset-4 hover:text-fog">
              Show every maker
            </button>
          </>
        )}
      </p>

      {list.length === 0 ? (
        <p className="card mt-3 px-4 py-6 text-center text-xs text-mist">No model matches that.</p>
      ) : (
        <ul className="mt-3 m-0 list-none divide-y divide-line overflow-hidden rounded-xl border border-line p-0">
          {list.map((model) => {
            const unit = unitPrice(model.price);
            const mode = playgroundMode[model.type];
            return (
              <li key={model.id} className="m-0 flex items-center gap-3 px-4 py-2.5 leading-5">
                <ModelLogo model={model.id} className="size-4 shrink-0 text-mist" />
                <span className="min-w-0 flex-1 leading-5">
                  <span className="block truncate text-[0.8125rem] text-fog">{model.name}</span>
                  <span className="flex items-center gap-1.5 font-mono text-[0.6875rem] text-mist">
                    <span className="truncate">{model.id}</span>
                    <CopyButton text={model.id} />
                  </span>
                </span>
                <span className="hidden w-20 shrink-0 font-mono text-[0.6875rem] text-mist md:block">{model.type === "language" ? "chat" : model.type}</span>
                <span className="hidden w-16 shrink-0 text-right font-mono text-[0.6875rem] text-mist tabular-nums lg:block">{context(model.contextWindow)}</span>
                <span className="hidden w-52 shrink-0 text-right font-mono text-[0.6875rem] text-mist tabular-nums xl:block">{perMillion(model.price)}</span>
                <span className="w-28 shrink-0 text-right font-mono text-xs whitespace-nowrap text-fog tabular-nums">
                  {unit ? (
                    <>
                      {shown(unit.credits)} <span className="text-mist">{unit.unit}</span>
                    </>
                  ) : (
                    <span className="text-mist">not routable</span>
                  )}
                </span>
                {mode && unit ? (
                  <Link
                    href={`/playground?model=${encodeURIComponent(model.id)}&mode=${mode}`}
                    className="btn-ghost shrink-0 px-2.5 py-1 text-xs whitespace-nowrap"
                  >
                    Try
                  </Link>
                ) : (
                  <span className="w-11 shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
