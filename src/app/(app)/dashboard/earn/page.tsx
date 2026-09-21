import { BuilderRoyalties } from "../builder-royalties";
import { PageHeader, Stack } from "../page-header";
import { RecordScanner } from "../record-scanner";

export const metadata = { title: "Earn credits — Kredit" };

export default function Earn() {
  return (
    <>
      <PageHeader
        title="Earn credits"
        lede="Credits come from what your wallet has already done on Robinhood Chain. Scan, check the receipt, claim. Every transaction pays once."
      />
      <Stack>
        <RecordScanner />
        <div id="royalties" className="scroll-mt-20 [&>section]:mt-0">
          <BuilderRoyalties />
        </div>
      </Stack>
    </>
  );
}
