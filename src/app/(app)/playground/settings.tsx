"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { CountUp } from "@/components/motion/count-up";
import { costExamples } from "@/lib/cost-examples";
import { formatCredits } from "@/lib/format";
import { CREDITS_PER_USD } from "@/lib/pricing";
import { ModelPicker } from "./model-picker";

type SettingsProps = {
  model: string;
  onModel: (model: string) => void;
  signedIn: boolean;
  balance: number | undefined;
  // Read only when a message is sent, so typing here re-renders nothing.
  systemPrompt: RefObject<HTMLTextAreaElement | null>;
};

export function Settings({ model, onModel, signedIn, balance, systemPrompt }: SettingsProps) {
  const empty = balance !== undefined && balance <= 0;

  return (
    <aside
      aria-label="Playground settings"
      className="shrink-0 border-t border-line lg:w-[300px] lg:overflow-y-auto lg:border-t-0 lg:border-l"
    >
      <div className="grid gap-8 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-1 lg:p-5">
        <section>
          <h2 className="section-label">Model</h2>
          <div className="mt-3">
            <ModelPicker value={model} onChange={onModel} />
          </div>
        </section>

        <section>
          <h2 className="section-label">Balance</h2>
          {signedIn ? (
            <>
              <p className="mt-3 font-mono text-2xl leading-8 font-semibold tracking-tight text-lime tabular-nums">
                {balance === undefined ? <span className="skeleton" aria-hidden>00,000</span> : <CountUp value={balance} duration={900} />}
                <span className="ml-2 font-sans text-xs font-normal tracking-normal text-mist">credits</span>
              </p>
              <p className="mt-0.5 text-xs text-mist">
                {balance === undefined ? "Loading your balance" : `≈ $${(balance / CREDITS_PER_USD).toFixed(2)} of AI usage`}
              </p>
            </>
          ) : (
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-mist">
              Connect your wallet to see your credits. Every reply here is paid from them.
            </p>
          )}
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Link href="/dashboard/credits" className={`btn-sm ${empty ? "btn-sm-primary" : ""}`}>
              Buy credits
            </Link>
            <Link href="/dashboard/earn" className="btn-sm">
              Earn credits
            </Link>
          </div>
        </section>

        <section>
          <h2 className="section-label">
            What requests cost <span className="text-xs font-normal text-mist">credits</span>
          </h2>
          <ul className="text-[0.8125rem]">
            {costExamples.map((example) => (
              <li key={example.name} className="flex h-9 items-center justify-between gap-3 border-b border-line/60">
                <span className="truncate text-mist">{example.name}</span>
                <span className="font-mono text-fog tabular-nums">{formatCredits(example.credits)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-xs leading-relaxed text-mist">
            You pay per token, so longer prompts and longer answers cost more. The exact charge shows under each reply.
          </p>
        </section>

        <section>
          <h2 className="section-label">
            <label htmlFor="system-prompt">System prompt</label>
            <span className="text-xs font-normal text-mist">Optional</span>
          </h2>
          <textarea
            id="system-prompt"
            ref={systemPrompt}
            rows={4}
            spellCheck={false}
            aria-describedby="system-prompt-note"
            placeholder="You are a terse assistant. Answer in plain language."
            className="field mt-3 max-h-64 min-h-24 resize-none rounded-lg px-3 py-2.5 text-[0.8125rem] leading-relaxed [field-sizing:content]"
          />
          <p id="system-prompt-note" className="mt-2 text-xs leading-relaxed text-mist">
            Sent ahead of the conversation on every request, and billed like any other text.
          </p>
        </section>
      </div>
    </aside>
  );
}
