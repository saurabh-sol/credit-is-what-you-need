import { catalog, publicModel } from "@/lib/catalog";
import { authenticate, preflight, v1 } from "@/lib/gateway";

// OpenAI's list shape, plus what each model costs here: credits per million
// tokens with Kredit's margin already in, so a client can show real prices.
export const GET = v1(async (request) => {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;

  const { models } = await catalog();
  return Response.json({ object: "list", data: models.map(publicModel) });
});

export const OPTIONS = preflight;
