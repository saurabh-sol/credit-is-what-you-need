"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { MakerLogo, ModelLogo } from "@/components/model-logo";
import type { CatalogModel, CatalogPrice, ModelType } from "@/lib/catalog";
import { formatCredits } from "@/lib/format";
import { makerOf } from "@/lib/providers";

// Every model on this server: the makers as a grid of marks, then the models
// themselves, searchable and filterable by kind. The page gives it the data;
// only the filtering happens here.

export type Maker = { id: string; name: string; logo?: string; count: number };

const KINDS: { id: ModelType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "language", label: "Chat" },
  { id: "embedding", label: "Embeddings" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "evaluation", label: "Evaluation" },
];

const kindName: Record<ModelType, string> = { language: "chat", embedding: "embedding", image: "image", video: "video", evaluation: "evaluation", other: "other" };

// A model's price in a few words, in the unit it is sold by.
function priceLine(price: CatalogPrice | null) {
  if (!price) return "not for sale here";
  if (price.per === "image") return `${formatCredits(price.credits)} per image`;
  if (price.per === "second") return `from ${formatCredits(price.from)} per second`;
  return `${formatCredits(price.input)} in · ${formatCredits(price.output)} out / M tokens`;
}

const context = (tokens?: number) => (tokens ? `${tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `${Math.round(tokens / 1000)}K`}` : "");

export function ModelCatalog({ makers, models, echo }: { makers: Maker[]; models: CatalogModel[]; echo: string }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ModelType | "all">("all");
  const [maker, setMaker] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      models.filter(
        (model) =>
          (kind === "all" || model.type === kind) &&
          (!maker || makerOf(model.id) === maker) &&
          (!needle || `${model.id} ${model.name}`.toLowerCase().includes(needle)),
      ),
    [models, kind, maker, needle],
  );

  // Drawn grouped by maker, in the makers' order.
  const groups = useMemo(() => {
    const byMaker = new Map<string, CatalogModel[]>();
    for (const model of shown) {
      const id = makerOf(model.id);
      byMaker.set(id, [...(byMaker.get(id) ?? []), model]);
    }
    return makers.filter((entry) => byMaker.has(entry.id)).map((entry) => ({ maker: entry, models: byMaker.get(entry.id)!.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [shown, makers]);

  return (
    <>
      {/* Cells draw their own right and bottom rules, so an uneven last row leaves no filler block. */}
      <ul className="mt-4 grid list-none grid-cols-2 overflow-hidden rounded-xl border border-line p-0 sm:grid-cols-3 lg:grid-cols-4 [&>li]:-mr-px [&>li]:-mb-px [&>li]:border-r [&>li]:border-b [&>li]:border-line">
        {makers.map((entry) => {
          const active = maker === entry.id;
          return (
            <li key={entry.id} className="m-0 max-w-none">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setMaker(active ? null : entry.id)}
                className={`group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${active ? "bg-accent/10" : "hover:bg-fog/[0.03]"}`}
              >
                {entry.id === "kredit" ? (
                  <ModelLogo model={echo} className="size-5" />
                ) : (
                  <MakerLogo maker={entry} className={`size-5 transition-colors ${active ? "text-fog" : "text-mist group-hover:text-fog"}`} />
                )}
                <span className="min-w-0 leading-5">
                  <span className="block truncate text-[0.8125rem] font-medium text-fog">{entry.name}</span>
                  <span className="block truncate font-mono text-xs text-mist tabular-nums">
                    {entry.id === "kredit" ? "echo · always on" : `${formatCredits(entry.count)} ${entry.count === 1 ? "model" : "models"}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-mist">
        Logos belong to their owners and only show whose models can be reached. Click a maker to see just its models.
      </p>

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
      </div>

      <p className="mt-3 text-xs text-mist tabular-nums" role="status">
        {shown.length === models.length ? `${formatCredits(models.length)} models.` : `${formatCredits(shown.length)} of ${formatCredits(models.length)} models.`}
        {maker && (
          <>
            {" "}
            <button type="button" onClick={() => setMaker(null)} className="underline decoration-line underline-offset-4 hover:text-fog">
              Show every maker
            </button>
          </>
        )}
      </p>

      {groups.length === 0 ? (
        <p className="card mt-3 px-4 py-6 text-center text-xs text-mist">No model matches that.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          {groups.map((group) => (
            <section key={group.maker.id} aria-label={group.maker.name}>
              <div role="heading" aria-level={3} className="flex items-center justify-between border-b border-line bg-surface px-4 py-2 text-[0.6875rem] font-medium tracking-wide text-mist uppercase">
                <span>{group.maker.name}</span>
                <span className="font-mono tabular-nums normal-case">{group.models.length}</span>
              </div>
              <ul className="m-0 list-none divide-y divide-line p-0">
                {group.models.map((model) => (
                  <li key={model.id} className="m-0 flex max-w-none items-center gap-3 px-4 py-2.5 leading-5">
                    <ModelLogo model={model.id} className="size-4 text-mist" />
                    <span className="min-w-0 flex-1 leading-5">
                      <span className="block truncate text-[0.8125rem] text-fog">{model.name}</span>
                      <span className="block truncate font-mono text-[0.6875rem] text-mist">{model.id}</span>
                    </span>
                    <span className="hidden shrink-0 font-mono text-[0.6875rem] text-mist sm:block">{kindName[model.type]}</span>
                    {model.contextWindow && <span className="hidden w-12 shrink-0 text-right font-mono text-[0.6875rem] text-mist tabular-nums md:block">{context(model.contextWindow)}</span>}
                    <span className="shrink-0 text-right font-mono text-[0.6875rem] whitespace-nowrap text-mist tabular-nums">{priceLine(model.price)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
