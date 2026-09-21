"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { prefersReducedMotion, useInView } from "@/components/motion/use-in-view";

const KEY = "fuel_sk_••••••••";

const snippets = {
  curl: (origin: string) => `curl ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "fuel/echo", "messages": [{ "role": "user", "content": "hi" }] }'`,
  Python: (origin: string) => `from openai import OpenAI

client = OpenAI(base_url="${origin}/v1", api_key="${KEY}")
reply = client.chat.completions.create(
    model="fuel/echo",
    messages=[{"role": "user", "content": "hi"}],
)
print(reply.choices[0].message.content)`,
  Node: (origin: string) => `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${origin}/v1", apiKey: "${KEY}" });
const reply = await client.chat.completions.create({
  model: "fuel/echo",
  messages: [{ role: "user", content: "hi" }],
});
console.log(reply.choices[0].message.content);`,
};

type Tab = keyof typeof snippets;
const tabs = Object.keys(snippets) as Tab[];

// What the built-in test model really answers, headers included.
const response = `{ "role": "assistant", "content": "Fuel echo: hi" }`;

const subscribe = () => () => {};
const useOrigin = () =>
  useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "https://your-fuel-host",
  );

// Colors double-quoted strings, including one that is still being typed.
function Highlighted({ text }: { text: string }) {
  return text.split(/("[^"\n]*"?)/).map((part, index) =>
    part.startsWith('"') ? (
      <span key={index} className="text-lime">
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
  const [copied, setCopied] = useState(false);

  const code = snippets[tab](origin);
  const done = typed >= code.length;

  // Type the request out once it is on screen, and again on tab change or replay.
  useEffect(() => {
    if (!inView) return;
    const length = snippets[tab](origin).length;
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

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div ref={ref} className="card overflow-hidden shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]">
      <div className="flex items-center gap-3 border-b border-line bg-raised/60 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-3 rounded-full bg-danger/70" />
          <span className="size-3 rounded-full bg-[#f4c132]/70" />
          <span className="size-3 rounded-full bg-lime/70" />
        </div>
        <div role="tablist" aria-label="Language" className="ml-2 flex gap-1 font-mono text-xs">
          {tabs.map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={tab === name}
              onClick={() => restart(name)}
              className={`rounded-md px-2.5 py-1 transition ${
                tab === name ? "bg-lime/15 text-lime" : "text-mist hover:text-fog"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1 font-mono text-xs">
          <button onClick={() => restart(tab)} className="rounded-md px-2.5 py-1 text-mist transition hover:text-fog">
            Replay
          </button>
          <button onClick={copy} className="rounded-md px-2.5 py-1 text-mist transition hover:text-fog">
            <span aria-live="polite">{copied ? "Copied ✓" : "Copy"}</span>
          </button>
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
          <span className="flex items-center gap-2 text-lime">
            <span className="live-dot" /> 200 OK
          </span>
          <span>x-fuel-credits-charged: 1</span>
          <span>x-fuel-balance: 2863</span>
        </p>
        <p className="mt-2 overflow-x-auto whitespace-pre text-fog">
          <Highlighted text={response} />
        </p>
      </div>
    </div>
  );
}
