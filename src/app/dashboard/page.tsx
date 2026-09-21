import { redirect } from "next/navigation";
import { TopUp } from "@/components/top-up";
import { getSession } from "@/lib/session";
import { Activity } from "./activity";
import { ApiKeys } from "./api-keys";
import { BuilderRoyalties } from "./builder-royalties";
import { ChainRecord } from "./chain-record";
import { DisplayName } from "./display-name";
import { DashboardHeader, StatRow } from "./overview";
import { RecordScanner } from "./record-scanner";
import { SectionNav } from "./section-nav";

export const metadata = { title: "Dashboard — Fuel" };

// Every section is a jump target for the side rail; the offset clears the sticky header.
function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-32 lg:scroll-mt-24 [&>section]:mt-0">
      {children}
    </div>
  );
}

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <div className="stagger mx-auto max-w-6xl px-4 pt-10 pb-20">
      <DashboardHeader address={session.address} />

      <div className="mt-10 grid gap-x-10 gap-y-6 lg:grid-cols-[11rem_1fr]">
        <SectionNav />

        <div className="min-w-0 space-y-4">
          <Section id="overview">
            <StatRow />
            <div className="mt-4">
              <ChainRecord address={session.address} />
            </div>
          </Section>
          <Section id="earn">
            <RecordScanner />
          </Section>
          <Section id="royalties">
            <BuilderRoyalties />
          </Section>
          <Section id="buy">
            <TopUp />
          </Section>
          <Section id="keys">
            <ApiKeys />
          </Section>
          <Section id="activity">
            <Activity />
          </Section>
          <Section id="profile">
            <section className="card p-6">
              <h2 className="text-lg font-semibold">Profile</h2>
              <p className="mt-1 text-sm text-mist">
                Your wallet earns in public. Pick the name people see next to it.
              </p>
              <DisplayName />
            </section>
          </Section>
        </div>
      </div>
    </div>
  );
}
