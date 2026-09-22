import Link from "next/link";
import { FooterWordmark } from "@/components/footer-wordmark";
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
      ["Docs", "/docs"],
      ["Playground", "/playground"],
      ["Models", "/docs/api/models"],
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
      {/* The one inverted block on the page: black with cream text, so fog and ink swap roles here. */}
      <footer className="overflow-hidden rounded-t-[2rem] bg-fog text-ink">
        <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 pt-16 pb-12 md:pt-20 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink/60">
              Your on-chain activity has purchasing power. Built on Robinhood Chain.
            </p>
            <Link
              href="/dashboard"
              className="mt-7 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-semibold text-fog transition hover:bg-ink/85"
            >
              Open the dashboard
            </Link>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-16 gap-y-10 text-sm sm:grid-cols-3">
            {footerLinks.map((group) => (
              <div key={group.title}>
                <p className="font-mono text-xs uppercase tracking-widest text-ink/40">{group.title}</p>
                <ul className="mt-5 space-y-3 text-ink/70">
                  {group.links.map(([name, href]) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="underline decoration-transparent underline-offset-4 transition hover:text-ink hover:decoration-accent-2"
                      >
                        {name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mx-auto flex max-w-6xl flex-col gap-2 border-t border-ink/10 px-4 py-6 text-xs text-ink/50 sm:flex-row sm:items-center sm:justify-between">
          <p>Kredit · an independent project, not affiliated with Robinhood</p>
          <a href="#top" className="transition hover:text-ink">
            Back to top ↑
          </a>
        </div>
        <FooterWordmark />
      </footer>
    </>
  );
}
