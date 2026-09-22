import { distribution } from "@/lib/distribution";

// Public: what each wallet claimed, plus one total for what it has used and the models it went to.
export async function GET(request: Request) {
  const search = new URL(request.url).searchParams.get("q")?.slice(0, 64) ?? "";
  return Response.json(await distribution({ search }));
}
