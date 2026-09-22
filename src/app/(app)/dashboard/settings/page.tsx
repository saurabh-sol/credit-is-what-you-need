import { DisplayName } from "../display-name";
import { PageHeader } from "../page-header";
import { YourData } from "../your-data";

export const metadata = { title: "Settings — Kredit" };

export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" lede="Your wallet earns in public. Choose the name people see next to it." />
      <section className="animate-rise">
        <h2 className="section-label">Public profile</h2>
        <DisplayName />
      </section>
      <section className="mt-12 animate-rise">
        <h2 className="section-label">Your data</h2>
        <YourData />
      </section>
    </>
  );
}
