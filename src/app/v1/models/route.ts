import { providerModels } from "@/lib/catalog";
import { authenticate, ECHO_MODEL } from "@/lib/gateway";

export async function GET(request: Request) {
  const caller = authenticate(request);
  if (caller instanceof Response) return caller;

  // The provider's list is a nicety; the echo model is always available.
  const models: unknown[] = [{ id: ECHO_MODEL, object: "model", owned_by: "kredit" }, ...(await providerModels())];
  return Response.json({ object: "list", data: models });
}
