"use client";

import { useEffect, useRef, useState } from "react";
import { formatCredits } from "@/lib/format";
import { prefersReducedMotion, useInView } from "./use-in-view";

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

type CountUpProps = { value: number; duration?: number; delay?: number };

// Counts from the previous value (0 at first) to `value` once it is on screen.
// The server and reduced-motion users simply get the final number.
export function CountUp({ value, duration = 1600, delay = 0 }: CountUpProps) {
  const [ref, inView] = useInView<HTMLSpanElement>("0px");
  // The in-flight number; null means "not animating, show the real value".
  const [shown, setShown] = useState<number | null>(null);
  const from = useRef(0);

  useEffect(() => {
    if (!inView) return;
    const start = from.current;
    from.current = value;
    if (start === value || prefersReducedMotion()) return;

    let frame = 0;
    let began = 0;
    const tick = (now: number) => {
      began ||= now + delay;
      const progress = Math.min(Math.max((now - began) / duration, 0), 1);
      setShown(progress < 1 ? Math.round(start + (value - start) * easeOutExpo(progress)) : null);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration, delay]);

  return (
    <span ref={ref} className="tabular-nums">
      {formatCredits(shown ?? value)}
    </span>
  );
}
