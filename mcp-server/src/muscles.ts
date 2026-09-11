/**
 * Muscle-group model, copied from src/types/index.ts in the app so the server's
 * weekly volume matches the app's Weekly Volume panel exactly.
 *
 * Volume rules (src/services/analytics.ts -> calculateVolumeForDateRange):
 *   - Only PRIMARY muscle groups earn set credit. Secondary groups are stored on
 *     the exercise and reported here for context, but never counted.
 *   - Every primary group on an exercise gets full credit for each set.
 *   - Unilateral exercises count each set as 0.5 (one side per set).
 *   - Sets from deload workouts (workouts.is_deload) are excluded.
 *   - Sets are bucketed by workout_sets.logged_at, not by workout start.
 */

export const PRIMARY_MUSCLE_GROUPS = [
  'chest',
  'lats',
  'upper_back',
  'front_delts',
  'side_delts',
  'triceps',
  'biceps',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
  'abs',
  'forearms',
  'traps',
  'lower_back',
  'miscellaneous',
] as const;

export type PrimaryMuscleGroup = (typeof PRIMARY_MUSCLE_GROUPS)[number];

export type AnalyticsCategory = 'back' | 'shoulders' | 'chest' | 'arms' | 'legs' | 'core';

/** The six roll-up categories the Analytics screen displays. */
export const ANALYTICS_CATEGORIES: ReadonlyArray<{
  category: AnalyticsCategory;
  muscleGroups: readonly PrimaryMuscleGroup[];
}> = [
  { category: 'back', muscleGroups: ['lats', 'upper_back', 'lower_back'] },
  { category: 'shoulders', muscleGroups: ['front_delts', 'side_delts', 'traps'] },
  { category: 'chest', muscleGroups: ['chest'] },
  { category: 'arms', muscleGroups: ['triceps', 'biceps', 'forearms'] },
  { category: 'legs', muscleGroups: ['quads', 'hamstrings', 'glutes', 'adductors', 'calves'] },
  { category: 'core', muscleGroups: ['abs'] },
];

/**
 * Groups the app retired via local migrations. Cloud rows written before those
 * migrations can still carry the old name, so read them as their successor.
 * Mirrors src/services/storage.ts migrateToV10 (rear_delts -> upper_back).
 */
const LEGACY_ALIASES: Record<string, PrimaryMuscleGroup> = {
  rear_delts: 'upper_back',
};

export function isPrimaryMuscleGroup(value: unknown): value is PrimaryMuscleGroup {
  return typeof value === 'string' && (PRIMARY_MUSCLE_GROUPS as readonly string[]).includes(value);
}

/** Resolve a stored muscle-group string to a current group, or null if unknown. */
export function canonicalMuscleGroup(value: unknown): PrimaryMuscleGroup | null {
  if (isPrimaryMuscleGroup(value)) return value;
  if (typeof value === 'string' && value in LEGACY_ALIASES) return LEGACY_ALIASES[value]!;
  return null;
}

/** Set credit an exercise earns per logged set, mirroring the app. */
export function setCredit(isUnilateral: boolean | null | undefined): number {
  return isUnilateral ? 0.5 : 1;
}

export function emptyMuscleTotals(): Record<PrimaryMuscleGroup, number> {
  const totals = {} as Record<PrimaryMuscleGroup, number>;
  for (const mg of PRIMARY_MUSCLE_GROUPS) totals[mg] = 0;
  return totals;
}

export function rollUpCategories(
  byMuscle: Record<PrimaryMuscleGroup, number>,
): Record<AnalyticsCategory, number> {
  const out = {} as Record<AnalyticsCategory, number>;
  for (const { category, muscleGroups } of ANALYTICS_CATEGORIES) {
    out[category] = round1(muscleGroups.reduce((sum, mg) => sum + byMuscle[mg], 0));
  }
  return out;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
