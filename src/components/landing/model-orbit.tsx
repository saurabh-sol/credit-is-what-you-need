"use client";

import { memo, useEffect, useState } from "react";
import { OrbMark } from "@/components/brand/orb-mark";
import { ProviderLogo } from "@/components/model-logo";
import { prefersReducedMotion } from "@/components/motion/use-in-view";
import { formatCredits } from "@/lib/format";
import { featuredProviders } from "@/lib/providers";

// Three rings, inner to outer. Radius is a share of the figure's width; the
// outer rings turn slower and the middle one turns the other way.
const rings = [
  { radius: 21, turn: "48s", reverse: false, makers: featuredProviders.slice(0, 3) },
  { radius: 33, turn: "72s", reverse: true, makers: featuredProviders.slice(3, 7) },
  { radius: 45, turn: "96s", reverse: false, makers: featuredProviders.slice(7, 12) },
];

// Illustrative charges, one per call that "lands" on the core.
const charges = [14, 3, 35, 9, 116, 2, 22, 11, 6, 43, 18, 4];
const START_BALANCE = 2864;

// Makers circle the Kredit core. Every few seconds one of them answers a call:
// its seat lights up, a ring pulses out from the middle, and the balance drops.
export const ModelOrbit = memo(function ModelOrbit() {
  const [call, setCall] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setInterval(() => setCall((count) => count + 1), 2600);
    return () => clearInterval(timer);
  }, []);

  // Walk the makers in a scattered order so consecutive calls jump between rings.
  // The balance starts over with each lap of the list, so it never runs dry.
  const step = call === 0 ? 0 : (call - 1) % charges.length;
  const lit = featuredProviders[(step * 5) % featuredProviders.length];
  const cost = charges[step];
  const spent = call === 0 ? 0 : charges.slice(0, step + 1).reduce((sum, charge) => sum + charge, 0);

  return (
    <figure className="mx-auto w-full max-w-[34rem]" aria-label="Models from many makers, all reached through one Kredit key">
      <div className="orbit" aria-hidden>
        {rings.map((ring) => (
          <div
            key={ring.radius}
            className="orbit-ring"
            style={
              {
                "--radius": ring.radius,
                "--turn": ring.turn,
                "--direction": ring.reverse ? "reverse" : "normal",
                "--counter": ring.reverse ? "normal" : "reverse",
              } as React.CSSProperties
            }
          >
            {ring.makers.map((maker, index) => (
              <div key={maker.id} className="orbit-seat" style={{ "--angle": `${(360 / ring.makers.length) * index + ring.radius}deg` } as React.CSSProperties}>
                <div className="orbit-upright">
                  <div className="orbit-counter">
                    <span className="orbit-chip" data-lit={maker.id === lit.id && call > 0 ? "" : undefined} title={maker.name}>
                      <ProviderLogo logo={maker.logo} className="size-[46%]" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {call > 0 && <span key={call} className="orbit-ping" />}

        <div className="orbit-core">
          <span className="mx-auto grid size-14 place-items-center rounded-full shadow-[0_0_0_8px_color-mix(in_srgb,var(--color-accent)_8%,transparent)]">
            <OrbMark className="size-14" />
          </span>
          <p className="mt-3 font-mono text-[0.6875rem] tracking-wider text-mist uppercase">x-kredit-balance</p>
          <p className="font-mono text-lg font-semibold tabular-nums text-fog">{formatCredits(START_BALANCE - spent)}</p>
        </div>
      </div>

      <figcaption className="mt-2 flex h-7 items-center justify-center gap-2 text-xs text-mist">
        {call > 0 ? (
          <span key={call} className="pop-in flex items-center gap-2">
            <ProviderLogo logo={lit.logo} className="size-3.5 text-fog" />
            <span className="text-fog">{lit.name}</span> answered
            <span className="font-mono text-accent">−{cost} credits</span>
          </span>
        ) : (
          "One key. The makers you already use."
        )}
        <span className="chip ml-1">Example</span>
      </figcaption>
    </figure>
  );
});
