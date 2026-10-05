/**
 * What changed in the routine this week: exercises swapped for something
 * else, and exercises the plan asked for that were not done.
 *
 * This is a log, not a nag. The gap list already says what work is still
 * owed by muscle group; this says what actually happened to the plan, which
 * is the thing you cannot reconstruct a week later ("did I swap that, or just
 * skip it?").
 */
import { differenceInCalendarDays } from 'date-fns';
import { DAY_NAMES, type Exercise, type ExerciseSwap, type Template, type WeekStartDay, type Workout, type WorkoutSet } from '../types';
import { weekStartFor } from './weekProgress';

export interface RoutineChange {
  kind: 'swap' | 'missed';
  /** Day it happened, e.g. "Thursday". */
  dayLabel: string;
  /** ISO timestamp, for ordering. */
  at: string;
  /** The exercise the plan named. */
  exerciseId: string;
  exerciseName: string;
  /** What was done instead. Swaps only. */
  replacementId?: string;
  replacementName?: string;
  /** The session it happened in, when it came from a template. */
  templateName?: string;
}

export interface RoutineChangesInput {
  workouts: Workout[];
  sets: WorkoutSet[];
  exercises: Exercise[];
  swaps: ExerciseSwap[];
  templates: Template[];
  weekStartDay: WeekStartDay;
  now?: Date;
}

/**
 * Changes from the current training week, newest first.
 *
 * A swap is reported from the swap log. A miss is a template exercise a
 * finished session recorded as skipped — unless the same exercise was done
 * somewhere else this week, in which case nothing was missed. An exercise
 * that was swapped out in the same session is reported as a swap, not twice.
 */
export function routineChanges({
  workouts,
  sets,
  exercises,
  swaps,
  templates,
  weekStartDay,
  now = new Date(),
}: RoutineChangesInput): RoutineChange[] {
  const weekStart = weekStartFor(weekStartDay, now);
  const nameById = new Map(exercises.map(e => [e.id, e.name]));
  const templateById = new Map(templates.map(t => [t.id, t]));
  const workoutById = new Map(workouts.map(w => [w.id, w]));

  const doneThisWeek = new Set(
    sets
      .filter(s => {
        const logged = new Date(s.loggedAt);
        return Number.isFinite(logged.getTime()) && logged >= weekStart && logged <= now;
      })
      .map(s => s.exerciseId),
  );

  const inWeek = (iso: string | null | undefined): Date | null => {
    if (!iso) return null;
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime()) || date < weekStart || date > now) return null;
    return date;
  };

  const out: RoutineChange[] = [];
  const swappedInWorkout = new Set<string>();

  for (const swap of swaps) {
    const date = inWeek(swap.swappedAt);
    if (!date) continue;
    // A swap chain that ends where it started is not a change.
    if (swap.originalExerciseId === swap.currentExerciseId) continue;
    swappedInWorkout.add(`${swap.workoutId}:${swap.originalExerciseId}`);
    const workout = workoutById.get(swap.workoutId);
    out.push({
      kind: 'swap',
      dayLabel: DAY_NAMES[date.getDay()],
      at: date.toISOString(),
      exerciseId: swap.originalExerciseId,
      exerciseName: nameById.get(swap.originalExerciseId) ?? 'Removed exercise',
      replacementId: swap.currentExerciseId,
      replacementName: nameById.get(swap.currentExerciseId) ?? 'Another exercise',
      templateName: workout?.templateId ? templateById.get(workout.templateId)?.name : undefined,
    });
  }

  for (const workout of workouts) {
    const date = inWeek(workout.completedAt);
    if (!date) continue;
    for (const exerciseId of workout.skippedExerciseIds ?? []) {
      if (doneThisWeek.has(exerciseId)) continue; // done elsewhere this week
      if (swappedInWorkout.has(`${workout.id}:${exerciseId}`)) continue; // already reported as a swap
      out.push({
        kind: 'missed',
        dayLabel: DAY_NAMES[date.getDay()],
        at: date.toISOString(),
        exerciseId,
        exerciseName: nameById.get(exerciseId) ?? 'Removed exercise',
        templateName: workout.templateId ? templateById.get(workout.templateId)?.name : undefined,
      });
    }
  }

  return out.sort((a, b) => b.at.localeCompare(a.at) || a.exerciseName.localeCompare(b.exerciseName));
}

/** "Thursday" for this week's days; the date for anything older. */
export function changeDayLabel(change: RoutineChange, now: Date = new Date()): string {
  const date = new Date(change.at);
  return differenceInCalendarDays(now, date) > 6 ? date.toLocaleDateString() : change.dayLabel;
}
