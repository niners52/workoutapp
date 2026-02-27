/**
 * Strength Standards Service
 *
 * Calculates strength levels (Beginner → Elite) for muscle groups
 * based on e1RM / bodyweight ratios from 10 key compound exercises.
 *
 * All weights are in lbs (internal storage unit).
 */

import { Exercise, WorkoutSet, Workout, PrimaryMuscleGroup, Equipment } from '../types';
import { estimated1RM } from './units';

// ─── Types ──────────────────────────────────────────────────────────────────

export type StrengthLevel =
  | 'untrained'
  | 'beginner'
  | 'novice'
  | 'intermediate'
  | 'advanced'
  | 'elite';

export const STRENGTH_LEVELS: StrengthLevel[] = [
  'untrained',
  'beginner',
  'novice',
  'intermediate',
  'advanced',
  'elite',
];

export const STRENGTH_LEVEL_LABELS: Record<StrengthLevel, string> = {
  untrained: 'Untrained',
  beginner: 'Beginner',
  novice: 'Novice',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  elite: 'Elite',
};

export const STRENGTH_LEVEL_COLORS: Record<StrengthLevel, string> = {
  untrained: '#1A3A5C',   // backgroundTertiary
  beginner: '#5B8DEF',    // blue
  novice: '#4CAF50',      // green
  intermediate: '#FFC52F', // gold
  advanced: '#FF9800',    // orange
  elite: '#F44336',       // red
};

interface LevelThresholds {
  beginner: number;
  novice: number;
  intermediate: number;
  advanced: number;
  elite: number;
}

interface StrengthStandard {
  id: string;
  exerciseNamePatterns: string[];
  equipmentFilter?: Equipment[];
  isBodyweightExercise?: boolean;
  muscleGroups: PrimaryMuscleGroup[];
  /** e1RM / bodyweight ratio thresholds by body weight bracket (lbs) */
  levels: Record<string, LevelThresholds>;
}

export interface ExerciseStrengthResult {
  exerciseId: string;
  exerciseName: string;
  standardId: string;
  e1rmLbs: number;
  ratio: number;
  level: StrengthLevel;
  percentToNext: number;
  nextLevelE1rm: number | null; // null if elite
}

export interface MuscleStrengthResult {
  level: StrengthLevel;
  bestExercise: ExerciseStrengthResult | null;
  allExercises: ExerciseStrengthResult[];
}

// ─── Standards Data ─────────────────────────────────────────────────────────
// Ratios = e1RM / bodyweight. Based on strength standards literature.
// Body weight brackets: 130, 150, 170, 190, 210, 230, 250 lbs

