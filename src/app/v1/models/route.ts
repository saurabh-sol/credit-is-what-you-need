import { authenticate, ECHO_MODEL, upstream } from "@/lib/gateway";

export async function GET(request: Request) {
  const caller = authenticate(request);
  if (caller instanceof Response) return caller;

  const models: unknown[] = [{ id: ECHO_MODEL, object: "model", owned_by: "kredit" }];
  const { baseUrl, apiKey } = upstream();
  if (apiKey) {
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) models.push(...((await response.json()).data ?? []));
    } catch {
      // The provider's list is a nicety; the echo model is always available.
    }
  }
  return Response.json({ object: "list", data: models });
}
