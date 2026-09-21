"use client";

import { useEffect, useState } from "react";

export const dashboardSections = [
  ["overview", "Overview"],
  ["earn", "Earn credits"],
  ["royalties", "Builder royalties"],
  ["buy", "Buy credits"],
  ["keys", "API keys"],
  ["activity", "Activity"],
  ["profile", "Profile"],
] as const;

// A rail on wide screens, a row of pills on narrow ones. It marks the section
// that currently sits under the header.
export function SectionNav() {
  const [active, setActive] = useState<string>("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const showing = entries.filter((entry) => entry.isIntersecting);
        if (showing.length) setActive(showing[0].target.id);
      },
      // A thin band just below the sticky header decides which section is "current".
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const [id] of dashboardSections) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Dashboard sections"
      className="sticky top-16 z-10 -mx-4 overflow-x-auto border-b border-line bg-ink/85 px-4 py-2.5 backdrop-blur-xl lg:top-24 lg:mx-0 lg:self-start lg:overflow-visible lg:border-b-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
    >
      <ul className="flex gap-1 text-sm whitespace-nowrap lg:flex-col lg:gap-0.5 lg:border-l lg:border-line">
        {dashboardSections.map(([id, title]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              className="block rounded-full px-3.5 py-1.5 text-mist transition hover:text-fog aria-[current]:bg-fog/5 aria-[current]:text-fog lg:-ml-px lg:rounded-none lg:border-l lg:border-transparent lg:py-1.5 lg:pl-4 lg:aria-[current]:border-lime lg:aria-[current]:bg-transparent"
            >
              {title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
