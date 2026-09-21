"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CopyButton } from "@/components/code-block";
import { ArrowRightIcon } from "@/components/icons";
import { ModelLogo } from "@/components/model-logo";
import { WalletButton } from "@/components/wallet-button";
import { formatCredits } from "@/lib/format";
import { PersonIcon } from "./icons";
import type { Failure, Turn } from "./types";

const starters = [
  "Explain gas fees to someone who has never used a blockchain.",
  "Write a Solidity function that splits a payment between three addresses.",
  "Summarize what an ERC-20 approval does, in two sentences.",
];

const facts = [
  ["Same gateway", "Requests take the route your API key takes, so what works here works in your code."],
  ["Same balance", "Replies are paid from your credits. Nothing to paste, no card to add."],
  ["Every cost shown", "Each reply lists its model, how long it took and what it cost."],
];

const link = "text-fog underline decoration-line underline-offset-4 transition-colors hover:decoration-accent";

// What to do about each failure the gateway can report.
function advice(code?: string) {
  switch (code) {
    case "insufficient_credits":
      return (
        <>
          <Link href="/dashboard/earn" className={link}>
            Earn credits
          </Link>{" "}
          from your on-chain activity or{" "}
          <Link href="/dashboard/credits" className={link}>
            buy credits
          </Link>
          , then send it again.
        </>
      );
    case "not_signed_in":
      return "Your session ended. Connect your wallet again, then resend.";
    case "rate_limit_exceeded":
      return "Wait a minute, then send it again.";
    case "provider_unreachable":
      return "Send it again, or pick another model in the panel.";
    default:
      return "Send it again. If it keeps failing, pick another model.";
  }
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function Row({ turn, streaming }: { turn: Turn; streaming: boolean }) {
  const mine = turn.role === "user";
  return (
    <article
      aria-label={mine ? "Your message" : `Reply from ${turn.model}`}
      className="flex gap-3.5 border-b border-line/60 py-5 last:border-b-0"
    >
      <span className={`grid size-7 shrink-0 place-items-center rounded-md border border-line bg-raised ${mine ? "text-mist" : "text-fog"}`}>
        {mine ? <PersonIcon className="size-3.5" /> : <ModelLogo model={turn.model ?? ""} className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`pt-1.5 text-xs leading-4 ${mine ? "font-medium text-fog" : "font-mono text-mist"}`}>
          {mine ? "You" : turn.model}
        </p>
        <p className="mt-1.5 text-[0.9375rem] leading-7 wrap-anywhere whitespace-pre-wrap text-fog">
          {turn.content}
          {streaming && <span className="caret" />}
        </p>

        {!mine && turn.ms !== undefined && (
          <footer className="mt-2.5 flex flex-wrap items-center gap-x-2 font-mono text-xs leading-5 text-mist">
            <span>{turn.model}</span>
            <span aria-hidden>·</span>
            <span>{seconds(turn.ms)}</span>
            {turn.stopped && (
              <>
                <span aria-hidden>·</span>
                <span>stopped</span>
              </>
            )}
            {turn.cost !== undefined && (
              <>
                <span aria-hidden>·</span>
                <span className="transition-opacity duration-500 motion-reduce:transition-none starting:opacity-0">
                  <span className="text-accent">−{formatCredits(turn.cost)}</span> credits
                </span>
              </>
            )}
            <CopyButton text={turn.content} className="-my-1 ml-auto" />
          </footer>
        )}
      </div>
    </article>
  );
}

function SignedOut() {
  return (
    <div className="my-auto py-10">
      <h1 className="page-title">Playground</h1>
      <p className="page-lede">
        Talk to any model on the gateway and watch what each reply costs. It spends your own credits, so it needs to
        know whose they are.
      </p>
      <dl className="mt-7 border-t border-line/60">
        {facts.map(([name, detail]) => (
          <div key={name} className="grid gap-x-6 gap-y-0.5 border-b border-line/60 py-3 text-[0.8125rem] leading-relaxed sm:grid-cols-[9rem_1fr]">
            <dt className="text-fog">{name}</dt>
            <dd className="text-mist">{detail}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
        <WalletButton label="Connect wallet" />
        <p className="text-xs text-mist">Signing in is a free signature. It costs no gas.</p>
      </div>
    </div>
  );
}

function Starters({ disabled, onPick }: { disabled: boolean; onPick: (text: string) => void }) {
  return (
    <div className="my-auto py-10">
      <h1 className="page-title">Playground</h1>
      <p className="page-lede">
        The same gateway your API key uses, paid from the same balance. Pick a model, ask something, and see what the
        reply cost.
      </p>
      <h2 className="section-label mt-8">Start with</h2>
      <ul>
        {starters.map((starter) => (
          <li key={starter} className="border-b border-line/60">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(starter)}
              className="group flex w-full items-center gap-4 py-3 text-left text-sm text-mist transition-colors hover:text-fog disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">{starter}</span>
              <ArrowRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type TranscriptProps = {
  state: "loading" | "signed-out" | "ready";
  turns: Turn[];
  busy: boolean;
  blocked: boolean;
  error: Failure | null;
  onPick: (text: string) => void;
};

export function Transcript({ state, turns, busy, blocked, error, onPick }: TranscriptProps) {
  const scroller = useRef<HTMLDivElement>(null);
  // Whether the reader is at the bottom. Streamed text only pulls the view down while they are.
  const pinned = useRef(true);
  const count = useRef(0);

  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    // A new turn always comes into view, even if the reader had scrolled up.
    if (turns.length !== count.current) {
      count.current = turns.length;
      pinned.current = true;
    }
    if (pinned.current) box.scrollTop = box.scrollHeight;
  }, [turns, error]);

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const box = event.currentTarget;
        pinned.current = box.scrollHeight - box.scrollTop - box.clientHeight < 64;
      }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6"
    >
      <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col">
        {state === "signed-out" && <SignedOut />}
        {state === "ready" && turns.length === 0 && <Starters disabled={blocked || busy} onPick={onPick} />}

        {turns.length > 0 && (
          <div className="py-2">
            {turns.map((turn, index) => (
              <Row key={turn.id} turn={turn} streaming={busy && index === turns.length - 1 && turn.role === "assistant"} />
            ))}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-5 flex gap-3.5 border-t border-danger/40 pt-4 text-[0.8125rem] leading-relaxed">
            {/* Sits in the avatar column, so the words line up with the turns above. */}
            <span className="grid h-5 w-7 shrink-0 place-items-center" aria-hidden>
              <span className="size-1.5 rounded-full bg-danger" />
            </span>
            <p className="min-w-0 text-mist">
              <span className="block text-danger">{error.message}</span>
              {advice(error.code)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
