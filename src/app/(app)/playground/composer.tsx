"use client";

import { useRef, useState, type ReactNode } from "react";
import { PlusIcon, SendIcon, StopIcon } from "@/components/icons";

type ComposerProps = {
  busy: boolean;
  // Why nothing can be sent right now, said in words; null when sending is fine.
  blocked: ReactNode | null;
  canReset: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onReset: () => void;
};

// The draft lives here, so typing never re-renders the transcript above.
export function Composer({ busy, blocked, canReset, onSend, onStop, onReset }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const ready = !busy && !blocked && draft.trim() !== "";

  function submit() {
    if (!ready) return;
    onSend(draft);
    setDraft("");
  }

  return (
    <form
      className="shrink-0 border-t border-line px-4 pt-3 pb-4 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="mx-auto w-full max-w-[760px]">
        {blocked && (
          <p id="composer-blocked" className="mb-2.5 text-[0.8125rem] leading-relaxed text-mist">
            {blocked}
          </p>
        )}

        <div className="rounded-xl border border-line bg-surface transition-[border-color,box-shadow] duration-200 focus-within:border-lime/60 focus-within:shadow-[0_0_0_3px_rgb(198_244_50/0.12)]">
          <label className="sr-only" htmlFor="prompt">
            Message
          </label>
          <textarea
            id="prompt"
            ref={input}
            rows={1}
            value={draft}
            disabled={Boolean(blocked)}
            aria-describedby={blocked ? "composer-blocked" : undefined}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter also confirms a word in an input method editor; leave that one alone.
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              submit();
            }}
            placeholder={blocked ? "Sending is off for now" : "Ask something"}
            className="block max-h-48 min-h-12 w-full resize-none bg-transparent px-3.5 pt-3 pb-1.5 text-[0.9375rem] leading-6 text-fog [field-sizing:content] placeholder:text-mist focus:outline-none disabled:cursor-not-allowed"
          />

          <div className="flex items-center gap-2 px-2.5 pb-2.5">
            <button
              type="button"
              disabled={busy || !canReset}
              onClick={() => {
                onReset();
                input.current?.focus();
              }}
              className="btn-sm"
            >
              <PlusIcon className="size-3.5" />
              New chat
            </button>

            <p className="ml-auto hidden items-center gap-1.5 text-xs text-mist sm:flex">
              <kbd className="kbd">Enter</kbd> to send
              <span className="ml-2 inline-flex items-center gap-1">
                <kbd className="kbd">Shift</kbd>
                <kbd className="kbd">Enter</kbd>
              </span>
              for a new line
            </p>

            {busy ? (
              <button type="button" onClick={onStop} className="btn-sm ml-auto sm:ml-1">
                <StopIcon className="size-3.5" />
                Stop
              </button>
            ) : (
              <button type="submit" disabled={!ready} className="btn-sm btn-sm-primary ml-auto sm:ml-1">
                Send
                <SendIcon className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
