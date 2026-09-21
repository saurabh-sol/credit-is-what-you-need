import { distribution } from "@/lib/distribution";

// Public: the same numbers anyone could add up from the ledger's claims.
export async function GET(request: Request) {
  const search = new URL(request.url).searchParams.get("q")?.slice(0, 64) ?? "";
  return Response.json(distribution({ search }));
}
