"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CopyButton } from "@/components/code-block";
import { ArrowRightIcon } from "@/components/icons";
import { ModelLogo } from "@/components/model-logo";
import { WalletButton } from "@/components/wallet-button";
import { formatCredits } from "@/lib/format";
import { PaperclipIcon, PersonIcon, SpeakerIcon } from "./icons";
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
  ["Kept for you", "Conversations are saved to your wallet and follow you across devices, until you delete them."],
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

// Reads a reply aloud with the browser's own voice; nothing leaves the page.
function ReadAloud({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const able = useSyncExternalStore(() => () => {}, () => "speechSynthesis" in window, () => false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  if (!able) return null;
  return (
    <button
      type="button"
      aria-pressed={speaking}
      title={speaking ? "Stop reading" : "Read aloud"}
      onClick={() => {
        if (speaking) {
          window.speechSynthesis.cancel();
          setSpeaking(false);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        setSpeaking(true);
      }}
      className={`-my-1 inline-flex size-6 items-center justify-center rounded-md transition-colors hover:text-fog ${speaking ? "text-accent" : ""}`}
    >
      <SpeakerIcon className="size-3.5" />
    </button>
  );
}

// What you send sits on the right as a bubble; what the model says comes back on the left.
function Row({ turn, streaming, compact }: { turn: Turn; streaming: boolean; compact?: boolean }) {
  const mine = turn.role === "user";
  if (mine) {
    return (
      <article aria-label="Your message" className="flex flex-row-reverse gap-3.5 py-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-raised text-mist">
          <PersonIcon className="size-3.5" />
        </span>
        <div className="flex min-w-0 max-w-[85%] flex-col items-end">
          {turn.attachments && turn.attachments.length > 0 && (
            <ul className="mb-1.5 flex flex-wrap justify-end gap-1.5">
              {turn.attachments.map((name, index) => (
                <li key={`${name}-${index}`} className="flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[0.6875rem] text-mist">
                  <PaperclipIcon className="size-3" />
                  {name}
                </li>
              ))}
            </ul>
          )}
          <p className="rounded-2xl rounded-tr-md border border-line bg-raised px-4 py-2.5 text-[0.9375rem] leading-7 wrap-anywhere whitespace-pre-wrap text-fog">
            {turn.content}
          </p>
        </div>
      </article>
    );
  }
  return (
    <article
      aria-label={`Reply from ${turn.model}`}
      className={`flex gap-3.5 py-5 ${compact ? "" : "border-b border-line/60 last:border-b-0"}`}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-raised text-fog">
        <ModelLogo model={turn.model ?? ""} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="pt-1.5 font-mono text-xs leading-4 text-mist">{turn.model}</p>
        {turn.attachments && turn.attachments.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {turn.attachments.map((name, index) => (
              <li key={`${name}-${index}`} className="flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[0.6875rem] text-mist">
                <PaperclipIcon className="size-3" />
                {name}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[0.9375rem] leading-7 wrap-anywhere whitespace-pre-wrap text-fog">
          {turn.content}
          {streaming && <span className="caret" />}
        </p>

        {turn.ms !== undefined && (
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
            <span className="ml-auto flex items-center gap-1">
              <ReadAloud text={turn.content} />
              <CopyButton text={turn.content} className="-my-1" />
            </span>
          </footer>
        )}
      </div>
    </article>
  );
}

function SignedOut() {
  return (
    <div className="my-auto py-10">
      <h1 className="page-title">Workspace</h1>
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
      <h1 className="page-title">Workspace</h1>
      <p className="page-lede">
        The same gateway your API key uses, paid from the same balance. Pick a model, ask something, and see what the
        reply cost. Switch models mid-conversation, or compare two side by side.
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

// Consecutive replies that share a group (compare mode) are drawn side by side.
type Block = { key: string; turns: Turn[] };
function blocks(turns: Turn[]): Block[] {
  const out: Block[] = [];
  for (const turn of turns) {
    const last = out[out.length - 1];
    if (turn.group !== undefined && last && last.turns[0].group === turn.group) last.turns.push(turn);
    else out.push({ key: String(turn.id), turns: [turn] });
  }
  return out;
}

type TranscriptProps = {
  state: "loading" | "signed-out" | "ready";
  turns: Turn[];
  busy: boolean;
  blocked: boolean;
  error: Failure | null;
  streamingIds: Set<number>;
  onPick: (text: string) => void;
};

export function Transcript({ state, turns, busy, blocked, error, streamingIds, onPick }: TranscriptProps) {
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
        {state === "loading" && turns.length === 0 && <p className="my-auto py-10 text-sm text-mist">Loading the conversation.</p>}
        {state === "ready" && turns.length === 0 && <Starters disabled={blocked || busy} onPick={onPick} />}

        {turns.length > 0 && (
          <div className="py-2">
            {blocks(turns).map((block) =>
              block.turns.length > 1 ? (
                <div key={block.key} className="grid border-b border-line/60 last:border-b-0 lg:grid-cols-2 lg:divide-x lg:divide-line/60">
                  {block.turns.map((turn) => (
                    <div key={turn.id} className="lg:px-4 lg:first:pl-0 lg:last:pr-0">
                      <Row turn={turn} streaming={streamingIds.has(turn.id)} compact />
                    </div>
                  ))}
                </div>
              ) : (
                <Row key={block.key} turn={block.turns[0]} streaming={streamingIds.has(block.turns[0].id)} />
              ),
            )}
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
