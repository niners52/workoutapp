/**
 * What changed in the routine this week: exercises swapped for something
 * else, exercises the plan asked for that were not done, and whole scheduled
 * days that never happened.
 *
 * This is a log, not a nag. The gap list already says what work is still
 * owed by muscle group; this says what actually happened to the plan, which
 * is the thing you cannot reconstruct a week later ("did I swap that, or just
 * skip it?").
 */
import { addDays, differenceInCalendarDays, isSameDay, startOfDay } from 'date-fns';
import {
  DAY_NAMES,
  type Exercise,
  type ExerciseSwap,
  type Routine,
  type Template,
  type WeekStartDay,
  type Workout,
  type WorkoutLocation,
  type WorkoutSet,
} from '../types';
import { getTemplatesForDay } from './analytics';
import { weekStartFor } from './weekProgress';

export interface RoutineChange {
  /**
   * swap: one exercise replaced by another. missed: a template exercise a
   * session recorded as skipped. skippedDay: a scheduled template that was
   * never run this week — the session did not happen, or something else did.
   */
  kind: 'swap' | 'missed' | 'skippedDay';
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
  /** skippedDay: the template that was scheduled. */
  templateId?: string;
  /** skippedDay: what was trained that day instead, if anything. */
  instead?: { locationName?: string; sets: number };
}

export interface RoutineChangesInput {
  workouts: Workout[];
  sets: WorkoutSet[];
  exercises: Exercise[];
  swaps: ExerciseSwap[];
  templates: Template[];
  weekStartDay: WeekStartDay;
  now?: Date;
  /** The active routine. Without it there is no schedule to miss. */
  routine?: Routine;
  /** For naming the gym a replacement workout happened at. */
  locations?: WorkoutLocation[];
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
  routine,
  locations = [],
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

  out.push(...skippedDays({ routine, workouts, sets, templateById, locations, weekStart, now }));

  return out.sort((a, b) => b.at.localeCompare(a.at) || a.exerciseName.localeCompare(b.exerciseName));
}

/**
 * Scheduled days, before today, whose template was not run at any point this
 * week. Running it on another day is a move, not a miss, so that stays off the
 * list. Today is never reported: the session may still be coming tonight.
 */
function skippedDays({
  routine,
  workouts,
  sets,
  templateById,
  locations,
  weekStart,
  now,
}: {
  routine?: Routine;
  workouts: Workout[];
  sets: WorkoutSet[];
  templateById: Map<string, Template>;
  locations: WorkoutLocation[];
  weekStart: Date;
  now: Date;
}): RoutineChange[] {
  if (!routine) return [];

  const today = startOfDay(now);
  const thisWeek = workouts.filter(w => {
    const date = new Date(w.startedAt);
    return Number.isFinite(date.getTime()) && date >= weekStart && date <= now;
  });
  const templatesRun = new Set(thisWeek.map(w => w.templateId).filter((id): id is string => !!id));
  const setsByWorkout = new Map<string, number>();
  for (const set of sets) setsByWorkout.set(set.workoutId, (setsByWorkout.get(set.workoutId) ?? 0) + 1);
  const locationName = (id?: string) => locations.find(l => l.id === id)?.name;

  const out: RoutineChange[] = [];
  for (let date = startOfDay(weekStart); date < today; date = addDays(date, 1)) {
    for (const templateId of getTemplatesForDay(routine, date.getDay())) {
      if (templatesRun.has(templateId)) continue;
      const template = templateById.get(templateId);
      if (!template) continue;

      // What happened that day instead: the biggest session that actually
      // logged something. An empty, abandoned start is not a workout.
      const instead = thisWeek
        .filter(w => isSameDay(new Date(w.startedAt), date) && (setsByWorkout.get(w.id) ?? 0) > 0)
        .map(w => ({ locationName: locationName(w.locationId), sets: setsByWorkout.get(w.id) ?? 0 }))
        .sort((a, b) => b.sets - a.sets)[0];

      out.push({
        kind: 'skippedDay',
        dayLabel: DAY_NAMES[date.getDay()],
        // Midday, so it sorts among that day's other changes.
        at: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).toISOString(),
        exerciseId: template.exerciseIds[0] ?? templateId,
        exerciseName: template.name,
        templateId,
        templateName: template.name,
        instead,
      });
    }
  }
  return out;
}

/** "Thursday" for this week's days; the date for anything older. */
export function changeDayLabel(change: RoutineChange, now: Date = new Date()): string {
  const date = new Date(change.at);
  return differenceInCalendarDays(now, date) > 6 ? date.toLocaleDateString() : change.dayLabel;
}
