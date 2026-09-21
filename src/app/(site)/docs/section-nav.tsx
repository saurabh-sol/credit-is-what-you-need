"use client";

import { useEffect, useState } from "react";
import { sectionGroups } from "./sections";

// A grouped rail on wide screens, one row of pills on narrow ones. It marks the
// section that currently sits under the header.
export function SectionNav() {
  const [active, setActive] = useState<string>(sectionGroups[0].sections[0][0]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const showing = entries.filter((entry) => entry.isIntersecting);
        if (showing.length) setActive(showing[0].target.id);
      },
      // A thin band just below the sticky header decides which section is "current".
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const group of sectionGroups) {
      for (const [id] of group.sections) {
        const section = document.getElementById(id);
        if (section) observer.observe(section);
      }
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="On this page"
      className="sticky top-16 z-10 -mx-4 overflow-x-auto border-b border-line bg-ink/85 px-4 py-2 backdrop-blur-xl lg:top-24 lg:mx-0 lg:self-start lg:overflow-visible lg:border-b-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
    >
      <div className="flex gap-1 lg:block lg:space-y-6">
        {sectionGroups.map((group) => (
          <div key={group.title} className="contents lg:block">
            <p className="hidden px-3 text-[0.6875rem] font-medium tracking-[0.06em] text-mist/70 uppercase lg:block">
              {group.title}
            </p>
            <ul className="flex gap-1 text-[0.8125rem] whitespace-nowrap lg:mt-2 lg:block lg:border-l lg:border-line">
              {group.sections.map(([id, title]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    aria-current={active === id ? "location" : undefined}
                    className="block rounded-md px-3 py-1.5 text-mist transition-colors hover:text-fog aria-[current]:bg-fog/5 aria-[current]:text-fog lg:-ml-px lg:rounded-none lg:border-l lg:border-transparent lg:py-1 lg:aria-[current]:border-lime lg:aria-[current]:bg-transparent"
                  >
                    {title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
