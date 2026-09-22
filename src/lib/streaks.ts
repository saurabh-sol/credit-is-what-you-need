// Streak bonus: coming back day after day pays extra. Every UTC day with at
// least one successful transaction is an active day; consecutive active days
// form a streak. From the second day on, each day of a streak pays a bonus
// that grows with the streak and then levels off.
//
//   day 2 = 20, day 3 = 30, ... day 10 and beyond = 100 credits a day.
//
// It cannot be bought in one afternoon: a streak takes real calendar days, and
// each calendar day pays its bonus once.

export const STREAK_STEP = 10; // credits per day of streak length
export const STREAK_MAX_DAY = 10; // the bonus stops growing here
export const STREAK_MAX_BONUS = STREAK_STEP * STREAK_MAX_DAY;
export const STREAK_LABEL = "Streak bonus";

export type StreakDay = { day: string; streakDay: number; credits: number };

const DAY_MS = 86_400_000;
const dayIndex = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

export const streakBonus = (streakDay: number) =>
  streakDay < 2 ? 0 : STREAK_STEP * Math.min(streakDay, STREAK_MAX_DAY);

// The bonus days in a record, oldest first. `days` are the UTC days (YYYY-MM-DD)
// on which the wallet had at least one successful transaction.
export function streakDays(days: Iterable<string>): StreakDay[] {
  const ordered = [...new Set(days)].sort();
  const bonuses: StreakDay[] = [];
  let streak = 0;
  let previous: number | null = null;
  for (const day of ordered) {
    const index = dayIndex(day);
    streak = previous !== null && index === previous + 1 ? streak + 1 : 1;
    previous = index;
    const credits = streakBonus(streak);
    if (credits > 0) bonuses.push({ day, streakDay: streak, credits });
  }
  return bonuses;
}

export const longestStreak = (bonuses: StreakDay[]) =>
  bonuses.reduce((longest, bonus) => Math.max(longest, bonus.streakDay), bonuses.length > 0 ? 1 : 0);

export const streakLabel = (bonuses: StreakDay[]) => {
  const longest = longestStreak(bonuses);
  return `${STREAK_LABEL} (${longest} ${longest === 1 ? "day" : "days"} in a row)`;
};
