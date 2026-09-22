import { one } from "@/lib/db";

// For the host's health check: the app is only healthy if it can reach its database.
export async function GET() {
  try {
    await one("SELECT 1");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
