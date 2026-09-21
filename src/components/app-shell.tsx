"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useDisconnect } from "wagmi";
import { Logo } from "@/components/header";
import {
  ActivityIcon,
  BoltIcon,
  CloseIcon,
  CoinsIcon,
  GridIcon,
  HomeIcon,
  KeyIcon,
  LogOutIcon,
  MenuIcon,
  PlayIcon,
  SearchIcon,
  SettingsIcon,
  TerminalIcon,
  UsersIcon,
} from "@/components/icons";
import { Identicon } from "@/components/identicon";
import { WalletButton } from "@/components/wallet-button";
import { formatCredits, shortAddress } from "@/lib/format";
import { ACCOUNT_KEY, api, type AccountResponse } from "@/lib/use-fuel-account";
import { useSession } from "@/lib/use-session";

type Destination = { name: string; href: string; icon: (props: { className?: string }) => React.ReactNode };

// Ordered by how often people need them, not alphabetically.
const product: Destination[] = [
  { name: "Overview", href: "/dashboard", icon: GridIcon },
  { name: "Earn credits", href: "/dashboard/earn", icon: BoltIcon },
  { name: "API keys", href: "/dashboard/keys", icon: KeyIcon },
  { name: "Playground", href: "/playground", icon: PlayIcon },
  { name: "Activity", href: "/dashboard/activity", icon: ActivityIcon },
  { name: "Buy credits", href: "/dashboard/credits", icon: CoinsIcon },
  { name: "Settings", href: "/dashboard/settings", icon: SettingsIcon },
];
const elsewhere: Destination[] = [
  { name: "API docs", href: "/docs", icon: TerminalIcon },
  { name: "Distribution", href: "/distribution", icon: UsersIcon },
  { name: "Home", href: "/", icon: HomeIcon },
];
const everywhere = [...product, ...elsewhere];

function NavList({ items, pathname }: { items: Destination[]; pathname: string }) {
  return (
    <ul className="space-y-0.5">
      {items.map(({ name, href, icon: Icon }) => (
        <li key={href}>
          <Link href={href} aria-current={pathname === href ? "page" : undefined} className="nav-item">
            <Icon className="size-4" />
            {name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Jump anywhere by name. Opens with Cmd/Ctrl+K.
function CommandMenu({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const matches = everywhere.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const chosen = Math.min(cursor, Math.max(matches.length - 1, 0));

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-overlay-in items-start justify-center bg-black/60 p-4 pt-[18dvh] backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to"
        className="panel w-full max-w-md animate-modal-in overflow-hidden shadow-[0_40px_100px_-20px_var(--shade)]"
        onClick={(event) => event.stopPropagation()}
      >
        <label className="flex items-center gap-2.5 border-b border-line px-4 text-mist">
          <SearchIcon />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") setCursor((chosen + 1) % Math.max(matches.length, 1));
              else if (event.key === "ArrowUp") setCursor((chosen - 1 + matches.length) % Math.max(matches.length, 1));
              else if (event.key === "Enter" && matches[chosen]) go(matches[chosen].href);
              else if (event.key === "Escape") onClose();
              else return;
              event.preventDefault();
            }}
            placeholder="Go to…"
            aria-label="Go to"
            className="h-12 w-full bg-transparent text-sm text-fog placeholder:text-mist focus:outline-none"
          />
          <span className="kbd">Esc</span>
        </label>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {matches.map(({ name, href, icon: Icon }, index) => (
            <li key={href}>
              <button
                type="button"
                onClick={() => go(href)}
                onPointerMove={() => setCursor(index)}
                className={`nav-item w-full ${index === chosen ? "bg-fog/5 text-fog" : ""}`}
              >
                <Icon className="size-4" />
                {name}
                <span className="ml-auto font-mono text-xs text-mist">{href}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-3 py-6 text-center text-sm text-mist">Nothing by that name.</li>}
        </ul>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const { disconnect } = useDisconnect();
  const [drawerAt, setDrawerAt] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerOpen = drawerAt === pathname; // navigating closes it
  // The shortcut is spelled the way this visitor's keyboard spells it.
  const modifier = useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "⌘",
  );

  const account = useQuery({
    queryKey: ACCOUNT_KEY,
    queryFn: () => api<AccountResponse>("/api/account"),
    enabled: Boolean(session.address),
  });
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => api<{ name: string | null }>("/api/profile"),
    enabled: Boolean(session.address),
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setMenuOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const title = everywhere.find((item) => item.href === pathname)?.name ?? "Kredit";

  return (
    // A fixed frame: the sidebar and top bar stay put and the page scrolls inside <main>,
    // which also lets a full-height tool like the playground dock its composer.
    <div className="app-shell flex h-dvh overflow-hidden">
      {drawerOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setDrawerAt(null)} />}

      <aside
        data-open={drawerOpen || undefined}
        className="fixed inset-y-0 left-0 z-50 flex w-60 -translate-x-full flex-col border-r border-line bg-ink transition-transform duration-300 ease-out-expo data-open:translate-x-0 lg:static lg:z-auto lg:translate-x-0"
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Logo />
          <button type="button" aria-label="Close menu" onClick={() => setDrawerAt(null)} className="text-mist lg:hidden">
            <CloseIcon className="size-5" />
          </button>
        </div>

        <div className="px-3">
          <button type="button" onClick={() => setMenuOpen(true)} className="nav-item w-full border border-line">
            <SearchIcon />
            Go to…
            <span className="ml-auto flex gap-1">
              <span className="kbd">{modifier}</span>
              <span className="kbd">K</span>
            </span>
          </button>
        </div>

        <nav aria-label="Product" className="mt-4 flex-1 overflow-y-auto px-3">
          <NavList items={product} pathname={pathname} />
          <p className="mt-6 mb-1.5 px-2.5 text-[0.6875rem] font-medium tracking-wider text-mist/70 uppercase">Elsewhere</p>
          <NavList items={elsewhere} pathname={pathname} />
        </nav>

        <div className="border-t border-line p-3">
          {session.address ? (
            <div className="flex items-center gap-2.5">
              <Identicon address={session.address} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] font-medium">{profile.data?.name ?? shortAddress(session.address)}</p>
                <p className="truncate font-mono text-[0.6875rem] text-mist">{shortAddress(session.address)}</p>
              </div>
              <button
                type="button"
                aria-label="Sign out"
                title="Sign out"
                onClick={() => {
                  disconnect();
                  session.signOut.mutate();
                }}
                className="grid size-8 place-items-center rounded-lg text-mist transition hover:bg-fog/5 hover:text-fog"
              >
                <LogOutIcon />
              </button>
            </div>
          ) : (
            !session.isLoading && <WalletButton label="Connect wallet" />
          )}
        </div>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 sm:px-6">
          <button type="button" aria-label="Open menu" onClick={() => setDrawerAt(pathname)} className="text-mist lg:hidden">
            <MenuIcon className="size-5" />
          </button>
          <p className="text-[0.8125rem] text-mist">
            Kredit <span className="mx-1.5 text-line">/</span> <span className="text-fog">{title}</span>
          </p>
          <div className="ml-auto flex items-center gap-2">
            {account.data && (
              <Link href="/dashboard/credits" className="chip transition hover:border-mist/50" title="Your credit balance">
                <span className="live-dot" />
                <span className="text-fog tabular-nums">{formatCredits(account.data.balance)}</span> credits
              </Link>
            )}
            <Link href="/docs" className="btn-sm hidden sm:inline-flex">
              Docs
            </Link>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>

      {menuOpen && <CommandMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}
