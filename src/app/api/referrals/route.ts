import { isAddress } from "viem";
import { getReferrer, listInvited, REFERRAL_PERCENT, ReferralError, referralTotals, setReferrer } from "@/lib/referrals";
import { getSession } from "@/lib/session";

// Everything the invite card shows: your code, who you invited, what it paid.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  return Response.json({
    percent: REFERRAL_PERCENT,
    code: session.address,
    referrer: getReferrer(session.address),
    invited: listInvited(session.address),
    ...referralTotals(session.address),
  });
}

// Names the wallet that invited you. Once, and only before your first claim.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { referrer?: unknown } | null;
  const referrer = body?.referrer;
  if (typeof referrer !== "string" || !isAddress(referrer)) {
    return Response.json({ error: "Paste the inviter's wallet address (0x…)" }, { status: 400 });
  }
  try {
    setReferrer(session.address, referrer);
  } catch (error) {
    if (error instanceof ReferralError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return Response.json({ referrer: referrer.toLowerCase() }, { status: 201 });
}
