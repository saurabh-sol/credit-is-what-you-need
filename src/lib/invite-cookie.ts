import { cookies } from "next/headers";
import { isAddress } from "viem";
import { REFERRAL_COOKIE, setReferrer } from "@/lib/referrals";

// A visitor who arrived through an invite link names their inviter on their
// first sign-in. Quietly skipped when it cannot apply (own link, already
// invited, or a wallet that has claimed before).
export async function bindInviter(address: string) {
  const jar = await cookies();
  const inviter = jar.get(REFERRAL_COOKIE)?.value;
  if (!inviter) return;
  jar.delete(REFERRAL_COOKIE);
  if (!isAddress(inviter)) return;
  try {
    await setReferrer(address, inviter);
  } catch {
    // Not the signer's problem; the dashboard explains the rules.
  }
}
