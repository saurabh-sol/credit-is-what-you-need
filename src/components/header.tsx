"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { WalletButton } from "@/components/wallet-button";

const links = [
  ["Earn", "/#earn"],
  ["How it works", "/#how"],
  ["Estimate", "/#estimate"],
  ["API", "/#api"],
  ["FAQ", "/#faq"],
];

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2 text-lg font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-md bg-lime font-mono text-sm font-bold text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] transition duration-500 group-hover:-rotate-6 group-hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_0_20px_rgb(198_244_50/0.6)]">
        F
      </span>
      Fuel
    </Link>
  );
}

export function Header() {
  const ref = useRef<HTMLElement>(null);

  // Clear over the hero, frosted once the page moves; the lime line tracks
  // reading progress. Written straight to the DOM so scrolling never re-renders.
  useEffect(() => {
    const onScroll = () => {
      const header = ref.current;
      if (!header) return;
      const range = document.documentElement.scrollHeight - window.innerHeight;
      header.toggleAttribute("data-scrolled", window.scrollY > 8);
      header.style.setProperty("--progress", String(range > 0 ? window.scrollY / range : 0));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <header
      ref={ref}
      style={{ "--progress": 0 } as React.CSSProperties}
      className="sticky top-0 z-40 h-16 border-b border-transparent transition-[background-color,border-color,backdrop-filter] duration-500 data-scrolled:border-line data-scrolled:bg-ink/75 data-scrolled:backdrop-blur-xl"
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-6 px-4">
        <Logo />
        <nav aria-label="Main" className="hidden gap-1 text-sm text-mist md:flex">
          {links.map(([name, href]) => (
            <Link key={href} href={href} className="rounded-full px-3.5 py-2 transition hover:bg-fog/5 hover:text-fog">
              {name}
            </Link>
          ))}
        </nav>
        <WalletButton />
      </div>
      <div
        aria-hidden
        className="absolute bottom-[-1px] left-0 h-px w-full origin-left scale-x-(--progress) bg-gradient-to-r from-lime/0 via-lime to-lime"
      />
    </header>
  );
}
