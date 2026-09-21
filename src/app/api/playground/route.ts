import { complete } from "@/lib/completions";
import { apiError, PLAYGROUND_KEY_ID, rateLimited } from "@/lib/gateway";
import { getSession } from "@/lib/session";

// The playground talks to the same gateway as /v1, but signs in with the
// wallet session instead of an API key, so nobody pastes a key into a web page.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return apiError(401, "Sign in with your wallet to use the playground.", "not_signed_in");

  const limited = rateLimited(`${PLAYGROUND_KEY_ID}:${session.address.toLowerCase()}`);
  if (limited) return limited;

  return complete({ keyId: PLAYGROUND_KEY_ID, address: session.address }, request);
}
