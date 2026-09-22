import Link from "next/link";
import { redirect } from "next/navigation";
import { CopyButton } from "@/components/code-block";
import { ArrowRightIcon, BoltIcon, CoinsIcon, KeyIcon, PlayIcon, UsersIcon } from "@/components/icons";
import { getSession } from "@/lib/session";
import { ActivityTable } from "./activity-table";
import { ChainRecord } from "./chain-record";
import { KpiStrip } from "./overview";
import { PageHeader } from "./page-header";

export const metadata = { title: "Overview — Kredit" };

const nextSteps = [
  { icon: BoltIcon, title: "Scan your on-chain record", text: "Turn past transactions into credits", href: "/dashboard/earn", action: "Scan record" },
  { icon: KeyIcon, title: "Create an API key", text: "Use your credits in Cursor, Postman or code", href: "/dashboard/keys", action: "Create key" },
  { icon: PlayIcon, title: "Try a model", text: "Spend a few credits in the playground", href: "/playground", action: "Open playground" },
  { icon: UsersIcon, title: "Invite a friend", text: "Earn a share of every claim they make", href: "/dashboard/earn#referrals", action: "Get link" },
  { icon: CoinsIcon, title: "Top up with tokens", text: "For when a job needs more than you earned", href: "/dashboard/credits", action: "Buy credits" },
];

export default async function Overview() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <>
      <PageHeader
        title="Overview"
        lede={
          <span className="flex items-center gap-1 font-mono">
            <span className="break-all">{session.address}</span>
            <CopyButton text={session.address} label="" className="-my-1" />
          </span>
        }
      >
        <Link href="/dashboard/keys" className="btn-sm">
          Create key
        </Link>
        <Link href="/dashboard/earn" className="btn-sm btn-sm-primary">
          Scan my record
        </Link>
      </PageHeader>

      <KpiStrip />

      <div className="stagger mt-10 grid gap-x-10 gap-y-10 lg:grid-cols-12">
        <section className="min-w-0 lg:col-span-7">
          <h2 className="section-label">
            Recent activity
            <Link href="/dashboard/activity" className="group flex items-center gap-1 text-xs font-normal text-mist transition hover:text-fog">
              View all <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </h2>
          <div className="mt-1">
            <ActivityTable limit={6} />
          </div>
        </section>

        <section className="lg:col-span-5">
          <h2 className="section-label">Next steps</h2>
          <ul>
            {nextSteps.map(({ icon: Icon, title, text, href, action }) => (
              <li key={href} className="entity">
                <span className="entity-icon">
                  <Icon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{title}</p>
                  <p className="truncate text-xs text-mist">{text}</p>
                </div>
                <Link href={href} className="btn-sm">
                  {action}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="lg:col-span-12">
          <ChainRecord address={session.address} />
        </div>
      </div>
    </>
  );
}
