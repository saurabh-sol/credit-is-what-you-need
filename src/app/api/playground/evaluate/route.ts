import { evaluate, parseEvaluation } from "@/lib/evaluate";
import { apiError, PLAYGROUND_KEY_ID, rateLimited } from "@/lib/gateway";
import { getSession } from "@/lib/session";

// Evaluations for the playground, paid from the wallet session like chat.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return apiError(401, "Sign in with your wallet to use the playground.", "not_signed_in");
  const limited = rateLimited(`${PLAYGROUND_KEY_ID}:${session.address.toLowerCase()}`);
  if (limited) return limited;

  const body = parseEvaluation(await request.json().catch(() => null));
  if (typeof body === "string") return apiError(400, body, "invalid_body");

  const result = await evaluate({ keyId: PLAYGROUND_KEY_ID, address: session.address }, body, request.signal);
  if (result instanceof Response) return result;
  return Response.json({ answers: result.data.answers, usage: result.data.usage, credits: result.charge.credits, balance: result.charge.balance });
}
