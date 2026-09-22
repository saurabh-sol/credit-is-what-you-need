import { catalog, publicModel } from "@/lib/catalog";
import { apiError, authenticate, preflight, v1 } from "@/lib/gateway";

// One model, as OpenAI's `models.retrieve` asks for it. Model ids hold a slash
// ("openai/gpt-4o"), which clients send either as two path segments or encoded.
export const GET = v1(async (request, { params }) => {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;

  const { id } = await params;
  const modelId = (Array.isArray(id) ? id : [id]).join("/");
  const model = (await catalog()).models.find((entry) => entry.id === modelId);
  if (!model) return apiError(404, `Unknown model "${modelId}". GET /v1/models lists the ones you can use.`, "model_not_found");
  return Response.json(publicModel(model));
});

export const OPTIONS = preflight;
