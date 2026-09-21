"use client";

// The footer's oversized wordmark, cropped by the footer's bottom edge. It lights
// up under the cursor; the styling lives in `.wordmark`.
export function FooterWordmark() {
  return (
    <p
      aria-hidden
      data-text="Kredit"
      className="wordmark -mb-[0.22em] cursor-default select-none text-center text-[clamp(6rem,24vw,20rem)] font-semibold leading-none tracking-tighter"
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
        event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
      }}
    >
      Kredit
    </p>
  );
}
