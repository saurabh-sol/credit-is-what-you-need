"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/icons";
import { docGroups, docHref } from "./nav";
import { DocsSearch } from "./search";

// The grouped tree of every page. A rail on wide screens; a drawer under a
// "Menu" button on narrow ones.
export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const tree = (
    <nav aria-label="Documentation" className="space-y-6">
      {docGroups.map((group) => (
        <div key={group.title}>
          <p className="docs-group px-3">{group.title}</p>
          <ul className="mt-2 border-l border-line">
            {group.pages.map((page) => {
              const href = docHref(page.slug);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === href ? "page" : undefined}
                    className="docs-link"
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <div className="sticky top-16 z-20 -mx-4 flex items-center gap-2 border-b border-line bg-ink/85 px-4 py-2 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="btn-sm"
        >
          {open ? <CloseIcon className="size-3.5" /> : <MenuIcon className="size-3.5" />}
          {open ? "Close" : "Menu"}
        </button>
        <div className="min-w-0 flex-1">
          <DocsSearch />
        </div>
      </div>
      {open && (
        <div className="border-b border-line py-5 lg:hidden">
          {tree}
        </div>
      )}
      <aside className="docs-rail hidden pr-4 pb-10 lg:block">
        <div className="mb-6">
          <DocsSearch />
        </div>
        {tree}
      </aside>
    </>
  );
}
