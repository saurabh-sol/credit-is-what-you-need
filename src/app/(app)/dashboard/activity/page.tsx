import { ActivityTable } from "../activity-table";
import { PageHeader } from "../page-header";

export const metadata = { title: "Activity — Kredit" };

export default function Activity() {
  return (
    <>
      <PageHeader title="Activity" lede="The latest credits in and out of this wallet. Spending is private; only claims are written on-chain." />
      <div className="animate-rise">
        <ActivityTable />
      </div>
    </>
  );
}
