/**
 * What is already done this training week.
 *
 * Training at night after a short morning session means the same exercise can
 * appear twice in one week's plan. Rather than nag about it, the app says it
 * plainly: an exercise done earlier this week is marked as such on the card.
 * What is still *owed* is counted by muscle group instead — see weekGaps.
 */
import { startOfWeek } from 'date-fns';
import { DAY_NAMES, type WeekStartDay, type WorkoutSet } from '../types';

export interface DoneThisWeek {
  /** Day the most recent set was logged, e.g. "Saturday". */
  dayLabel: string;
  sets: number;
  /** True when it happened in a workout other than the one being viewed. */
  inEarlierWorkout: boolean;
}

export function weekStartFor(weekStartDay: WeekStartDay, now: Date = new Date()): Date {
  return startOfWeek(now, { weekStartsOn: weekStartDay === 'monday' ? 1 : 0 });
}

/**
 * Per exercise id, what was logged for it so far this week. `currentWorkoutId`
 * marks which sets belong to the session being viewed, so a card can say "done
 * Saturday" without counting the set just logged.
 */
export function doneThisWeekByExercise(
  sets: WorkoutSet[],
  weekStartDay: WeekStartDay,
  now: Date = new Date(),
  currentWorkoutId?: string | null,
): Map<string, DoneThisWeek> {
  const weekStart = weekStartFor(weekStartDay, now);
  const byExercise = new Map<string, { newest: Date; sets: number; earlier: number }>();

  for (const set of sets) {
    const logged = new Date(set.loggedAt);
    if (!Number.isFinite(logged.getTime()) || logged < weekStart || logged > now) continue;
    const entry = byExercise.get(set.exerciseId) ?? { newest: logged, sets: 0, earlier: 0 };
    entry.sets += 1;
    if (logged > entry.newest) entry.newest = logged;
    if (set.workoutId !== currentWorkoutId) entry.earlier += 1;
    byExercise.set(set.exerciseId, entry);
  }

  const out = new Map<string, DoneThisWeek>();
  for (const [exerciseId, entry] of byExercise) {
    out.set(exerciseId, {
      dayLabel: DAY_NAMES[entry.newest.getDay()],
      sets: entry.sets,
      inEarlierWorkout: entry.earlier > 0,
    });
  }
  return out;
}