const STANDARDS: StrengthStandard[] = [
  {
    id: 'bench_press',
    exerciseNamePatterns: ['bench press', 'barbell bench', 'flat bench'],
    equipmentFilter: ['barbell'],
    muscleGroups: ['chest', 'front_delts', 'triceps'],
    levels: {
      '130': { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.25, elite: 1.50 },
      '150': { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.25, elite: 1.50 },
      '170': { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.30, elite: 1.55 },
      '190': { beginner: 0.50, novice: 0.75, intermediate: 1.05, advanced: 1.35, elite: 1.60 },
      '210': { beginner: 0.50, novice: 0.75, intermediate: 1.05, advanced: 1.35, elite: 1.60 },
      '230': { beginner: 0.50, novice: 0.75, intermediate: 1.05, advanced: 1.35, elite: 1.60 },
      '250': { beginner: 0.50, novice: 0.75, intermediate: 1.05, advanced: 1.35, elite: 1.60 },
    },
  },
  {
    id: 'overhead_press',
    exerciseNamePatterns: ['overhead press', 'ohp', 'military press', 'shoulder press', 'standing press'],
    equipmentFilter: ['barbell'],
    muscleGroups: ['front_delts', 'side_delts', 'triceps'],
    levels: {
      '130': { beginner: 0.35, novice: 0.50, intermediate: 0.65, advanced: 0.85, elite: 1.00 },
      '150': { beginner: 0.35, novice: 0.50, intermediate: 0.65, advanced: 0.85, elite: 1.00 },
      '170': { beginner: 0.35, novice: 0.50, intermediate: 0.65, advanced: 0.85, elite: 1.05 },
      '190': { beginner: 0.35, novice: 0.50, intermediate: 0.70, advanced: 0.90, elite: 1.10 },
      '210': { beginner: 0.35, novice: 0.50, intermediate: 0.70, advanced: 0.90, elite: 1.10 },
      '230': { beginner: 0.35, novice: 0.50, intermediate: 0.70, advanced: 0.90, elite: 1.10 },
      '250': { beginner: 0.35, novice: 0.50, intermediate: 0.70, advanced: 0.90, elite: 1.10 },
    },
  },
  {
    id: 'squat',
    exerciseNamePatterns: ['squat', 'back squat', 'barbell squat'],
    equipmentFilter: ['barbell'],
    muscleGroups: ['quads', 'glutes'],
    levels: {
      '130': { beginner: 0.60, novice: 0.90, intermediate: 1.25, advanced: 1.60, elite: 2.00 },
      '150': { beginner: 0.60, novice: 0.90, intermediate: 1.25, advanced: 1.60, elite: 2.00 },
      '170': { beginner: 0.65, novice: 0.95, intermediate: 1.30, advanced: 1.65, elite: 2.05 },
      '190': { beginner: 0.65, novice: 0.95, intermediate: 1.30, advanced: 1.70, elite: 2.10 },
      '210': { beginner: 0.65, novice: 0.95, intermediate: 1.30, advanced: 1.70, elite: 2.10 },
      '230': { beginner: 0.65, novice: 0.95, intermediate: 1.30, advanced: 1.70, elite: 2.10 },
      '250': { beginner: 0.65, novice: 0.95, intermediate: 1.30, advanced: 1.70, elite: 2.10 },
    },
  },
  {
    id: 'deadlift',
    exerciseNamePatterns: ['deadlift', 'conventional deadlift', 'sumo deadlift'],
    equipmentFilter: ['barbell'],
    muscleGroups: ['hamstrings', 'glutes', 'lower_back'],
    levels: {
      '130': { beginner: 0.75, novice: 1.10, intermediate: 1.50, advanced: 1.90, elite: 2.35 },
      '150': { beginner: 0.75, novice: 1.10, intermediate: 1.50, advanced: 1.90, elite: 2.35 },
      '170': { beginner: 0.80, novice: 1.15, intermediate: 1.55, advanced: 2.00, elite: 2.40 },
      '190': { beginner: 0.80, novice: 1.15, intermediate: 1.55, advanced: 2.00, elite: 2.45 },
      '210': { beginner: 0.80, novice: 1.15, intermediate: 1.55, advanced: 2.00, elite: 2.45 },
      '230': { beginner: 0.80, novice: 1.15, intermediate: 1.55, advanced: 2.00, elite: 2.45 },
      '250': { beginner: 0.80, novice: 1.15, intermediate: 1.55, advanced: 2.00, elite: 2.45 },
    },
  },
  {
    id: 'barbell_row',
    exerciseNamePatterns: ['barbell row', 'bent over row', 'pendlay row', 'bb row'],
    equipmentFilter: ['barbell'],
    muscleGroups: ['lats', 'upper_back'],
    levels: {
      '130': { beginner: 0.40, novice: 0.60, intermediate: 0.80, advanced: 1.05, elite: 1.25 },
      '150': { beginner: 0.40, novice: 0.60, intermediate: 0.80, advanced: 1.05, elite: 1.25 },
      '170': { beginner: 0.40, novice: 0.60, intermediate: 0.85, advanced: 1.10, elite: 1.30 },
      '190': { beginner: 0.40, novice: 0.60, intermediate: 0.85, advanced: 1.10, elite: 1.35 },
      '210': { beginner: 0.40, novice: 0.60, intermediate: 0.85, advanced: 1.10, elite: 1.35 },
      '230': { beginner: 0.40, novice: 0.60, intermediate: 0.85, advanced: 1.10, elite: 1.35 },
      '250': { beginner: 0.40, novice: 0.60, intermediate: 0.85, advanced: 1.10, elite: 1.35 },
    },
  },
  {
    id: 'pull_up',
    exerciseNamePatterns: ['pull up', 'pull-up', 'pullup', 'chin up', 'chin-up', 'chinup'],
    isBodyweightExercise: true,
    muscleGroups: ['lats', 'biceps'],
    levels: {
      '130': { beginner: 0.70, novice: 0.85, intermediate: 1.05, advanced: 1.30, elite: 1.55 },
      '150': { beginner: 0.70, novice: 0.85, intermediate: 1.05, advanced: 1.30, elite: 1.55 },
      '170': { beginner: 0.70, novice: 0.85, intermediate: 1.05, advanced: 1.30, elite: 1.55 },
      '190': { beginner: 0.65, novice: 0.80, intermediate: 1.00, advanced: 1.25, elite: 1.50 },
      '210': { beginner: 0.65, novice: 0.80, intermediate: 1.00, advanced: 1.25, elite: 1.50 },
      '230': { beginner: 0.60, novice: 0.75, intermediate: 0.95, advanced: 1.20, elite: 1.45 },
      '250': { beginner: 0.60, novice: 0.75, intermediate: 0.95, advanced: 1.20, elite: 1.45 },
    },
  },
  {
    id: 'dip',
    exerciseNamePatterns: ['dip', 'dips', 'chest dip', 'tricep dip', 'triceps dip'],
    isBodyweightExercise: true,
    muscleGroups: ['chest', 'triceps'],
    levels: {
      '130': { beginner: 0.70, novice: 0.85, intermediate: 1.10, advanced: 1.40, elite: 1.65 },
      '150': { beginner: 0.70, novice: 0.85, intermediate: 1.10, advanced: 1.40, elite: 1.65 },
      '170': { beginner: 0.70, novice: 0.85, intermediate: 1.10, advanced: 1.40, elite: 1.65 },
      '190': { beginner: 0.65, novice: 0.80, intermediate: 1.05, advanced: 1.35, elite: 1.60 },
      '210': { beginner: 0.65, novice: 0.80, intermediate: 1.05, advanced: 1.35, elite: 1.60 },
      '230': { beginner: 0.60, novice: 0.75, intermediate: 1.00, advanced: 1.30, elite: 1.55 },
      '250': { beginner: 0.60, novice: 0.75, intermediate: 1.00, advanced: 1.30, elite: 1.55 },
    },
  },
  {
    id: 'barbell_curl',
    exerciseNamePatterns: ['barbell curl', 'bb curl', 'standing curl', 'ez bar curl', 'ez curl'],
    equipmentFilter: ['barbell'],
    muscleGroups: ['biceps'],
    levels: {
      '130': { beginner: 0.25, novice: 0.35, intermediate: 0.50, advanced: 0.65, elite: 0.80 },
      '150': { beginner: 0.25, novice: 0.35, intermediate: 0.50, advanced: 0.65, elite: 0.80 },
      '170': { beginner: 0.25, novice: 0.35, intermediate: 0.50, advanced: 0.65, elite: 0.80 },
      '190': { beginner: 0.25, novice: 0.35, intermediate: 0.50, advanced: 0.65, elite: 0.80 },
      '210': { beginner: 0.25, novice: 0.35, intermediate: 0.50, advanced: 0.65, elite: 0.80 },
      '230': { beginner: 0.25, novice: 0.35, intermediate: 0.50, advanced: 0.65, elite: 0.80 },
      '250': { beginner: 0.25, novice: 0.35, intermediate: 0.50, advanced: 0.65, elite: 0.80 },
    },
  },
  {
    id: 'romanian_deadlift',
    exerciseNamePatterns: ['romanian deadlift', 'rdl', 'stiff leg deadlift', 'stiff-leg'],
    equipmentFilter: ['barbell'],
    muscleGroups: ['hamstrings', 'glutes'],
    levels: {
      '130': { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.30, elite: 1.60 },
      '150': { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.30, elite: 1.60 },
      '170': { beginner: 0.55, novice: 0.80, intermediate: 1.05, advanced: 1.35, elite: 1.65 },
      '190': { beginner: 0.55, novice: 0.80, intermediate: 1.05, advanced: 1.35, elite: 1.65 },
      '210': { beginner: 0.55, novice: 0.80, intermediate: 1.05, advanced: 1.35, elite: 1.65 },
      '230': { beginner: 0.55, novice: 0.80, intermediate: 1.05, advanced: 1.35, elite: 1.65 },
      '250': { beginner: 0.55, novice: 0.80, intermediate: 1.05, advanced: 1.35, elite: 1.65 },
    },
  },
  {
    id: 'leg_press',
    exerciseNamePatterns: ['leg press'],
    equipmentFilter: ['machine'],
    muscleGroups: ['quads'],
    levels: {
      '130': { beginner: 1.00, novice: 1.50, intermediate: 2.00, advanced: 2.75, elite: 3.50 },
      '150': { beginner: 1.00, novice: 1.50, intermediate: 2.00, advanced: 2.75, elite: 3.50 },
      '170': { beginner: 1.00, novice: 1.50, intermediate: 2.10, advanced: 2.85, elite: 3.60 },
      '190': { beginner: 1.00, novice: 1.50, intermediate: 2.10, advanced: 2.85, elite: 3.60 },
      '210': { beginner: 1.00, novice: 1.50, intermediate: 2.10, advanced: 2.85, elite: 3.60 },
      '230': { beginner: 1.00, novice: 1.50, intermediate: 2.10, advanced: 2.85, elite: 3.60 },
      '250': { beginner: 1.00, novice: 1.50, intermediate: 2.10, advanced: 2.85, elite: 3.60 },
    },
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const BW_BRACKETS = [130, 150, 170, 190, 210, 230, 250];

/** Interpolate thresholds between body weight brackets */
function getThresholds(standard: StrengthStandard, bodyWeightLbs: number): LevelThresholds {
  const bw = Math.max(BW_BRACKETS[0], Math.min(BW_BRACKETS[BW_BRACKETS.length - 1], bodyWeightLbs));

  // Find surrounding brackets
  let lowerIdx = 0;
  for (let i = 0; i < BW_BRACKETS.length - 1; i++) {
    if (bw >= BW_BRACKETS[i]) lowerIdx = i;
  }
  const upperIdx = Math.min(lowerIdx + 1, BW_BRACKETS.length - 1);

  if (lowerIdx === upperIdx) {
    return standard.levels[String(BW_BRACKETS[lowerIdx])];
  }

  const lowerBW = BW_BRACKETS[lowerIdx];
  const upperBW = BW_BRACKETS[upperIdx];
  const t = (bw - lowerBW) / (upperBW - lowerBW);

  const lower = standard.levels[String(lowerBW)];
  const upper = standard.levels[String(upperBW)];

  return {
    beginner: lower.beginner + (upper.beginner - lower.beginner) * t,
    novice: lower.novice + (upper.novice - lower.novice) * t,
    intermediate: lower.intermediate + (upper.intermediate - lower.intermediate) * t,
    advanced: lower.advanced + (upper.advanced - lower.advanced) * t,
    elite: lower.elite + (upper.elite - lower.elite) * t,
  };
}

// ─── Exercise Matching ──────────────────────────────────────────────────────

export function matchExerciseToStandard(exercise: Exercise): StrengthStandard | null {
  const name = exercise.name.toLowerCase();

  for (const standard of STANDARDS) {
    // Check name patterns
    const nameMatch = standard.exerciseNamePatterns.some(pattern => name.includes(pattern));
    if (!nameMatch) continue;

    // Check equipment filter (bodyweight exercises skip this)
    if (standard.equipmentFilter && !standard.isBodyweightExercise) {
      if (!standard.equipmentFilter.includes(exercise.equipment)) continue;
    }

    return standard;
  }

  return null;
}

// ─── Level Calculation ──────────────────────────────────────────────────────

export function calculateStrengthLevel(
  e1rmLbs: number,
  bodyWeightLbs: number,
  standard: StrengthStandard
): { level: StrengthLevel; ratio: number; percentToNext: number; nextLevelE1rm: number | null } {
  const thresholds = getThresholds(standard, bodyWeightLbs);
  const ratio = e1rmLbs / bodyWeightLbs;

  const levelOrder: { key: StrengthLevel; threshold: number }[] = [
    { key: 'elite', threshold: thresholds.elite },
    { key: 'advanced', threshold: thresholds.advanced },
    { key: 'intermediate', threshold: thresholds.intermediate },
    { key: 'novice', threshold: thresholds.novice },
    { key: 'beginner', threshold: thresholds.beginner },
  ];

  for (const { key, threshold } of levelOrder) {
    if (ratio >= threshold) {
      // Find next level
      const currentIdx = levelOrder.findIndex(l => l.key === key);
      const nextLevel = currentIdx > 0 ? levelOrder[currentIdx - 1] : null;

      if (!nextLevel) {
        // Already elite
        return { level: key, ratio, percentToNext: 100, nextLevelE1rm: null };
      }

      const currentThreshold = threshold;
      const nextThreshold = nextLevel.threshold;
      const percent = Math.min(100, Math.round(((ratio - currentThreshold) / (nextThreshold - currentThreshold)) * 100));

      return {
        level: key,
        ratio,
        percentToNext: percent,
        nextLevelE1rm: Math.round(nextThreshold * bodyWeightLbs),
      };
    }
  }

  // Below beginner
  const percent = Math.min(100, Math.round((ratio / thresholds.beginner) * 100));
  return {
    level: 'untrained',
    ratio,
    percentToNext: percent,
    nextLevelE1rm: Math.round(thresholds.beginner * bodyWeightLbs),
  };
}

// ─── Main Calculation ───────────────────────────────────────────────────────

export function calculateAllMuscleStrengthLevels(
  exercises: Exercise[],
  sets: WorkoutSet[],
  workouts: Workout[],
  bodyWeightLbs: number,
  options?: { beforeDate?: Date }
): Map<PrimaryMuscleGroup, MuscleStrengthResult> {
  const results = new Map<PrimaryMuscleGroup, MuscleStrengthResult>();

  // Build workout date map
  const workoutDates = new Map<string, string>();
  for (const w of workouts) {
    if (w.completedAt) {
      workoutDates.set(w.id, w.completedAt);
    }
  }

  // Filter sets by date if "start" snapshot requested
  let filteredSets = sets;
  if (options?.beforeDate) {
    const cutoff = options.beforeDate.toISOString();
    const validWorkoutIds = new Set<string>();
    for (const w of workouts) {
      if (w.completedAt && w.completedAt <= cutoff) {
        validWorkoutIds.add(w.id);
      }
    }
    filteredSets = sets.filter(s => validWorkoutIds.has(s.workoutId));
  }

  // For each exercise, find its standard and compute best e1RM
  const exerciseResults: ExerciseStrengthResult[] = [];

  for (const exercise of exercises) {
    const standard = matchExerciseToStandard(exercise);
    if (!standard) continue;

    // Get all sets for this exercise
    const exerciseSets = filteredSets.filter(
      s => s.exerciseId === exercise.id && s.reps > 0
    );
    if (exerciseSets.length === 0) continue;

    // Find best e1RM
    let bestE1rm = 0;
    for (const set of exerciseSets) {
      let weight = set.weight;

      // For bodyweight exercises, add body weight to the loaded weight
      if (standard.isBodyweightExercise) {
        weight = (set.weight || 0) + bodyWeightLbs;
      }

      if (weight <= 0) continue;

      const e1rm = estimated1RM(weight, set.reps);
      if (e1rm > bestE1rm) bestE1rm = e1rm;
    }

    if (bestE1rm <= 0) continue;

    const levelResult = calculateStrengthLevel(bestE1rm, bodyWeightLbs, standard);

    exerciseResults.push({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      standardId: standard.id,
      e1rmLbs: bestE1rm,
      ratio: levelResult.ratio,
      level: levelResult.level,
      percentToNext: levelResult.percentToNext,
      nextLevelE1rm: levelResult.nextLevelE1rm,
    });
  }

  // Group by muscle group and pick highest level
  for (const result of exerciseResults) {
    const standard = STANDARDS.find(s => s.id === result.standardId);
    if (!standard) continue;

    for (const mg of standard.muscleGroups) {
      const existing = results.get(mg);

      if (!existing) {
        results.set(mg, {
          level: result.level,
          bestExercise: result,
          allExercises: [result],
        });
      } else {
        existing.allExercises.push(result);
        // Compare levels — use highest
        const existingIdx = STRENGTH_LEVELS.indexOf(existing.level);
        const newIdx = STRENGTH_LEVELS.indexOf(result.level);
        if (newIdx > existingIdx) {
          existing.level = result.level;
          existing.bestExercise = result;
        }
      }
    }
  }

  return results;
}

/** Get the cutoff date for the "start" snapshot (first 4 weeks of data) */
export function getStartSnapshotCutoff(workouts: Workout[]): Date | null {
  const completed = workouts
    .filter(w => w.completedAt)
    .sort((a, b) => a.completedAt!.localeCompare(b.completedAt!));

  if (completed.length === 0) return null;

  const earliest = new Date(completed[0].completedAt!);
  const cutoff = new Date(earliest);
  cutoff.setDate(cutoff.getDate() + 28); // 4 weeks
  return cutoff;
}
