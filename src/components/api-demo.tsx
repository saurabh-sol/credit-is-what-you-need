"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/components/code-block";
import { prefersReducedMotion, useInView } from "@/components/motion/use-in-view";
import { SITE_URL } from "@/lib/site";
import { demoSnippetNames as tabs, snippets, type SnippetName as Tab } from "@/lib/snippets";

// What the built-in test model really answers, headers included.
const response = `{ "role": "assistant", "content": "Kredit echo: hi" }`;

const useOrigin = () => SITE_URL;

// Colors double-quoted strings, including one that is still being typed.
function Highlighted({ text }: { text: string }) {
  return text.split(/("[^"\n]*"?)/).map((part, index) =>
    part.startsWith('"') ? (
      <span key={index} className="text-accent">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function ApiDemo() {
  const origin = useOrigin();
  const [ref, inView] = useInView<HTMLDivElement>("0px 0px -25% 0px");
  const [tab, setTab] = useState<Tab>("curl");
  const [typed, setTyped] = useState(0);
  const [run, setRun] = useState(0);

  const code = snippets[tab]({ origin });
  const done = typed >= code.length;

  // Type the request out once it is on screen, and again on tab change or replay.
  useEffect(() => {
    if (!inView) return;
    const length = snippets[tab]({ origin }).length;
    const step = prefersReducedMotion() ? length : 3;
    let count = 0;
    const timer = setInterval(() => {
      count = Math.min(count + step, length);
      setTyped(count);
      if (count === length) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [inView, tab, origin, run]);

  const restart = (next: Tab) => {
    setTyped(0);
    setTab(next);
    setRun((count) => count + 1);
  };

  return (
    <div ref={ref} className="card overflow-hidden shadow-[0_30px_80px_-30px_var(--shade)]">
      <div className="flex items-center gap-3 border-b border-line bg-raised/60 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-3 rounded-full bg-danger/70" />
          <span className="size-3 rounded-full bg-[#f4c132]/70" />
          <span className="size-3 rounded-full bg-accent/70" />
        </div>
        <div role="tablist" aria-label="Language" className="ml-2 flex min-w-0 gap-1 overflow-x-auto font-mono text-xs [scrollbar-width:none]">
          {tabs.map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={tab === name}
              onClick={() => restart(name)}
              className={`shrink-0 rounded-md px-2.5 py-1 whitespace-nowrap transition ${
                tab === name ? "bg-accent/15 text-accent" : "text-mist hover:text-fog"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 gap-1 font-mono text-xs">
          {/* Phones keep the room for the language tabs; tapping a tab replays anyway. */}
          <button onClick={() => restart(tab)} className="hidden rounded-md px-2.5 py-1 text-mist transition hover:text-fog sm:inline-flex">
            Replay
          </button>
          <CopyButton text={code} />
        </div>
      </div>

      {/* The untyped remainder stays in the layout, invisible, so nothing jumps. */}
      <pre className="overflow-x-auto p-5 font-mono text-sm leading-relaxed" aria-label={code}>
        <code aria-hidden>
          <Highlighted text={code.slice(0, typed)} />
          {!done && <span className="caret" />}
          <span className="untyped">{code.slice(typed)}</span>
        </code>
      </pre>

      <div
        className={`demo-response border-t border-line bg-ink/60 px-5 py-4 font-mono text-sm transition duration-700 ease-out-expo ${
          done ? "opacity-100" : "translate-y-1 opacity-0"
        }`}
      >
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist">
          <span className="flex items-center gap-2 text-accent">
            <span className="live-dot" /> 200 OK
          </span>
          <span>x-kredit-credits-charged: 1</span>
          <span>x-kredit-balance: 2863</span>
        </p>
        <p className="mt-2 overflow-x-auto whitespace-pre text-fog">
          <Highlighted text={response} />
        </p>
      </div>
    </div>
  );
}
