import { ActivityTable } from "../activity-table";
import { PageHeader } from "../page-header";

export const metadata = { title: "Activity — Fuel" };

export default function Activity() {
  return (
    <>
      <PageHeader title="Activity" lede="The latest credits in and out of this wallet. Spending is private; only what you earn appears on the public distribution page." />
      <div className="animate-rise">
        <ActivityTable />
      </div>
    </>
  );
}
