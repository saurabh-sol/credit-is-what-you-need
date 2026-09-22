"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { allPages, docHref } from "./nav";

// Finds pages by title, description or group. Opens with the button or ⌘K / Ctrl K.
export function DocsSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Opening always starts from an empty query.
  const show = () => {
    setQuery("");
    setCursor(0);
    setOpen(true);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) setOpen(false);
        else show();
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Focus once the dialog has painted.
    const timer = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allPages.slice(0, 8);
    return allPages
      .filter((page) => `${page.title} ${page.description} ${page.group}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [query]);

  return (
    <>
      <button type="button" onClick={show} className="docs-search" aria-label="Search the docs">
        <SearchIcon className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">Search docs…</span>
        <kbd className="kbd hidden sm:inline-flex" aria-hidden>
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search the documentation"
          className="fixed inset-0 z-50 flex items-start justify-center bg-fog/30 p-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-ink shadow-[0_30px_80px_-30px_var(--shade)] animate-modal-in"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-line px-4">
              <SearchIcon className="size-4 shrink-0 text-mist" />
              <input
                ref={input}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCursor(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setCursor((value) => Math.min(value + 1, results.length - 1));
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setCursor((value) => Math.max(value - 1, 0));
                  }
                  if (event.key === "Enter" && results[cursor]) {
                    setOpen(false);
                    router.push(docHref(results[cursor].slug));
                  }
                }}
                placeholder="Search pages"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-mist"
              />
              <kbd className="kbd" aria-hidden>
                esc
              </kbd>
            </div>
            <ul className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-mist">No page matches that.</li>}
              {results.map((page, index) => (
                <li key={page.slug}>
                  <Link
                    href={docHref(page.slug)}
                    onClick={() => setOpen(false)}
                    onMouseEnter={() => setCursor(index)}
                    aria-current={index === cursor ? "true" : undefined}
                    className="block rounded-lg px-3 py-2 transition-colors aria-[current]:bg-fog/5"
                  >
                    <span className="block text-sm font-medium text-fog">{page.title}</span>
                    <span className="block truncate text-xs text-mist">
                      {page.group} · {page.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
