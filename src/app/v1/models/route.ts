import { catalog } from "@/lib/catalog";
import { authenticate, preflight, v1 } from "@/lib/gateway";

// OpenAI's list shape, plus what each model costs here: credits per million
// tokens with Kredit's margin already in, so a client can show real prices.
export const GET = v1(async (request) => {
  const caller = authenticate(request);
  if (caller instanceof Response) return caller;

  const { models } = await catalog();
  const data = models.map((model) => ({
    id: model.id,
    object: "model",
    owned_by: model.provider,
    name: model.name,
    type: model.type,
    ...(model.contextWindow && { context_window: model.contextWindow }),
    pricing: model.credits && { credits_per_million_input: model.credits.input, credits_per_million_output: model.credits.output },
  }));
  return Response.json({ object: "list", data });
});

export const OPTIONS = preflight;
