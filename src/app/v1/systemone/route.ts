import { evaluate, parseEvaluation } from "@/lib/evaluate";
import { apiError, authenticate, chargeHeaders, preflight, v1 } from "@/lib/gateway";

// TypeSafe's System One endpoint: `state` plus typed `questions` in, answers
// out. Also served at /typesafe/v1/systemone so the TypeSafe SDK can point
// its base URL at <this server>/typesafe.
export const POST = v1(async (request) => {
  const caller = authenticate(request);
  if (caller instanceof Response) return caller;

  const body = parseEvaluation(await request.json().catch(() => null));
  if (typeof body === "string") return apiError(400, body, "invalid_body");

  const result = await evaluate(caller, body, request.signal);
  if (result instanceof Response) return result;
  return Response.json(result.data, { headers: chargeHeaders(result.charge) });
});

export const OPTIONS = preflight;
