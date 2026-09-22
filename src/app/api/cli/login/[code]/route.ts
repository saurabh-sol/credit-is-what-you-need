import { collectLogin } from "@/lib/cli-login";

// The terminal polls this until the browser has approved the code. The key
// comes back exactly once.
export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const result = await collectLogin(code);
  switch (result.status) {
    case "unknown":
      return Response.json({ status: "unknown", error: "That code is not known." }, { status: 404 });
    case "expired":
      return Response.json({ status: "expired", error: "That code has expired. Run `kredit login` again." }, { status: 410 });
    case "collected":
      return Response.json({ status: "collected", error: "That key was already collected." }, { status: 410 });
    case "pending":
      return Response.json({ status: "pending", interval: result.interval }, { status: 202 });
    default:
      return Response.json({ status: "approved", key: result.key, address: result.address, key_id: result.keyId });
  }
}
