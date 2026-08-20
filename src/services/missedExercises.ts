import { startOfWeek } from 'date-fns';
import { DAY_NAMES, Exercise, ExerciseSwap, WeekStartDay, Workout, WorkoutSet } from '../types';

/**
 * The home screen's catch-up list: exercises that were planned in one of this
 * week's completed workouts but never actually got done.
 *
 * Two ways an exercise ends up "planned but not done":
 *  - skipped   — it stayed in the workout and finished with zero logged sets
 *                (recorded on the workout as skippedExerciseIds)
 *  - swapped   — it was swapped out for a replacement mid-workout, so the
 *                original never got its sets that day
 *
 * Either way, a set logged for that exercise in ANY workout later (or earlier)
 * in the same training week clears it from the list — e.g. swap out Cable Curl
 * on Monday, then actually do Cable Curl on Tuesday, and Monday's miss no
 * longer needs catching up.
 */
export interface MissedExercise {
  exercise: Exercise;
  reason: 'skipped' | 'swapped_out';
  dayLabel: string; // day of the most recent miss, e.g. "Monday"
}

export function getMissedExercisesThisWeek(
  workouts: Workout[],
  sets: WorkoutSet[],
  exerciseSwaps: ExerciseSwap[],
  exercises: Exercise[],
  weekStartDay: WeekStartDay = 'monday',
): MissedExercise[] {
  const weekStart = startOfWeek(new Date(), {
    weekStartsOn: weekStartDay === 'monday' ? 1 : 0,
  });

  // Only finished workouts count — an in-progress session's exercises aren't
  // missed yet, and its swaps may still be reverted.
  const completedThisWeek = workouts.filter(w => {
    if (!w.completedAt) return false;
    const t = new Date(w.completedAt);
    return Number.isFinite(t.getTime()) && t >= weekStart;
  });
  if (completedThisWeek.length === 0) return [];

  // Anything with a set logged this week is done, regardless of which workout
  // it happened in. This is what clears Monday's miss when it's made up Tuesday.
  const doneThisWeek = new Set<string>();
  for (const set of sets) {
    const logged = new Date(set.loggedAt);
    if (Number.isFinite(logged.getTime()) && logged >= weekStart) {
      doneThisWeek.add(set.exerciseId);
    }
  }

  // Most recent miss wins when the same exercise was missed on multiple days.
  const misses = new Map<string, { reason: MissedExercise['reason']; missedAt: string }>();
  const record = (exerciseId: string, reason: MissedExercise['reason'], missedAt: string) => {
    if (doneThisWeek.has(exerciseId)) return;
    const existing = misses.get(exerciseId);
    if (!existing || missedAt.localeCompare(existing.missedAt) > 0) {
      misses.set(exerciseId, { reason, missedAt });
    }
  };

  const completedIds = new Set(completedThisWeek.map(w => w.id));

  for (const workout of completedThisWeek) {
    for (const id of workout.skippedExerciseIds ?? []) {
      record(id, 'skipped', workout.completedAt!);
    }
  }

  // Swapped-out originals from this week's completed workouts. Storage already
  // collapses swap chains and drops round-trips, so originalExerciseId is the
  // template exercise that truly went undone.
  for (const swap of exerciseSwaps) {
    if (completedIds.has(swap.workoutId)) {
      record(swap.originalExerciseId, 'swapped_out', swap.swappedAt);
    }
  }

  const byId = new Map(exercises.map(e => [e.id, e]));
  return Array.from(misses.entries())
    .flatMap(([exerciseId, miss]) => {
      const exercise = byId.get(exerciseId);
      if (!exercise) return []; // deleted/unknown exercise — nothing to act on
      return [{
        exercise,
        reason: miss.reason,
        dayLabel: DAY_NAMES[new Date(miss.missedAt).getDay()],
      }];
    })
    .sort(
      (a, b) =>
        a.exercise.name.localeCompare(b.exercise.name),
    );
}
