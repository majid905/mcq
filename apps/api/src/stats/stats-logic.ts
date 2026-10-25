/** Pure rules behind the learning stats, kept free of I/O so they can be unit tested. */

const DHAKA_OFFSET_MS = 6 * 3600_000;

/** Asia/Dhaka calendar day (YYYY-MM-DD) of an instant. */
export function dhakaDayOf(at: Date | number): string {
  const ms = typeof at === 'number' ? at : at.getTime();
  return new Date(ms + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

export const dayBefore = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export interface StreakState {
  current: number;
  best: number;
  lastDay: string | null;
}

/**
 * Applies the days on which the user answered at least one question (any order, duplicates ok).
 * Same day: no change. The day after the last day: streak + 1. Any gap: back to 1.
 * Days older than `lastDay` (late events) are ignored.
 */
export function applyStreak(state: StreakState, days: Iterable<string>): StreakState {
  let { current, best, lastDay } = state;
  for (const day of [...new Set(days)].sort()) {
    if (lastDay !== null && day <= lastDay) continue;
    current = lastDay !== null && dayBefore(day) === lastDay ? current + 1 : 1;
    best = Math.max(best, current);
    lastDay = day;
  }
  return { current, best, lastDay };
}

export interface WrongState {
  wrongTimes: number;
  correctStreak: number;
}

/**
 * FR-PRAC-05: a wrong answer (re)adds the question to the revision list; two correct answers in a
 * row remove it. Returns null when the row should be deleted or was never needed.
 */
export function applyWrongList(existing: WrongState | null, correct: boolean): WrongState | null {
  if (!correct) {
    return { wrongTimes: (existing?.wrongTimes ?? 0) + 1, correctStreak: 0 };
  }
  if (!existing) return null;
  const streak = existing.correctStreak + 1;
  return streak >= 2 ? null : { wrongTimes: existing.wrongTimes, correctStreak: streak };
}

/** Weak topic: enough attempts to judge and under half right (FR-ANL-02). */
export const isWeak = (attempted: number, correct: number): boolean =>
  attempted >= 10 && correct / attempted < 0.5;
