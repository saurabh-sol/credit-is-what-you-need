// The referral rules the interface needs to mention. Kept apart from
// referrals.ts, which talks to the database and so can only load on the server.

// Invite a wallet, and every time it claims credits you get this share on top.
export const REFERRAL_PERCENT = 10;
export const REFERRAL_COOKIE = "kredit_ref";
export const REFERRAL_COOKIE_TTL = 60 * 60 * 24 * 30; // an invite link is good for 30 days

export const referralShare = (claimed: number) => Math.floor((claimed * REFERRAL_PERCENT) / 100);
