import { catalog, type CatalogPrice } from "@/lib/catalog";
import { authenticate, preflight, v1 } from "@/lib/gateway";

// Prices in the unit the model is sold by: tokens, images or seconds of video.
const pricingOf = (price: CatalogPrice | null) => {
  if (!price) return null;
  if (price.per === "image") return { credits_per_image: price.credits };
  if (price.per === "second") return { credits_per_second_from: price.from, at_resolution: price.resolution };
  return { credits_per_million_input: price.input, credits_per_million_output: price.output };
};

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
    pricing: pricingOf(model.price),
  }));
  return Response.json({ object: "list", data });
});

export const OPTIONS = preflight;
