import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Every dashboard page belongs to a signed-in wallet, so the check lives here once.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await getSession())) redirect("/");
  return <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">{children}</div>;
}
