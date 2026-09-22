import { db } from "./db.ts";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_TTL, REFERRAL_PERCENT, referralShare } from "./referral-rules.ts";

// Referrals: invite a wallet, and every time it claims credits you get a share
// on top. The invited wallet loses nothing. A wallet names its inviter once,
// before its first claim, so the share only ever covers claims made after the
// invite. Claims are capped and pay once, so there is nothing to farm here.
export { REFERRAL_COOKIE, REFERRAL_COOKIE_TTL, REFERRAL_PERCENT, referralShare };

const lower = (address: string) => address.toLowerCase();

export class ReferralError extends Error {}

export function getReferrer(address: string) {
  const row = db().prepare("SELECT referrer FROM referrals WHERE address = ?").get(lower(address)) as
    | { referrer: string }
    | undefined;
  return row?.referrer ?? null;
}

const hasEarned = (address: string) =>
  Boolean(db().prepare("SELECT 1 FROM ledger WHERE address = ? AND amount > 0 LIMIT 1").get(lower(address)));

// Names the wallet that invited `address`. Throws a ReferralError with a
// message fit for the screen when it cannot be done.
export function setReferrer(address: string, referrer: string) {
  const invitee = lower(address);
  const inviter = lower(referrer);
  if (invitee === inviter) throw new ReferralError("You cannot invite yourself.");
  if (getReferrer(invitee)) throw new ReferralError("This wallet already has an inviter.");
  if (hasEarned(invitee)) throw new ReferralError("An inviter can only be named before your first claim.");
  // No loops: your inviter cannot be someone you invited, however far down.
  for (let up = getReferrer(inviter), hops = 0; up && hops < 20; up = getReferrer(up), hops++) {
    if (up === invitee) throw new ReferralError("That wallet is already in your invite chain.");
  }
  db().prepare("INSERT INTO referrals (address, referrer) VALUES (?, ?)").run(invitee, inviter);
}

export type Invited = { address: string; name: string | null; claimed: number; paid: number; joinedAt: string };

// The wallets `referrer` invited, most rewarding first.
export function listInvited(referrer: string) {
  return db()
    .prepare(
      `SELECT r.address AS address, p.name AS name, r.claimed AS claimed, r.paid AS paid, r.created_at AS joinedAt
       FROM referrals r LEFT JOIN profiles p ON p.address = r.address
       WHERE r.referrer = ? ORDER BY r.paid DESC, r.created_at`,
    )
    .all(lower(referrer))
    .map((row) => ({ ...row })) as Invited[];
}

export function referralTotals(referrer: string) {
  const row = db()
    .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(paid), 0) AS earned FROM referrals WHERE referrer = ?")
    .get(lower(referrer)) as { count: number; earned: number };
  return { count: row.count, earned: row.earned };
}

// Called inside the claim transaction: pays the inviter their share of what
// `address` just claimed, and remembers both numbers for the invite list.
export function payReferral(address: string, claimed: number, network: string) {
  const inviter = getReferrer(address);
  if (!inviter || claimed <= 0) return 0;
  const share = referralShare(claimed);
  const database = db();
  database
    .prepare("UPDATE referrals SET claimed = claimed + ?, paid = paid + ? WHERE address = ?")
    .run(claimed, share, lower(address));
  if (share > 0) {
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    database
      .prepare("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, 'referral', ?)")
      .run(inviter, share, `${REFERRAL_PERCENT}% of a claim by ${short} on ${network}`);
  }
  return share;
}
