import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAddress } from "viem";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_TTL } from "@/lib/referrals";

// An invite link: /r/<inviter's wallet>. It remembers who sent the visitor
// here and takes them to the home page; the inviter is bound when they first
// sign in (see /api/auth/verify).
export async function GET(_request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (isAddress(address)) {
    (await cookies()).set(REFERRAL_COOKIE, address.toLowerCase(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: REFERRAL_COOKIE_TTL,
    });
  }
  redirect("/");
}
