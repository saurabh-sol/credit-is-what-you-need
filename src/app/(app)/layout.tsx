import { AppShell } from "@/components/app-shell";

// The signed-in product: a sidebar and a slim top bar instead of the marketing header.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
