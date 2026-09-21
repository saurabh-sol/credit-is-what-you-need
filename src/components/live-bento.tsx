"use client";

import { memo, useEffect, useState } from "react";
import { ProviderLogo } from "@/components/model-logo";
import { prefersReducedMotion } from "@/components/motion/use-in-view";
import { formatCredits } from "@/lib/format";
import { featuredProviders } from "@/lib/providers";

// Small product vignettes that never sit still. Each one is its own memoized
// component, so its timer re-renders nothing but itself. All data is illustrative.

// Runs `step` every `ms`, unless the visitor asked for less motion.
function useLoop(step: () => void, ms: number) {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setInterval(step, ms);
    return () => clearInterval(timer);
    // `step` only uses state setters, so the first one is as good as any.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
}

const tasks = [
  { label: "Deployed a contract", credits: 500 },
  { label: "Swapped on a partner protocol", credits: 250 },
  { label: "Contract interaction", credits: 50 },
  { label: "Reached 50 transactions", credits: 300 },
  { label: "Gas-Back on 12 transactions", credits: 84 },
];

// The newest task keeps arriving at the top while the rest glide down a row.
export const TaskFeed = memo(function TaskFeed() {
  const [turn, setTurn] = useState(0);
  useLoop(() => setTurn((count) => count + 1), 2200);

  return (
    <div className="relative h-52 overflow-hidden" aria-hidden>
      {tasks.map((task, index) => {
        const row = (index + turn) % tasks.length;
        return (
          <div
            key={task.label}
            // The bottom row is parked out of sight; it fades in only after it has jumped back to the top.
            style={
              {
                "--row": row,
                opacity: row === tasks.length - 1 ? 0 : 1,
                transitionDelay: row === 0 ? "0s, 0.45s" : "0s",
              } as React.CSSProperties
            }
            className="shuffle-row flex h-13 items-center justify-between gap-4 border-b border-line/70 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className={`size-1.5 shrink-0 rounded-full ${row === 0 ? "bg-accent" : "bg-line"}`} />
              <span className="truncate">{task.label}</span>
            </span>
            <span className="font-mono text-accent">+{formatCredits(task.credits)}</span>
          </div>
        );
      })}
    </div>
  );
});

const prompts = [
  { maker: 0, text: "Audit this contract for reentrancy bugs", cost: 14 },
  { maker: 1, text: "Summarize today's governance proposals", cost: 9 },
  { maker: 2, text: "Write tests for my token vesting schedule", cost: 11 },
  { maker: 5, text: "Explain this failed transaction trace", cost: 3 },
];

// A prompt types itself, the model "thinks", the cost lands, and the next one starts.
export const PromptBar = memo(function PromptBar() {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<"typing" | "thinking" | "answered">("typing");
  const prompt = prompts[index];
  const maker = featuredProviders[prompt.maker];

  useEffect(() => {
    if (prefersReducedMotion()) {
      // No typing, no cycling: just the finished first exchange.
      const settle = setTimeout(() => {
        setTyped(prompt.text.length);
        setPhase("answered");
      }, 0);
      return () => clearTimeout(settle);
    }
    const next =
      phase === "typing"
        ? typed < prompt.text.length
          ? setTimeout(() => setTyped(typed + 1), 38)
          : setTimeout(() => setPhase("thinking"), 350)
        : phase === "thinking"
          ? setTimeout(() => setPhase("answered"), 1300)
          : setTimeout(() => {
              setIndex((index + 1) % prompts.length);
              setTyped(0);
              setPhase("typing");
            }, 2100);
    return () => clearTimeout(next);
  }, [phase, typed, index, prompt.text.length]);

  return (
    <div aria-hidden>
      <div className={`flex items-center gap-3 rounded-xl border border-line bg-ink px-4 py-3.5 ${phase === "thinking" ? "sweep" : ""}`}>
        <ProviderLogo key={maker.id} logo={maker.logo} className="pop-in size-5 text-fog" />
        <p className="min-w-0 flex-1 truncate font-mono text-sm">
          {prompt.text.slice(0, typed)}
          {phase === "typing" && <span className="caret" />}
        </p>
        <span className="chip hidden sm:inline-flex">{maker.name}</span>
      </div>
      <div className="mt-3 flex h-7 items-center gap-2 text-xs text-mist">
        {phase === "thinking" && <span className="breathe">Routing through your Kredit key</span>}
        {phase === "answered" && (
          <>
            <span className="chip pop-in text-accent">−{prompt.cost} credits</span>
            <span className="chip pop-in" style={{ animationDelay: "120ms" }}>
              x-kredit-balance: {formatCredits(2864 - prompt.cost)}
            </span>
          </>
        )}
      </div>
    </div>
  );
});

