/**
 * Holistic Fitness Insights — Type definitions
 */

import {
  Exercise,
  WorkoutSet,
  Workout,
  BodyMeasurement,
  UserSettings,
} from '../../types';

// ─── Insight Categories & Priority ─────────────────────────────────────────

export type InsightCategory =
  | 'body_composition'
  | 'strength_size'
  | 'nutrition_impact'
  | 'phase_recommendation'
  | 'trend_prediction'
  | 'monthly_report'
  | 'smart_alert';

export type InsightPriority = 'high' | 'medium' | 'low';

// ─── Core Insight Type ─────────────────────────────────────────────────────

export interface Insight {
  id: string;
  category: InsightCategory;
  priority: InsightPriority;
  priorityScore: number;        // 0-100 for sorting
  icon: string;                 // Ionicons name
  title: string;                // Short headline
  detail: string;               // 1-2 sentence explanation
  data?: Record<string, any>;   // Optional structured data for rich rendering
  generatedAt: string;          // ISO timestamp
  minDataWeeks: number;         // Minimum weeks of data needed
}

// ─── Monthly Report ────────────────────────────────────────────────────────

export interface MonthlyReport {
  month: string;                // 'YYYY-MM'
  generatedAt: string;
  trainingScore: number;        // 0-100
  nutritionScore: number;       // 0-100
  consistencyScore: number;     // 0-100
  overallGrade: string;         // A-F
  highlights: string[];         // Top 3 achievements
  areasToImprove: string[];     // Top 3 opportunities
  strengthChanges: { muscle: string; from: string; to: string }[];
  bodyChanges: { metric: string; change: string; direction: 'up' | 'down' }[];
  prsCount: number;
  workoutsCompleted: number;
  perfectDays: number;
}

// ─── Input for Insight Generation ──────────────────────────────────────────

export interface InsightsInput {
  exercises: Exercise[];
  sets: WorkoutSet[];
  workouts: Workout[];
  bodyMeasurements: BodyMeasurement[];
  userSettings: UserSettings;
  bodyWeightLbs: number | null;
  nutritionHistory: Map<string, { calories: number; protein: number }>;
  sleepHistory: Map<string, number>;  // date -> hours
}

// ─── Deload Filtering Helpers ──────────────────────────────────────────────

/** Build a Set of workout IDs that were tagged as deload */
export function getDeloadWorkoutIds(workouts: Workout[]): Set<string> {
  return new Set(workouts.filter(w => w.isDeload).map(w => w.id));
}

/** Filter workouts to only non-deload completed workouts */
export function getNonDeloadWorkouts(workouts: Workout[]): Workout[] {
  return workouts.filter(w => !w.isDeload);
}

/** Filter sets to exclude those belonging to deload workouts */
export function getNonDeloadSets(sets: WorkoutSet[], deloadIds: Set<string>): WorkoutSet[] {
  return sets.filter(s => !deloadIds.has(s.workoutId));
}

/**
 * Detect if the user just came back from a deload week.
 * Returns the date of the last deload workout if the most recent non-deload
 * workout is newer than the most recent deload workout (i.e., first workout back).
 */
export function getPostDeloadInfo(workouts: Workout[]): {
  isPostDeload: boolean;
  lastDeloadDate: string | null;
  lastNonDeloadDate: string | null;
} {
  const completed = workouts.filter(w => w.completedAt).sort(
    (a, b) => b.completedAt!.localeCompare(a.completedAt!)
  );

  const lastDeload = completed.find(w => w.isDeload);
  const lastNonDeload = completed.find(w => !w.isDeload);

  if (!lastDeload || !lastNonDeload) {
    return { isPostDeload: false, lastDeloadDate: null, lastNonDeloadDate: null };
  }

  // Post-deload = last non-deload workout is more recent than last deload,
  // AND the deload was within 2 weeks (not ancient history)
  const deloadDate = new Date(lastDeload.completedAt!);
  const nonDeloadDate = new Date(lastNonDeload.completedAt!);
  const daysSinceDeload = (nonDeloadDate.getTime() - deloadDate.getTime()) / (1000 * 60 * 60 * 24);

  const isPostDeload = nonDeloadDate > deloadDate && daysSinceDeload <= 14;

  return {
    isPostDeload,
    lastDeloadDate: lastDeload.completedAt!,
    lastNonDeloadDate: lastNonDeload.completedAt!,
  };
}

// ─── Cache ─────────────────────────────────────────────────────────────────

export interface InsightsCache {
  insights: Insight[];
  generatedAt: number;  // Date.now()
}

export interface MonthlyReportCache {
  report: MonthlyReport;
  generatedAt: number;
}
