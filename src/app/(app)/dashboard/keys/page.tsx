import Link from "next/link";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { ApiKeys } from "../api-keys";
import { PageHeader, Stack } from "../page-header";

export const metadata = { title: "API keys — Fuel" };

export default function Keys() {
  return (
    <>
      <PageHeader
        title="API keys"
        lede={`Up to ${MAX_ACTIVE_KEYS} active keys, one per tool. A key is shown once, when you create it, and stops working the moment you revoke it.`}
      >
        <Link href="/docs#quickstart" className="btn-sm">
          Read the quickstart
        </Link>
      </PageHeader>
      <Stack>
        <ApiKeys />
      </Stack>
    </>
  );
}