const keys = [
  { name: "Cursor", used: "in use now", live: true },
  { name: "Postman", used: "2 minutes ago", live: true },
  { name: "Old laptop", used: "revoked", live: false },
];

// Keys breathe while they are alive; now and then a credit notice springs in.
export const KeyStatus = memo(function KeyStatus() {
  const [notice, setNotice] = useState(0);
  useLoop(() => setNotice((count) => count + 1), 3400);
  const notices = ["Gas-Back +84", "Royalties +1,130", "Milestone +300"];
  const showing = notice % 2 === 1;

  return (
    <div className="relative" aria-hidden>
      <ul className="space-y-3 text-sm">
        {keys.map((key, index) => (
          <li key={key.name} className="flex items-center gap-3">
            <span
              style={{ animationDelay: `${index * 500}ms` }}
              className={`size-2 rounded-full ${key.live ? "breathe bg-accent" : "bg-danger/70"}`}
            />
            <span className={key.live ? "" : "text-mist line-through"}>{key.name}</span>
            <span className="ml-auto font-mono text-xs text-mist">{key.used}</span>
          </li>
        ))}
      </ul>
      {showing && (
        <p className="pop-in absolute -top-3 right-0 rounded-full border border-accent/30 bg-ink px-3 py-1 font-mono text-xs text-accent shadow-[0_10px_30px_-10px_rgb(0_0_0/0.9)]">
          {notices[Math.floor(notice / 2) % notices.length]}
        </p>
      )}
    </div>
  );
});

const headers = [
  ["HTTP/1.1", "200 OK"],
  ["content-type", "application/json"],
  ["x-kredit-credits-charged", "14"],
  ["x-kredit-balance", "2850"],
];

// The two billing headers take turns being pointed out.
export const HeaderFocus = memo(function HeaderFocus() {
  const [focus, setFocus] = useState(2);
  useLoop(() => setFocus((line) => (line === 2 ? 3 : 2)), 2600);

  return (
    <div className="font-mono text-sm" aria-hidden>
      {headers.map(([name, value], index) => (
        <p
          key={name}
          className={`-mx-3 flex flex-wrap gap-x-3 rounded-lg px-3 py-1.5 transition-colors duration-700 ${
            index === focus ? "bg-accent/10 text-fog" : "text-mist"
          }`}
        >
          <span>{name}{index > 0 && ":"}</span>
          <span className={index === focus ? "text-accent" : ""}>{value}</span>
        </p>
      ))}
      <p className="mt-3 h-5 font-sans text-xs text-mist transition-opacity duration-500">
        {focus === 2 ? "What this one call cost you." : "What you have left, without asking."}
      </p>
    </div>
  );
});

// Every maker whose models the gateway can route to, drifting past forever.
export const ModelStream = memo(function ModelStream() {
  return (
    <div className="marquee" aria-hidden>
      <div className="marquee-track">
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0">
            {featuredProviders.map((maker) => (
              <li key={maker.id} className="mx-2 flex items-center gap-2.5 rounded-full border border-line bg-ink py-2 pr-5 pl-3.5 text-sm whitespace-nowrap text-mist">
                <ProviderLogo logo={maker.logo} className="size-4.5 text-fog" />
                {maker.name}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
});
