"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, SearchIcon } from "@/components/icons";
import { ModelLogo } from "@/components/model-logo";
import type { Catalog, CatalogModel, CatalogPrice, ModelType } from "@/lib/catalog";
import { formatCredits } from "@/lib/format";
import { makerInfo, makerOf } from "@/lib/providers";
import { api } from "@/lib/use-kredit-account";
import { ChevronDownIcon } from "./icons";

// The makers people look for first; the rest follow by how many models they have.
const FIRST = ["kredit", "openai", "anthropic", "google", "x-ai", "meta-llama", "mistralai", "deepseek", "qwen", "moonshotai", "z-ai", "minimax"];

// The list, grouped by maker: the big names first, then the rest by size, each
// maker's models in alphabetical order.
function grouped(models: CatalogModel[]) {
  const byMaker = new Map<string, CatalogModel[]>();
  for (const model of models) {
    const maker = makerOf(model.id);
    byMaker.set(maker, [...(byMaker.get(maker) ?? []), model]);
  }
  const rank = (maker: string) => (FIRST.includes(maker) ? FIRST.indexOf(maker) - FIRST.length : 0);
  return [...byMaker.entries()]
    .sort(([a, as], [b, bs]) => rank(a) - rank(b) || bs.length - as.length || a.localeCompare(b))
    .map(([maker, list]) => ({ maker: makerInfo(maker), models: list.sort((a, b) => a.name.localeCompare(b.name)) }));
}

// A model's price in a few words, in the unit it is sold by.
function priceLine(price: CatalogPrice | null) {
  if (!price) return "price unknown";
  if (price.per === "image") return `${formatCredits(price.credits)} per image`;
  if (price.per === "second") return `from ${formatCredits(price.from)} per second`;
  return `${formatCredits(price.input)} in · ${formatCredits(price.output)} out per M tokens`;
}

type ModelPickerProps = { value: string; onChange: (model: string) => void; type?: ModelType };

export function ModelPicker({ value, onChange, type = "language" }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The row the arrow keys are on; Enter picks it.
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const { data } = useQuery({ queryKey: ["models"], queryFn: () => api<Catalog>("/api/models"), staleTime: 600_000 });

  // Close on a click outside or Escape.
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

  // Keep the keyboard's row in view as it moves through a long list.
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Only models of the kind the page is making, and only ones with a known price.
  const models = (data?.models ?? []).filter((model) => model.type === type && model.price !== null);
  const needle = query.trim().toLowerCase();
  const matches = models.filter((model) => `${model.id} ${model.name}`.toLowerCase().includes(needle));
  const groups = grouped(matches);
  const shown = groups.flatMap((group) => group.models); // in the order they are drawn, for the arrow keys
  const current = models.find((model) => model.id === value);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${value}. Change model`}
        onClick={() => setOpen(!open)}
        className="field flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-raised text-fog">
          <ModelLogo model={value} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.8125rem] leading-5">{current?.name ?? value.split("/").pop()}</span>
          <span className="block truncate font-mono text-[0.6875rem] leading-4 text-mist">{value}</span>
        </span>
        <ChevronDownIcon className={`size-4 text-mist transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="panel absolute top-full right-0 left-0 z-20 mt-1.5 animate-modal-in overflow-hidden bg-raised shadow-[0_24px_48px_-16px_var(--shade)]">
          <label className="flex items-center gap-2 border-b border-line px-3 py-2 text-mist">
            <SearchIcon />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const step = event.key === "ArrowDown" ? 1 : -1;
                  setActive((row) => Math.min(Math.max(row + step, 0), Math.max(shown.length - 1, 0)));
                } else if (event.key === "Enter" && shown[active]) {
                  event.preventDefault();
                  pick(shown[active].id);
                }
              }}
              placeholder={models.length > 1 ? `Search ${models.length} models` : "Search models"}
              aria-label="Search models"
              className="w-full bg-transparent text-[0.8125rem] text-fog placeholder:text-mist focus:outline-none"
            />
          </label>
          <ul ref={list} role="listbox" aria-label="Models" className="max-h-96 overflow-y-auto p-1">
            {groups.map((group) => (
              <li key={group.maker.id}>
                <div className="sticky top-0 z-10 flex items-center justify-between bg-raised px-2 pt-2 pb-1 text-[0.6875rem] font-medium tracking-wide text-mist uppercase">
                  <span>{group.maker.name}</span>
                  <span className="font-mono tabular-nums normal-case">{group.models.length}</span>
                </div>
                <ul>
                  {group.models.map((model) => {
                    const row = shown.indexOf(model);
                    return (
                      <li key={model.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={model.id === value}
                          data-row={row}
                          onClick={() => pick(model.id)}
                          onPointerMove={() => setActive(row)}
                          className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${row === active ? "bg-fog/6" : ""}`}
                        >
                          <ModelLogo model={model.id} className="size-4" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.8125rem] leading-5">{model.name}</span>
                            <span className="block truncate font-mono text-[0.6875rem] leading-4 text-mist">
                              {model.id} · {priceLine(model.price)}
                            </span>
                          </span>
                          {model.id === value && <CheckIcon className="size-3.5 text-accent" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {!data && <li className="px-3 py-6 text-center text-xs text-mist">Loading models</li>}
            {data && matches.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-mist">
                {models.length === 0 ? `No ${type} models on this server.` : "No model matches that."}
              </li>
            )}
          </ul>
        </div>
      )}

      {data && !data.live && (
        <p className="mt-2.5 text-xs leading-relaxed text-mist">
          This server has no AI provider connected yet, so only the test model answers.
        </p>
      )}
      {value === "kredit/echo" && (
        <p className="mt-2.5 text-xs leading-relaxed text-mist">
          <span className="font-mono text-fog">kredit/echo</span> repeats your message and is billed by length, like a real
          model. It is the cheapest way to see the whole loop work.
        </p>
      )}
    </div>
  );
}
