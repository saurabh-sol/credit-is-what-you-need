import { complete } from "@/lib/completions";
import { authenticate, preflight, v1 } from "@/lib/gateway";

export const POST = v1(async (request) => {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;
  return complete(caller, request);
});

export const OPTIONS = preflight;
