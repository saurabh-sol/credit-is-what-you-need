import Link from "next/link";
import { Header, Logo } from "@/components/header";

const footerLinks = [
  {
    title: "Earn",
    links: [
      ["Ways to earn", "/#earn"],
      ["How it works", "/#how"],
      ["Estimate", "/#estimate"],
      ["Buy credits", "/#buy"],
    ],
  },
  {
    title: "Build",
    links: [
      ["API", "/docs"],
      ["Playground", "/playground"],
      ["Models", "/docs#models"],
    ],
  },
  {
    title: "Kredit",
    links: [
      ["Dashboard", "/dashboard"],
      ["Distribution", "/distribution"],
      ["FAQ", "/#faq"],
    ],
  },
];

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 md:flex-row md:items-start md:justify-between">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-mist">
              Your on-chain activity has purchasing power. Built on Robinhood Chain.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-16 gap-y-8 text-sm sm:grid-cols-3">
            {footerLinks.map((group) => (
              <div key={group.title}>
                <p className="font-mono text-xs uppercase tracking-widest text-mist/70">{group.title}</p>
                <ul className="mt-4 space-y-2.5 text-mist">
                  {group.links.map(([name, href]) => (
                    <li key={href}>
                      <Link href={href} className="transition hover:text-lime">
                        {name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <p className="border-t border-line/60 px-4 py-5 text-center text-xs text-mist">
          Kredit · an independent project, not affiliated with Robinhood
        </p>
      </footer>
    </>
  );
}
