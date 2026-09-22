import { catalog } from "@/lib/catalog";
import { authenticate } from "@/lib/gateway";
import { creditsPerMillion } from "@/lib/pricing";

// The OpenAI list shape, plus what each model costs in credits so a client can
// show prices without knowing Kredit's margin.
export async function GET(request: Request) {
  const caller = authenticate(request);
  if (caller instanceof Response) return caller;

  const { models } = await catalog();
  const data = models.map((model) => ({
    id: model.id,
    object: "model",
    created: model.created ?? 0,
    owned_by: model.provider,
    ...(model.price && {
      pricing: {
        input_credits_per_million: creditsPerMillion(model.price.input),
        output_credits_per_million: creditsPerMillion(model.price.output),
      },
    }),
  }));
  return Response.json({ object: "list", data });
}

// Browser clients ask before sending a key; the CORS headers come from next.config.
export const OPTIONS = () => new Response(null, { status: 204 });
