import { all, one, run } from "./db.ts";
import { referralPayable, utcDayStart } from "./fairness.ts";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_TTL, REFERRAL_PERCENT, referralShare } from "./referral-rules.ts";

// Referrals: invite a wallet, and every time it claims credits you get a share
// on top. The invited wallet loses nothing. A wallet names its inviter once,
// before its first claim, so the share only ever covers claims made after the
// invite. Claims are capped and pay once, so there is nothing to farm here.
export { REFERRAL_COOKIE, REFERRAL_COOKIE_TTL, REFERRAL_PERCENT, referralShare };

const lower = (address: string) => address.toLowerCase();

export class ReferralError extends Error {}

export async function getReferrer(address: string) {
  const row = await one<{ referrer: string }>("SELECT referrer FROM referrals WHERE address = ?", [lower(address)]);
  return row?.referrer ?? null;
}

const hasEarned = async (address: string) =>
  Boolean(await one("SELECT 1 FROM ledger WHERE address = ? AND amount > 0 LIMIT 1", [lower(address)]));

// Names the wallet that invited `address`. Throws a ReferralError with a
// message fit for the screen when it cannot be done.
export async function setReferrer(address: string, referrer: string) {
  const invitee = lower(address);
  const inviter = lower(referrer);
  if (invitee === inviter) throw new ReferralError("You cannot invite yourself.");
  if (await getReferrer(invitee)) throw new ReferralError("This wallet already has an inviter.");
  if (await hasEarned(invitee)) throw new ReferralError("An inviter can only be named before your first claim.");
  // No loops: your inviter cannot be someone you invited, however far down.
  for (let up = await getReferrer(inviter), hops = 0; up && hops < 20; up = await getReferrer(up), hops++) {
    if (up === invitee) throw new ReferralError("That wallet is already in your invite chain.");
  }
  await run("INSERT INTO referrals (address, referrer) VALUES (?, ?)", [invitee, inviter]);
}

export type Invited = { address: string; name: string | null; claimed: number; paid: number; joinedAt: string };

// The wallets `referrer` invited, most rewarding first.
export async function listInvited(referrer: string) {
  const rows = await all<Invited>(
    `SELECT r.address AS address, p.name AS name, r.claimed AS claimed, r.paid AS paid, r.created_at AS "joinedAt"
     FROM referrals r LEFT JOIN profiles p ON p.address = r.address
     WHERE r.referrer = ? ORDER BY r.paid DESC, r.created_at`,
    [lower(referrer)],
  );
  return rows.map((row) => ({ ...row }));
}

export async function referralTotals(referrer: string) {
  const row = await one<{ count: number; earned: number }>(
    "SELECT COUNT(*)::int AS count, COALESCE(SUM(paid), 0)::int AS earned FROM referrals WHERE referrer = ?",
    [lower(referrer)],
  );
  return { count: row?.count ?? 0, earned: row?.earned ?? 0 };
}

// What an inviter has been paid so far today, against the daily referral cap.
async function paidToday(inviter: string, now = Date.now()) {
  const row = await one<{ paid: number }>(
    "SELECT COALESCE(SUM(amount), 0)::int AS paid FROM ledger WHERE address = ? AND kind = 'referral' AND created_at >= ?",
    [lower(inviter), utcDayStart(now)],
  );
  return row?.paid ?? 0;
}

// Called inside the claim transaction: pays the inviter their share of what
// `address` just claimed, and remembers both numbers for the invite list.
// The fair play gates apply: the invitee must have been active on enough
// days, the claim must be big enough to count, and the inviter's day is capped.
export async function payReferral(address: string, claimed: number, network: string, inviteeActiveDays = Infinity) {
  const inviter = await getReferrer(address);
  if (!inviter || claimed <= 0) return 0;
  const share = referralPayable(referralShare(claimed), claimed, inviteeActiveDays, await paidToday(inviter));
  await run("UPDATE referrals SET claimed = claimed + ?, paid = paid + ? WHERE address = ?", [claimed, share, lower(address)]);
  if (share > 0) {
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    await run("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, ?, 'referral', ?)", [
      inviter,
      share,
      `${REFERRAL_PERCENT}% of a claim by ${short} on ${network}`,
    ]);
  }
  return share;
}
