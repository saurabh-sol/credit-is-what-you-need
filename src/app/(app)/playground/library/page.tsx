import { Library } from "./library";

export const metadata = { title: "Library — Kredit" };

export default function LibraryPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Library />
    </div>
  );
}
