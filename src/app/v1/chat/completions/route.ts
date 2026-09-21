import { complete } from "@/lib/completions";
import { authenticate } from "@/lib/gateway";

export async function POST(request: Request) {
  const caller = authenticate(request);
  if (caller instanceof Response) return caller;
  return complete(caller, request);
}
