import { db } from "@/lib/db";

// For the host's health check: the app is only healthy if it can reach its database.
export function GET() {
  try {
    db().prepare("SELECT 1").get();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
