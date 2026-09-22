import { complete } from "@/lib/completions";
import { authenticate } from "@/lib/gateway";

export async function POST(request: Request) {
  const caller = authenticate(request);
  if (caller instanceof Response) return caller;
  return complete(caller, request);
}

// Browser clients ask before sending a key; the CORS headers come from next.config.
export const OPTIONS = () => new Response(null, { status: 204 });
