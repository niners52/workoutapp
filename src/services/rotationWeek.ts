/**
 * The app's view of the rotation week. All the rules live in
 * mcp-server/src/shared/weekPlan, which the MCP server compiles too; this file
 * only maps the app's types onto it and supplies weekly volume from
 * computeWeeklyVolume, the same counting the volume panel uses.
 *
 * The week is the phone's local week (Monday start), the same week the volume
 * panel buckets by. On Tyler's phone that is America/Chicago, which is what
 * the MCP server uses.
 */
import {
  DEFAULT_FLEX_MINUTES,
  flexPlan,
  owedList,
  recoveryWarnings,
  progressionFlag,
  rotationFromWeekdays,
  rotationState,
  weekStartInZone,
  type FlexPlan,
  type OwedItem,
  type PlanExercise,
  type PlanSet,
  type PlanTemplate,
  type PlanWorkout,
  type ProgressionFlag,
  type RecoveryWarning,
  type RotationState,
  type Tier,
} from '../../mcp-server/src/shared/weekPlan';
import { FLEX_POOL_TEMPLATE_ID } from '../data/fullBodyTemplates';
import type {
  Exercise,
  HealthTargets,
  MuscleGroupVolume,
  Routine,
  RoutineRotation,
  Template,
  UserSettings,
  WeekStartDay,
  Workout,
  WorkoutSet,
} from '../types';

export type { FlexItem, FlexPlan, OwedItem, RotationState, SlotState, Tier } from '../../mcp-server/src/shared/weekPlan';
export { DEFAULT_TIERS, DEFAULT_FLEX_MINUTES, parseRepRange, sessionDiff, applySessionEdits } from '../../mcp-server/src/shared/weekPlan';

export const DEVICE_TIME_ZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
  } catch {
    return 'America/Chicago';
  }
})();

export function toPlanExercise(e: Exercise): PlanExercise {
  return {
    id: e.id,
    name: e.name,
    primary: (e.primaryMuscleGroups?.length ? e.primaryMuscleGroups : e.primaryMuscleGroup ? [e.primaryMuscleGroup] : []) as string[],
    isUnilateral: !!e.isUnilateral,
    targetSets: e.targetSets ?? null,
    targetReps: e.targetReps ?? null,
    defaultWarmup: !!e.defaultWarmup,
    locationIds: e.locationIds ?? [],
  };
}

export function toPlanWorkout(w: Workout): PlanWorkout {
  return {
    id: w.id,
    templateId: w.templateId,
    startedAt: w.startedAt,
    completedAt: w.completedAt,
    locationId: w.locationId ?? null,
    isDeload: !!w.isDeload,
  };
}

export function toPlanSet(s: WorkoutSet): PlanSet {
  return { workoutId: s.workoutId, exerciseId: s.exerciseId, loggedAt: s.loggedAt, reps: s.reps, weight: s.weight, isWarmup: s.isWarmup ?? null };
}

export function toPlanTemplate(t: Template): PlanTemplate {
  return { id: t.id, name: t.name, exerciseIds: t.exerciseIds };
}

/**
 * The routine's rotation, or one derived from its weekday schedule when it
 * has none yet (migration V22 writes it; this covers the moment before).
 */
export function rotationOf(routine: Routine, templates: Template[]): RoutineRotation {
  if (routine.rotation?.slots?.length) return routine.rotation;
  const fallback = templates.some(t => t.id === FLEX_POOL_TEMPLATE_ID) ? FLEX_POOL_TEMPLATE_ID : null;
  return rotationFromWeekdays(routine.daySchedule, fallback);
}

export function weekStartFor(weekStartDay: WeekStartDay, now: Date = new Date()): Date {
  return weekStartInZone(now, DEVICE_TIME_ZONE, weekStartDay);
}

export function tiersOf(t: HealthTargets | undefined): Partial<Record<string, Tier>> | undefined {
  return t?.muscleTiers;
}

export interface WeekView {
  rotation: RoutineRotation;
  state: RotationState;
  owed: OwedItem[];
  weekStart: Date;
}

export function buildWeek({
  routine,
  templates,
  workouts,
  sets,
  exercises,
  settings,
  now = new Date(),
}: {
  routine: Routine;
  templates: Template[];
  workouts: Workout[];
  sets: WorkoutSet[];
  exercises: Exercise[];
  settings: Pick<UserSettings, 'weekStartDay' | 'healthTargets'>;
  now?: Date;
}): WeekView {
  const rotation = rotationOf(routine, templates);
  const weekStart = weekStartFor(settings.weekStartDay, now);
  const input = {
    rotation,
    templates: templates.map(toPlanTemplate),
    workouts: workouts.map(toPlanWorkout),
    sets: sets.map(toPlanSet),
    exercises: exercises.map(toPlanExercise),
    weekStart,
    now,
  };
  const state = rotationState(input);
  const owed = owedList({ ...input, state, tiers: tiersOf(settings.healthTargets) });
  return { rotation, state, owed, weekStart };
}

export function buildFlex({
  week,
  templates,
  workouts,
  sets,
  exercises,
  volume,
  settings,
  locationId,
  removed,
  added,
}: {
  week: WeekView;
  templates: Template[];
  workouts: Workout[];
  sets: WorkoutSet[];
  exercises: Exercise[];
  /** computeWeeklyVolume(...).muscleGroups for this week. */
  volume: MuscleGroupVolume[];
  settings: Pick<UserSettings, 'healthTargets'>;
  locationId?: string | null;
  removed?: string[];
  added?: string[];
}): FlexPlan {
  const flexTemplate = templates.find(t => t.id === week.rotation.flexTemplateId);
  return flexPlan({
    owed: week.owed,
    flexTemplate: flexTemplate ? toPlanTemplate(flexTemplate) : null,
    exercises: exercises.map(toPlanExercise),
    doneByMuscle: Object.fromEntries(volume.map(mg => [mg.muscleGroup, mg.sets])),
    targets: Object.fromEntries(volume.filter(mg => mg.target > 0).map(mg => [mg.muscleGroup, mg.target])),
    tiers: tiersOf(settings.healthTargets),
    locationId: locationId ?? null,
    historySets: sets.map(toPlanSet),
    historyWorkouts: workouts.map(toPlanWorkout),
    capMinutes: settings.healthTargets?.flexMinutes ?? DEFAULT_FLEX_MINUTES,
    removed,
    added,
  });
}

/** Exercises in the session about to start whose muscle was trained in the last 18 h. */
export function sessionRecoveryWarnings(
  exerciseIds: string[],
  exercises: Exercise[],
  sets: WorkoutSet[],
  currentWorkoutId: string,
  now: Date = new Date(),
): RecoveryWarning[] {
  return recoveryWarnings({
    exerciseIds,
    exercises: exercises.map(toPlanExercise),
    sets: sets.map(toPlanSet),
    now,
    excludeWorkoutId: currentWorkoutId,
  });
}

/** "Add weight next time", for an exercise as it appears in a new session. */
export function exerciseProgressionFlag(
  exercise: Exercise,
  sets: WorkoutSet[],
  workouts: Workout[],
  locationId: string | null | undefined,
  currentWorkoutId: string,
): ProgressionFlag | null {
  return progressionFlag({
    exercise: toPlanExercise(exercise),
    sets: sets.filter(s => s.exerciseId === exercise.id).map(toPlanSet),
    workouts: workouts.map(toPlanWorkout),
    locationId,
    excludeWorkoutId: currentWorkoutId,
  });
}
