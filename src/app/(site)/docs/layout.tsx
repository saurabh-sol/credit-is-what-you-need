import { OnThisPage } from "./on-this-page";
import { Sidebar } from "./sidebar";

// Every docs page sits in the same frame: the page tree on the left, the
// article in the middle, its headings on the right.
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[88rem] px-4 pt-6 pb-24 lg:pt-10">
      <div className="docs-shell">
        <Sidebar />
        <div className="min-w-0 pt-6 lg:pt-0">{children}</div>
        <OnThisPage />
      </div>
    </div>
  );
}
