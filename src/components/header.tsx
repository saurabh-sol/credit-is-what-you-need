"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, MenuIcon, PlayIcon } from "@/components/icons";
import { WalletButton } from "@/components/wallet-button";

const links = [
  ["How it works", "/#how"],
  ["API", "/docs"],
  ["Distribution", "/distribution"],
  ["FAQ", "/#faq"],
];

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2 text-lg font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-md bg-lime font-mono text-sm font-bold text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] transition duration-500 group-hover:-rotate-6">
        F
      </span>
      Fuel
    </Link>
  );
}

export function Header() {
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const [menuAt, setMenuAt] = useState<string | null>(null);
  // The menu belongs to the page it was opened on, so navigating closes it.
  const menuOpen = menuAt === pathname;

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
  }, [pathname]);

  return (
    <header
      ref={ref}
      data-open={menuOpen || undefined}
      style={{ "--progress": 0 } as React.CSSProperties}
      className="sticky top-0 z-40 border-b border-transparent transition-[background-color,border-color,backdrop-filter] duration-500 data-open:border-line data-open:bg-ink/95 data-open:backdrop-blur-xl data-scrolled:border-line data-scrolled:bg-ink/75 data-scrolled:backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav aria-label="Main" className="hidden gap-1 text-sm text-mist md:flex">
          {links.map(([name, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className="rounded-full px-3.5 py-2 transition hover:bg-fog/5 hover:text-fog aria-[current=page]:bg-fog/5 aria-[current=page]:text-fog"
            >
              {name}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/playground"
            aria-current={pathname === "/playground" ? "page" : undefined}
            className="btn-ghost hidden px-3.5 py-2 text-sm aria-[current=page]:border-lime/55 sm:inline-flex"
          >
            <PlayIcon className="size-3.5 text-lime" />
            Playground
          </Link>
          <WalletButton signedIn="account" />
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuAt(menuOpen ? null : pathname)}
            className="btn-ghost grid size-10 place-items-center md:hidden"
          >
            {menuOpen ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav aria-label="Mobile" className="border-t border-line px-4 pt-2 pb-5 md:hidden">
          {[...links, ["Playground", "/playground"], ["Dashboard", "/dashboard"]].map(([name, href], index) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuAt(null)}
              style={{ animationDelay: `${index * 45}ms` }}
              className="block animate-rise border-b border-line/60 py-3.5 text-lg text-fog"
            >
              {name}
            </Link>
          ))}
        </nav>
      )}

      <div
        aria-hidden
        className="absolute bottom-[-1px] left-0 h-px w-full origin-left scale-x-(--progress) bg-gradient-to-r from-lime/0 via-lime to-lime"
      />
    </header>
  );
}
