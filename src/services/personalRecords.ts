/**
 * Personal Records (PR) tracking service.
 *
 * PR Types tracked per exercise:
 * - Weight PR: heaviest weight at any rep count
 * - Rep PR: most reps at a given weight
 * - Volume PR: highest single-set volume (weight × reps)
 * - Estimated 1RM PR: highest calculated e1RM
 *
 * PRs are calculated from workout set history, not stored separately.
 * This keeps them always accurate and avoids sync issues.
 */

import { WorkoutSet, Exercise } from '../types';
import { estimated1RM } from './units';

export interface PersonalRecord {
  type: 'weight' | 'reps' | 'volume' | 'e1rm';
  value: number;
  weight: number;
  reps: number;
  date: string; // ISO string
  workoutId: string;
  exerciseId: string;
}

export interface ExercisePRs {
  exerciseId: string;
  weightPR: PersonalRecord | null;    // Heaviest weight lifted
  repPR: PersonalRecord | null;       // Most reps in a single set (at any weight)
  volumePR: PersonalRecord | null;    // Highest single-set volume (weight × reps)
  e1rmPR: PersonalRecord | null;      // Highest estimated 1RM
}

export interface PRCheckResult {
  isWeightPR: boolean;
  isRepPR: boolean;
  isVolumePR: boolean;
  isE1rmPR: boolean;
  isPR: boolean; // true if any PR was set
  records: PersonalRecord[];
}

/**
 * Calculate all PRs for a given exercise from set history.
 */
export function calculateExercisePRs(
  exerciseId: string,
  sets: WorkoutSet[],
  workoutDates: Map<string, string> // workoutId -> completedAt/startedAt ISO string
): ExercisePRs {
  const exerciseSets = sets.filter(s => s.exerciseId === exerciseId && s.weight > 0 && s.reps > 0);

  let weightPR: PersonalRecord | null = null;
  let repPR: PersonalRecord | null = null;
  let volumePR: PersonalRecord | null = null;
  let e1rmPR: PersonalRecord | null = null;

  for (const set of exerciseSets) {
    const date = workoutDates.get(set.workoutId) || set.loggedAt || '';
    const volume = set.weight * set.reps;
    const e1rm = estimated1RM(set.weight, set.reps);

    // Weight PR - heaviest weight
    if (!weightPR || set.weight > weightPR.value) {
      weightPR = {
        type: 'weight',
        value: set.weight,
        weight: set.weight,
        reps: set.reps,
        date,
        workoutId: set.workoutId,
        exerciseId,
      };
    }

    // Rep PR - most reps in a single set
    if (!repPR || set.reps > repPR.value) {
      repPR = {
        type: 'reps',
        value: set.reps,
        weight: set.weight,
        reps: set.reps,
        date,
        workoutId: set.workoutId,
        exerciseId,
      };
    }

    // Volume PR - highest weight × reps
    if (!volumePR || volume > volumePR.value) {
      volumePR = {
        type: 'volume',
        value: volume,
        weight: set.weight,
        reps: set.reps,
        date,
        workoutId: set.workoutId,
        exerciseId,
      };
    }

    // Estimated 1RM PR
    if (!e1rmPR || e1rm > e1rmPR.value) {
      e1rmPR = {
        type: 'e1rm',
        value: e1rm,
        weight: set.weight,
        reps: set.reps,
        date,
        workoutId: set.workoutId,
        exerciseId,
      };
    }
  }

  return { exerciseId, weightPR, repPR, volumePR, e1rmPR };
}

/**
 * Check if a new set is a PR.
 * Call this when a set is logged during a workout.
 * Pass all PREVIOUS sets (not including the new one).
 */
export function checkForPR(
  newSet: { exerciseId: string; weight: number; reps: number; workoutId: string },
  previousSets: WorkoutSet[],
  workoutDates: Map<string, string>
): PRCheckResult {
  const currentPRs = calculateExercisePRs(newSet.exerciseId, previousSets, workoutDates);

  const newVolume = newSet.weight * newSet.reps;
  const newE1rm = estimated1RM(newSet.weight, newSet.reps);
  const now = new Date().toISOString();

  const records: PersonalRecord[] = [];

  const isWeightPR = newSet.weight > 0 && (!currentPRs.weightPR || newSet.weight > currentPRs.weightPR.value);
  if (isWeightPR) {
    records.push({
      type: 'weight',
      value: newSet.weight,
      weight: newSet.weight,
      reps: newSet.reps,
      date: now,
      workoutId: newSet.workoutId,
      exerciseId: newSet.exerciseId,
    });
  }

  const isRepPR = newSet.reps > 0 && (!currentPRs.repPR || newSet.reps > currentPRs.repPR.value);
  if (isRepPR) {
    records.push({
      type: 'reps',
      value: newSet.reps,
      weight: newSet.weight,
      reps: newSet.reps,
      date: now,
      workoutId: newSet.workoutId,
      exerciseId: newSet.exerciseId,
    });
  }

  const isVolumePR = newVolume > 0 && (!currentPRs.volumePR || newVolume > currentPRs.volumePR.value);
  if (isVolumePR) {
    records.push({
      type: 'volume',
      value: newVolume,
      weight: newSet.weight,
      reps: newSet.reps,
      date: now,
      workoutId: newSet.workoutId,
      exerciseId: newSet.exerciseId,
    });
  }

  const isE1rmPR = newE1rm > 0 && (!currentPRs.e1rmPR || newE1rm > currentPRs.e1rmPR.value);
  if (isE1rmPR) {
    records.push({
      type: 'e1rm',
      value: newE1rm,
      weight: newSet.weight,
      reps: newSet.reps,
      date: now,
      workoutId: newSet.workoutId,
      exerciseId: newSet.exerciseId,
    });
  }

  return {
    isWeightPR,
    isRepPR,
    isVolumePR,
    isE1rmPR,
    isPR: records.length > 0,
    records,
  };
}

/**
 * Get PR summary for multiple exercises (e.g., for exercise library display).
 */
export function getExercisePRSummaries(
  exerciseIds: string[],
  allSets: WorkoutSet[],
  workoutDates: Map<string, string>
): Map<string, ExercisePRs> {
  const summaries = new Map<string, ExercisePRs>();

  for (const exerciseId of exerciseIds) {
    summaries.set(exerciseId, calculateExercisePRs(exerciseId, allSets, workoutDates));
  }

  return summaries;
}

/**
 * Format a PR for display.
 */
export function formatPRLabel(type: PersonalRecord['type']): string {
  switch (type) {
    case 'weight': return 'Weight PR';
    case 'reps': return 'Rep PR';
    case 'volume': return 'Volume PR';
    case 'e1rm': return 'Est. 1RM PR';
    default: return 'PR';
  }
}

/**
 * Get emoji for PR type (for celebrations).
 */
export function prEmoji(type: PersonalRecord['type']): string {
  switch (type) {
    case 'weight': return '🏋️';
    case 'reps': return '🔥';
    case 'volume': return '💪';
    case 'e1rm': return '⭐';
    default: return '🎉';
  }
}
