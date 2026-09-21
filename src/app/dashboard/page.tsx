import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Activity } from "./activity";
import { ApiKeys } from "./api-keys";
import { BalanceCard } from "./balance-card";
import { BuilderRoyalties } from "./builder-royalties";
import { ChainRecord } from "./chain-record";
import { RecordScanner } from "./record-scanner";

export const metadata = { title: "Dashboard — Fuel" };

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <div className="stagger mx-auto max-w-6xl px-4 py-10">
      <p className="font-mono text-xs uppercase tracking-widest text-lime">Dashboard</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your wallet is verified</h1>
      <p className="mt-2 break-all font-mono text-sm text-mist">{session.address}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <BalanceCard />
        <div className="md:col-span-2">
          <ChainRecord address={session.address} />
        </div>
      </div>

      <RecordScanner />
      <BuilderRoyalties />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ApiKeys />
        <Activity />
      </div>
    </div>
  );
}
