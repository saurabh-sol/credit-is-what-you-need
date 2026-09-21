"use client";

import { prefersReducedMotion } from "./use-in-view";

type TiltProps = { children: React.ReactNode; max?: number; className?: string };

// Tilts its content toward the cursor. Touch and reduced-motion users get a flat card.
export function Tilt({ children, max = 7, className = "" }: TiltProps) {
  return (
    <div
      className={`tilt ${className}`}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || prefersReducedMotion()) return;
        const element = event.currentTarget;
        const box = element.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        element.dataset.active = "";
        element.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
        element.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
      }}
      onPointerLeave={(event) => {
        const element = event.currentTarget;
        delete element.dataset.active;
        element.style.removeProperty("--rx");
        element.style.removeProperty("--ry");
      }}
    >
      <div className="tilt-inner">{children}</div>
    </div>
  );
}
