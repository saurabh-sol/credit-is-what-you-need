import { clearSession } from "@/lib/session";

// POST /api/auth/logout?everywhere=1 also ends this wallet's sessions in every other browser.
export async function POST(request: Request) {
  const everywhere = new URL(request.url).searchParams.get("everywhere") === "1";
  await clearSession({ everywhere });
  return Response.json({ ok: true });
}
