import { Verify } from "./verify";

export const metadata = { title: "Approve a CLI login — Kredit" };

// The page `kredit login` opens: shows the code, asks the wallet to sign in,
// and turns the code into a key the terminal collects.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <div className="mx-auto max-w-xl px-4 pt-12 pb-24">
      <p className="eyebrow">Command line</p>
      <h1 className="page-title mt-3">Approve a login</h1>
      <Verify initialCode={code ?? ""} />
    </div>
  );
}
