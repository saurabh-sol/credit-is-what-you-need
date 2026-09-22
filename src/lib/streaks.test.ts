import assert from "node:assert/strict";
import { test } from "node:test";
import { longestStreak, STREAK_MAX_BONUS, streakBonus, streakDays } from "./streaks.ts";

test("the bonus grows by the day and levels off", () => {
  assert.equal(streakBonus(1), 0);
  assert.equal(streakBonus(2), 20);
  assert.equal(streakBonus(10), STREAK_MAX_BONUS);
  assert.equal(streakBonus(400), STREAK_MAX_BONUS);
});

test("only consecutive days form a streak; gaps start over", () => {
  const days = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-05", "2026-03-06"];
  assert.deepEqual(streakDays(days), [
    { day: "2026-03-02", streakDay: 2, credits: 20 },
    { day: "2026-03-03", streakDay: 3, credits: 30 },
    { day: "2026-03-06", streakDay: 2, credits: 20 },
  ]);
  assert.equal(longestStreak(streakDays(days)), 3);
});

test("order and repeats do not matter, and month ends are no gap", () => {
  const shuffled = ["2026-02-28", "2026-03-01", "2026-02-28", "2026-02-27"];
  assert.deepEqual(streakDays(shuffled).map((bonus) => bonus.day), ["2026-02-28", "2026-03-01"]);
  assert.deepEqual(streakDays([]), []);
  assert.equal(longestStreak([]), 0);
});
