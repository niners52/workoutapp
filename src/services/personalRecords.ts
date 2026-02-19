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

import { WorkoutSet, Exercise, UnitSystem } from '../types';
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

// ─── Milestone Detection ────────────────────────────────────────────────────

export type MilestoneReason =
  | { kind: 'plate'; plateWeight: number }
  | { kind: 'rep_jump'; previousBestReps: number; newReps: number; atWeight: number }
  | { kind: 'e1rm_jump'; previousBest: number; newValue: number; delta: number };

export interface MilestoneCheckResult {
  isMilestone: boolean;
  reason: MilestoneReason | null;
  prResult: PRCheckResult;
}

// Plate milestones in lbs (internal storage unit)
const PLATE_MILESTONES_LBS = [135, 185, 225, 275, 315, 365, 405];
// Round kg milestones
const PLATE_MILESTONES_KG = [60, 80, 100, 120, 140];
const KG_TO_LBS = 2.20462;

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

// ─── Milestone Detection Logic ──────────────────────────────────────────────

/**
 * Check if a new set is a PR and whether it qualifies as a milestone.
 * Wraps checkForPR() and adds milestone classification.
 */
export function checkForMilestone(
  newSet: { exerciseId: string; weight: number; reps: number; workoutId: string },
  previousSets: WorkoutSet[],
  workoutDates: Map<string, string>,
  units: UnitSystem
): MilestoneCheckResult {
  const prResult = checkForPR(newSet, previousSets, workoutDates);

  if (!prResult.isPR) {
    return { isMilestone: false, reason: null, prResult };
  }

  const exercisePreviousSets = previousSets.filter(
    s => s.exerciseId === newSet.exerciseId && s.weight > 0
  );

  // 1. Plate milestone: first time weight >= a plate threshold for this exercise
  if (prResult.isWeightPR) {
    const previousMaxWeight = exercisePreviousSets.length > 0
      ? Math.max(...exercisePreviousSets.map(s => s.weight))
      : 0;

    // Choose milestones based on user's unit system
    const milestones = units === 'metric'
      ? PLATE_MILESTONES_KG.map(kg => kg * KG_TO_LBS)
      : PLATE_MILESTONES_LBS;

    for (const milestone of milestones) {
      if (newSet.weight >= milestone && previousMaxWeight < milestone) {
        // Store the display-friendly weight (the round number)
        const displayWeight = units === 'metric'
          ? PLATE_MILESTONES_KG[milestones.indexOf(milestone)]
          : milestone;
        return {
          isMilestone: true,
          reason: { kind: 'plate', plateWeight: displayWeight },
          prResult,
        };
      }
    }
  }

  // 2. Big rep jump: +3 or more reps at same weight as previous best at that weight
  if (prResult.isRepPR) {
    const setsAtSameWeight = exercisePreviousSets.filter(
      s => s.weight === newSet.weight && s.reps > 0
    );
    if (setsAtSameWeight.length > 0) {
      const previousBestReps = Math.max(...setsAtSameWeight.map(s => s.reps));
      const repDelta = newSet.reps - previousBestReps;
      if (repDelta >= 3) {
        return {
          isMilestone: true,
          reason: {
            kind: 'rep_jump',
            previousBestReps,
            newReps: newSet.reps,
            atWeight: newSet.weight,
          },
          prResult,
        };
      }
    }
  }

  // 3. All-time e1RM jump by 5+ lbs
  if (prResult.isE1rmPR) {
    const currentPRs = calculateExercisePRs(newSet.exerciseId, previousSets, workoutDates);
    const previousBestE1rm = currentPRs.e1rmPR?.value || 0;
    const newE1rm = estimated1RM(newSet.weight, newSet.reps);
    const e1rmDelta = newE1rm - previousBestE1rm;
    if (e1rmDelta >= 5) {
      return {
        isMilestone: true,
        reason: {
          kind: 'e1rm_jump',
          previousBest: previousBestE1rm,
          newValue: newE1rm,
          delta: e1rmDelta,
        },
        prResult,
      };
    }
  }

  return { isMilestone: false, reason: null, prResult };
}

/**
 * Format a milestone for display.
 */
export function formatMilestoneLabel(reason: MilestoneReason, units: UnitSystem): string {
  switch (reason.kind) {
    case 'plate':
      return units === 'metric'
        ? `${reason.plateWeight} kg Club!`
        : `${reason.plateWeight} lb Club!`;
    case 'rep_jump':
      return `+${reason.newReps - reason.previousBestReps} Rep PR!`;
    case 'e1rm_jump':
      return `e1RM +${Math.round(reason.delta)} lbs!`;
  }
}

/**
 * Get emoji for a milestone celebration.
 */
export function milestoneEmoji(reason: MilestoneReason): string {
  switch (reason.kind) {
    case 'plate': return '🏆';
    case 'rep_jump': return '🔥';
    case 'e1rm_jump': return '⭐';
  }
}

/**
 * Get all PRs that were set within a date range.
 * Returns PRs where the PR-setting set occurred in the date range.
 */
export async function getExercisePRsInDateRange(
  exercises: { id: string }[],
  allSets: WorkoutSet[],
  startDate: Date,
  endDate: Date
): Promise<PersonalRecord[]> {
  const prsInRange: PersonalRecord[] = [];

  // Build workout dates map
  const workoutDates = new Map<string, string>();
  for (const set of allSets) {
    if (set.loggedAt && !workoutDates.has(set.workoutId)) {
      workoutDates.set(set.workoutId, set.loggedAt);
    }
  }

  // For each exercise, calculate PRs and check if they fall in the date range
  for (const exercise of exercises) {
    const prs = calculateExercisePRs(exercise.id, allSets, workoutDates);

    const checkPR = (pr: PersonalRecord | null) => {
      if (!pr || !pr.date) return;
      const prDate = new Date(pr.date);
      if (prDate >= startDate && prDate <= endDate) {
        prsInRange.push(pr);
      }
    };

    checkPR(prs.weightPR);
    checkPR(prs.e1rmPR);
    // Skip rep and volume PRs to avoid clutter - focus on weight and e1RM
  }

  return prsInRange;
}
