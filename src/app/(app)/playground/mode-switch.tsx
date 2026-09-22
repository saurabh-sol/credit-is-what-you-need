"use client";

import { GaugeIcon, ImageIcon, TextIcon, VideoIcon } from "./icons";
import { MODES, type Mode } from "./types";

const icons = { text: TextIcon, image: ImageIcon, video: VideoIcon, evaluate: GaugeIcon };

// Text, Image or Video: the whole page follows this choice.
export function ModeSwitch({ value, onChange, disabled }: { value: Mode; onChange: (mode: Mode) => void; disabled?: boolean }) {
  return (
    <div role="tablist" aria-label="What to make" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {MODES.map((mode) => {
        const Icon = icons[mode.id];
        const active = mode.id === value;
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={mode.hint}
            disabled={disabled}
            onClick={() => onChange(mode.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.8125rem] leading-5 transition-colors disabled:cursor-not-allowed ${
              active ? "bg-raised text-fog shadow-[0_1px_2px_var(--shade)]" : "text-mist hover:text-fog"
            }`}
          >
            <Icon className="size-3.5" />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
