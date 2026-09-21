import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Header, Logo } from "@/components/header";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    title: "Fuel",
    links: [
      ["Dashboard", "/dashboard"],
      ["Distribution", "/distribution"],
      ["FAQ", "/#faq"],
    ],
  },
];

export const metadata: Metadata = {
  title: "Fuel — every task deserves credits",
  description:
    "Turn your Robinhood Chain activity into AI credits you can spend anywhere.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-line">
            <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 md:flex-row md:items-start md:justify-between">
              <div>
                <Logo />
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-mist">
                  Every task deserves credits. Built on Robinhood Chain.
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
              Fuel · an independent project, not affiliated with Robinhood
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
