"use client";

import { useState, type ReactNode } from "react";
import { StopIcon } from "@/components/icons";
import { ModelLogo } from "@/components/model-logo";
import { WalletButton } from "@/components/wallet-button";
import { formatCredits } from "@/lib/format";
import { SparkIcon } from "./icons";
import type { Creation, Mode } from "./types";

type StudioProps = {
  mode: Exclude<Mode, "text" | "evaluate">;
  state: "ready" | "loading" | "signed-out";
  creations: Creation[];
  busy: boolean;
  blocked: ReactNode | null;
  estimate: string; // what the next one will cost, in words
  onMake: (prompt: string) => void;
  onStop: () => void;
};

const starters: Record<Exclude<Mode, "text" | "evaluate">, string[]> = {
  image: [
    "A paper boat drifting across a puddle in the rain, soft morning light",
    "Isometric illustration of a tiny data center on a floating island",
    "A ceramic mug shaped like a cat, product photo on white",
  ],
  video: [
    "A paper plane looping over a city at dusk, camera following it",
    "Slow push-in on a coffee cup as steam curls up, warm kitchen light",
    "Waves rolling onto a black sand beach, aerial view, golden hour",
  ],
};

const save = (file: { base64: string; mediaType: string }, name: string) => {
  const link = document.createElement("a");
  link.href = `data:${file.mediaType};base64,${file.base64}`;
  link.download = name;
  link.click();
};

export function Studio({ mode, state, creations, busy, blocked, estimate, onMake, onStop }: StudioProps) {
  const [draft, setDraft] = useState("");
  const ready = !busy && !blocked && draft.trim() !== "";
  const noun = mode === "image" ? "picture" : "clip";

  function submit() {
    if (!ready) return;
    onMake(draft);
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-[760px]">
          {creations.length === 0 ? (
            <div className="py-6">
              <h1 className="text-lg font-semibold tracking-tight">{mode === "image" ? "Make a picture" : "Make a clip"}</h1>
              <p className="mt-2 max-w-md text-[0.8125rem] leading-relaxed text-mist">
                {mode === "image"
                  ? "Describe what you want to see. Each picture is paid from your credits; the price shows before you make it."
                  : "Describe a few seconds of motion. Clips take about a minute to render and are paid by the second, so the cost is known before you start."}
              </p>
              {state === "signed-out" && (
                <div className="mt-5">
                  <WalletButton />
                </div>
              )}
              {state === "ready" && (
                <ul className="mt-5 grid gap-2 sm:grid-cols-3">
                  {starters[mode].map((starter) => (
                    <li key={starter}>
                      <button
                        type="button"
                        disabled={Boolean(blocked) || busy}
                        onClick={() => onMake(starter)}
                        className="card h-full w-full px-3.5 py-3 text-left text-[0.8125rem] leading-relaxed text-mist transition-colors hover:text-fog disabled:cursor-not-allowed"
                      >
                        {starter}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <ul className="space-y-6">
              {creations.map((creation) => (
                <li key={creation.id} className="card overflow-hidden">
                  <div className="flex items-start gap-3 px-4 pt-4">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-raised text-fog">
                      <ModelLogo model={creation.model} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem] leading-6 text-fog">{creation.prompt}</p>
                      <p className="mt-1 font-mono text-[0.6875rem] text-mist">
                        {creation.model}
                        {creation.ms !== undefined && ` · ${(creation.ms / 1000).toFixed(1)}s`}
                        {creation.cost !== undefined && ` · ${formatCredits(creation.cost)} credits`}
                      </p>
                    </div>
                  </div>
                  <div className="p-4">
                    {creation.error ? (
                      <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-[0.8125rem] leading-relaxed text-danger">
                        {creation.error.message}
                      </p>
                    ) : creation.files.length === 0 ? (
                      <div className="skeleton aspect-video w-full rounded-lg" aria-label={`Making the ${noun}`} />
                    ) : (
                      <div className={`grid gap-3 ${creation.files.length > 1 ? "sm:grid-cols-2" : ""}`}>
                        {creation.files.map((file, index) => (
                          <figure key={index} className="group relative overflow-hidden rounded-lg border border-line bg-surface">
                            {creation.kind === "video" ? (
                              <video controls autoPlay loop muted playsInline className="w-full" src={`data:${file.mediaType};base64,${file.base64}`} />
                            ) : (
                              // A data URL from the reply; there is nothing for next/image to optimize.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img alt={creation.prompt} className="w-full" src={`data:${file.mediaType};base64,${file.base64}`} />
                            )}
                            <button
                              type="button"
                              onClick={() => save(file, `kredit-${creation.kind}-${creation.id}${index ? `-${index + 1}` : ""}.${file.mediaType.split("/")[1] ?? "bin"}`)}
                              className="btn-sm absolute right-2 bottom-2 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                            >
                              Save
                            </button>
                          </figure>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <form
        className="shrink-0 border-t border-line px-4 pt-3 pb-4 sm:px-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="mx-auto w-full max-w-[760px]">
          {blocked && (
            <p id="studio-blocked" className="mb-2.5 text-[0.8125rem] leading-relaxed text-mist">
              {blocked}
            </p>
          )}
          <div className="rounded-xl border border-line bg-surface transition-[border-color,box-shadow] duration-200 focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]">
            <label className="sr-only" htmlFor="studio-prompt">
              Prompt
            </label>
            <textarea
              id="studio-prompt"
              rows={2}
              value={draft}
              disabled={Boolean(blocked)}
              aria-describedby={blocked ? "studio-blocked" : undefined}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                submit();
              }}
              placeholder={blocked ? "Making is off for now" : `Describe the ${noun}`}
              className="block max-h-48 min-h-14 w-full resize-none bg-transparent px-3.5 pt-3 pb-1.5 text-[0.9375rem] leading-6 text-fog [field-sizing:content] placeholder:text-mist focus:outline-none disabled:cursor-not-allowed"
            />
            <div className="flex items-center gap-2 px-2.5 pb-2.5">
              <p className="text-xs text-mist">{estimate}</p>
              {busy ? (
                <button type="button" onClick={onStop} className="btn-sm ml-auto">
                  <StopIcon className="size-3.5" />
                  Stop
                </button>
              ) : (
                <button type="submit" disabled={!ready} className="btn-sm btn-sm-primary ml-auto">
                  <SparkIcon className="size-3.5" />
                  Make {noun}
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
