"use client";

// A card whose glow follows the cursor. The styling lives in `.spotlight`.
export function Spotlight({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <article
      className={`spotlight ${className}`}
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
        event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
      }}
    >
      {children}
    </article>
  );
}
