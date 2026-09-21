import { catalog } from "@/lib/catalog";

export async function GET() {
  return Response.json(await catalog());
}
