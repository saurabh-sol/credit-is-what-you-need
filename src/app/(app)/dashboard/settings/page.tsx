import { PageHeader } from "../page-header";
import { YourData } from "../your-data";

export const metadata = { title: "Settings — Kredit" };

export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" lede="What Kredit keeps about this wallet, and how to take it with you or clear it." />
      <section className="animate-rise">
        <h2 className="section-label">Your data</h2>
        <YourData />
      </section>
    </>
  );
}
