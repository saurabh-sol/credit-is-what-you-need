import { listKeys, listLedger, listUsage } from "@/lib/ledger";
import { getSession } from "@/lib/session";
import { listConversations, listCreations } from "@/lib/workspace";

// Everything Kredit holds about this wallet, as one JSON file: the ledger,
// every call it paid for, its keys (names and prefixes, never the keys), and
// what the workspace keeps. Prompts sent through the API are not here because
// they were never stored.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const address = session.address.toLowerCase();
  const usage: unknown[] = [];
  for (let before: number | null = null; ; ) {
    const page = await listUsage(address, { limit: 500, before: before ?? undefined });
    usage.push(...page.rows);
    if (!page.next || usage.length >= 20_000) break;
    before = page.next;
  }
  const body = {
    exported_at: new Date().toISOString(),
    address,
    ledger: await listLedger(address, 100_000),
    usage,
    keys: await listKeys(address),
    workspace: {
      conversations: await listConversations(address),
      creations: await listCreations(address, { withFiles: false }), // metadata only; the bytes stay in the library
    },
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="kredit-${address.slice(2, 10)}.json"`,
    },
  });
}
