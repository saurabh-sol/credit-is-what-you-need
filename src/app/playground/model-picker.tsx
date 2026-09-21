"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, SearchIcon } from "@/components/icons";
import { ModelLogo } from "@/components/model-logo";
import type { Catalog } from "@/lib/catalog";
import { api } from "@/lib/use-fuel-account";

const SHOWN = 60;

export function ModelPicker({ value, onChange }: { value: string; onChange: (model: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
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

  const models = data?.models ?? [];
  const needle = query.trim().toLowerCase();
  const matches = models.filter((model) => `${model.id} ${model.name}`.toLowerCase().includes(needle));

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="field flex items-center gap-2.5 text-left"
      >
        <ModelLogo model={value} />
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{value}</span>
        <span className="text-xs text-mist">Change</span>
      </button>

      {open && (
        <div className="card absolute top-full right-0 left-0 z-20 mt-2 animate-modal-in overflow-hidden shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9)]">
          <label className="flex items-center gap-2 border-b border-line px-3.5 py-2.5 text-mist">
            <SearchIcon />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models"
              aria-label="Search models"
              className="w-full bg-transparent text-sm text-fog placeholder:text-mist focus:outline-none"
            />
          </label>
          <ul role="listbox" className="max-h-72 overflow-y-auto p-1.5">
            {matches.slice(0, SHOWN).map((model) => (
              <li key={model.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={model.id === value}
                  onClick={() => {
                    onChange(model.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-fog/5"
                >
                  <ModelLogo model={model.id} className="size-4.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{model.name}</span>
                    <span className="block truncate font-mono text-xs text-mist">{model.id}</span>
                  </span>
                  {model.id === value && <CheckIcon className="size-4 text-lime" />}
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="px-3 py-6 text-center text-sm text-mist">No model matches that.</li>}
            {matches.length > SHOWN && (
              <li className="px-3 py-2 text-center text-xs text-mist">
                {matches.length - SHOWN} more. Keep typing to narrow it down.
              </li>
            )}
          </ul>
          {data && !data.live && (
            <p className="border-t border-line px-3.5 py-2.5 text-xs leading-relaxed text-mist">
              This server has no AI provider connected yet, so only the test model answers.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
