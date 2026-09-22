"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Heading = { id: string; text: string; depth: 2 | 3 };

// Lists the h2 and h3 headings of the article beside it and marks the one
// under the header. Read from the page after it renders, so pages declare nothing.
export function OnThisPage() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    let observer: IntersectionObserver | undefined;
    // Read the article after it has painted; the headings belong to the new page by then.
    const frame = requestAnimationFrame(() => {
      const nodes = Array.from(document.querySelectorAll<HTMLHeadingElement>(".doc h2[id], .doc h3[id]"));
      setHeadings(
        nodes.map((node) => ({
          id: node.id,
          text: node.firstChild?.textContent?.trim() ?? node.textContent?.replace(/#$/, "").trim() ?? "",
          depth: node.tagName === "H2" ? 2 : 3,
        })),
      );
      setActive(nodes[0]?.id ?? "");
      if (nodes.length === 0) return;

      observer = new IntersectionObserver(
        (entries) => {
          const showing = entries.filter((entry) => entry.isIntersecting);
          if (showing.length) setActive(showing[0].target.id);
        },
        { rootMargin: "-15% 0px -75% 0px" },
      );
      for (const node of nodes) observer.observe(node);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [pathname]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" className="docs-rail hidden xl:block">
      <p className="docs-group">On this page</p>
      <ul className="mt-2">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              data-depth={heading.depth}
              aria-current={active === heading.id ? "location" : undefined}
              className="toc-link"
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
