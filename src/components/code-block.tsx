"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs transition active:scale-95 ${
        copied ? "text-accent" : "text-mist hover:text-fog"
      } ${className}`}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

// Colors double-quoted strings and # / // comments; enough to make a snippet scannable.
function highlight(code: string) {
  return code.split(/("[^"\n]*"|(?:^|\s)(?:#|\/\/)[^\n]*)/gm).map((part, index) => {
    if (part.startsWith('"')) {
      return (
        <span key={index} className="text-accent">
          {part}
        </span>
      );
    }
    if (/^\s*(#|\/\/)/.test(part)) {
      return (
        <span key={index} className="text-mist">
          {part}
        </span>
      );
    }
    return part;
  });
}

export function CodeBlock({ code, title }: { code: string; title?: string }) {
  return (
    <div className="code-block">
      <div className="flex items-center justify-between border-b border-line bg-raised/50 py-1.5 pr-2 pl-4">
        <span className="font-mono text-xs text-mist">{title}</span>
        <CopyButton text={code} />
      </div>
      <pre>
        <code>{highlight(code)}</code>
      </pre>
    </div>
  );
}

// The same snippet in several languages; remembers nothing, the first tab wins.
export function CodeTabs({ tabs }: { tabs: { name: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  const { code } = tabs[active];
  return (
    <div className="code-block">
      <div className="flex items-center justify-between border-b border-line bg-raised/50 py-1.5 pr-2 pl-2">
        <div role="tablist" className="flex gap-1 font-mono text-xs">
          {tabs.map((tab, index) => (
            <button
              key={tab.name}
              role="tab"
              type="button"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={`rounded-md px-2.5 py-1 transition ${
                index === active ? "bg-accent/15 text-accent" : "text-mist hover:text-fog"
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
        <CopyButton text={code} />
      </div>
      <pre>
        <code>{highlight(code)}</code>
      </pre>
    </div>
  );
}
