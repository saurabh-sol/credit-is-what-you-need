import { startLogin } from "@/lib/cli-login";
import { rateLimited } from "@/lib/gateway";
import { SITE_URL } from "@/lib/site";

// Step one of `kredit login`: the terminal asks for a code to show the person.
// { host?: "my-laptop" } in; { code, verify_url, expires_at, interval } out.
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimited(`cli-login:${ip}`, undefined, 10);
  if (limited) return Response.json({ error: "Too many login attempts. Wait a minute." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { host?: unknown } | null;
  const host = typeof body?.host === "string" ? body.host : null;
  const login = await startLogin(host);
  return Response.json({
    code: login.code,
    verify_url: `${SITE_URL}/cli/verify?code=${login.code}`,
    expires_at: login.expiresAt,
    interval: login.interval,
  });
}
