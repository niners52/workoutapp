import * as Crypto from 'expo-crypto';
import {
  Exercise,
  Workout,
  WorkoutSet,
  Modality,
  Routine,
  RoutineDaySchedule,
  Template,
  CardioIntensity,
  dayTypeToModality,
} from '../types';
import {
  getExercises,
  addExercise as addExerciseToStorage,
  addWorkout,
  updateWorkout,
  addSet,
} from './storage';
import { syncWorkout, syncSet, syncExercise } from './syncService';

const generateId = () => Crypto.randomUUID();

/**
 * Decide what modality the active routine prescribes for a given day-of-week.
 * Prefers the routine day's explicit modality, then falls back to a heuristic:
 * - If any of the day's templates has a modality, use the first one (or strength
 *   if mixed — the most common case is a balance segment inside a strength day,
 *   which still presents as "strength" from the dashboard's perspective).
 * - Otherwise convert legacy dayType (workout/cardio/rest/active_recovery).
 *
 * Returns null when there's no active routine OR the day is unscheduled.
 */
export function todaysModality(
  routine: Routine | undefined,
  templates: Template[],
  dayOfWeek: number,
): { modality: Modality; day: RoutineDaySchedule } | null {
  if (!routine) return null;
  const day = routine.daySchedule.find(d => d.day === dayOfWeek);
  if (!day) return null;
  if (day.modality) return { modality: day.modality, day };

  // Look at templates' modality field
  if (day.templateIds.length > 0) {
    const tmpl = templates.find(t => day.templateIds.includes(t.id));
    if (tmpl?.modality) return { modality: tmpl.modality, day };
  }

  return { modality: dayTypeToModality(day.dayType), day };
}

const AEROBIC_EXERCISE_ID = 'aerobic-session';

/**
 * Find (or seed on first use) the built-in "Aerobic Session" exercise that
 * carries cardio entries. Keeps analytics in one place: cardio sets live in
 * the same WorkoutSet table as strength sets, distinguished by the optional
 * durationMin/avgHR/etc. fields and by this exercise's modality.
 */
export async function getOrCreateAerobicExercise(): Promise<Exercise> {
  const exercises = await getExercises();
  const existing = exercises.find(e => e.id === AEROBIC_EXERCISE_ID);
  if (existing) return existing;

  const aerobicExercise: Exercise = {
    id: AEROBIC_EXERCISE_ID,
    baseName: 'Aerobic Session',
    name: 'Aerobic Session',
    equipment: 'other',
    primaryMuscleGroups: ['miscellaneous'],
    locationIds: ['gym', 'home'],
    isCustom: false,
  };
  await addExerciseToStorage(aerobicExercise);
  syncExercise(aerobicExercise).catch(e => console.log('Sync error:', e));
  return aerobicExercise;
}

export interface AerobicSessionInput {
  durationMin: number;
  intensityRPE?: number;
  avgHR?: number;
  maxHR?: number;
  distance?: number;     // miles
  activeEnergy?: number; // kcal
  intensityZone?: CardioIntensity;
  notes?: string;
}

/**
 * Log a completed aerobic session as a Workout + single WorkoutSet with cardio
 * fields populated. Returns the workout so callers can navigate to a summary.
 */
export async function logAerobicSession(input: AerobicSessionInput): Promise<Workout> {
  const exercise = await getOrCreateAerobicExercise();
  const now = new Date();
  // Compute start time from duration so the workout's duration in analytics is correct
  const startedAt = new Date(now.getTime() - input.durationMin * 60 * 1000).toISOString();
  const completedAt = now.toISOString();

  const workout: Workout = {
    id: generateId(),
    startedAt,
    completedAt,
    templateId: null,
  };
  await addWorkout(workout);
  syncWorkout(workout).catch(e => console.log('Sync error:', e));

  const set: WorkoutSet = {
    id: generateId(),
    workoutId: workout.id,
    exerciseId: exercise.id,
    reps: 0,
    weight: 0,
    loggedAt: completedAt,
    durationMin: input.durationMin,
    intensityRPE: input.intensityRPE,
    avgHR: input.avgHR,
    maxHR: input.maxHR,
    distance: input.distance,
    activeEnergy: input.activeEnergy,
    intensityZone: input.intensityZone,
  };
  await addSet(set);
  syncSet(set).catch(e => console.log('Sync error:', e));

  return workout;
}

/**
 * Mark a recovery day complete — creates a finished Workout with no sets, so
 * it counts toward the training streak / training-day grade even though no
 * sets were performed. Idempotent per-day: returns the existing Workout if
 * the user already marked recovery complete today.
 */
export async function markRecoveryComplete(allWorkouts: Workout[]): Promise<Workout> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const existing = allWorkouts.find(w => {
    if (!w.completedAt) return false;
    return w.completedAt.slice(0, 10) === todayStr;
  });
  if (existing) return existing;

  const now = new Date().toISOString();
  const workout: Workout = {
    id: generateId(),
    startedAt: now,
    completedAt: now,
    templateId: null,
  };
  await addWorkout(workout);
  syncWorkout(workout).catch(e => console.log('Sync error:', e));
  return workout;
}

/**
 * True iff one of the given sets has cardio fields populated (durationMin > 0).
 * Helper for analytics that need to separate aerobic vs strength sets.
 */
export function isAerobicSet(set: WorkoutSet): boolean {
  return typeof set.durationMin === 'number' && set.durationMin > 0;
}

/**
 * Derive a coarse intensity zone for an aerobic session. Prefers HR%max when
 * we know maxHR (220 - age fallback), then falls back to RPE, then to a crude
 * absolute-HR heuristic. Returns null when we have nothing to work with so the
 * caller doesn't store a misleading guess.
 *
 * Thresholds align with the MS preset's "60-70% HRmax / RPE 11-13 = moderate" target.
 */
export function deriveIntensityZone(input: {
  avgHR?: number;
  rpe?: number;
  estimatedMaxHR?: number;
}): 'low' | 'moderate' | 'high' | null {
  const { avgHR, rpe, estimatedMaxHR } = input;
  if (avgHR && estimatedMaxHR && estimatedMaxHR > 0) {
    const pct = avgHR / estimatedMaxHR;
    if (pct >= 0.8) return 'high';
    if (pct >= 0.6) return 'moderate';
    return 'low';
  }
  if (rpe) {
    if (rpe >= 14) return 'high';
    if (rpe >= 11) return 'moderate';
    return 'low';
  }
  if (avgHR) {
    if (avgHR >= 150) return 'high';
    if (avgHR >= 120) return 'moderate';
    return 'low';
  }
  return null;
}
