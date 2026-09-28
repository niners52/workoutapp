/**
 * What is already done this training week, and what is left.
 *
 * Training at night after a short morning session means the same exercise can
 * appear twice in one week's plan. Rather than nag about it, the app says it
 * plainly: an exercise done earlier this week is marked as such on the card,
 * and "Left this week" shows only what is actually outstanding.
 */
import { startOfWeek } from 'date-fns';
import { DAY_NAMES, type Exercise, type WeekStartDay, type Workout, type WorkoutSet } from '../types';

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

export interface RemainingExercise {
  exercise: Exercise;
  /** Where it came from: a plan for a day this week, or a session it was skipped in. */
  reason: 'planned' | 'skipped';
  /** Day it was planned or skipped, e.g. "Monday". */
  dayLabel: string;
}

/**
 * Exercises this week's plan expects that have no sets yet this week.
 *
 * `plannedExerciseIds` is whatever the week's routine asks for; skipped
 * exercises from finished sessions count too, since a skip is work still owed.
 * Anything already logged this week — in any session, at any gym — is done.
 */
export function remainingThisWeek(
  plannedExerciseIds: Array<{ exerciseId: string; dayLabel: string }>,
  workouts: Workout[],
  sets: WorkoutSet[],
  exercises: Exercise[],
  weekStartDay: WeekStartDay,
  now: Date = new Date(),
  dismissedExerciseIds: Set<string> = new Set(),
): RemainingExercise[] {
  const weekStart = weekStartFor(weekStartDay, now);
  const done = doneThisWeekByExercise(sets, weekStartDay, now);
  const byId = new Map(exercises.map(e => [e.id, e]));

  const candidates = new Map<string, { reason: 'planned' | 'skipped'; dayLabel: string }>();
  for (const { exerciseId, dayLabel } of plannedExerciseIds) {
    if (!candidates.has(exerciseId)) candidates.set(exerciseId, { reason: 'planned', dayLabel });
  }
  for (const workout of workouts) {
    if (!workout.completedAt) continue;
    const completed = new Date(workout.completedAt);
    if (!Number.isFinite(completed.getTime()) || completed < weekStart) continue;
    for (const id of workout.skippedExerciseIds ?? []) {
      candidates.set(id, { reason: 'skipped', dayLabel: DAY_NAMES[completed.getDay()] });
    }
  }

  return [...candidates.entries()]
    .flatMap(([exerciseId, info]) => {
      if (done.has(exerciseId) || dismissedExerciseIds.has(exerciseId)) return [];
      const exercise = byId.get(exerciseId);
      return exercise ? [{ exercise, ...info }] : [];
    })
    .sort((a, b) => a.exercise.name.localeCompare(b.exercise.name));
}
