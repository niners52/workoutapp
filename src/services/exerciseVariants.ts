/**
 * Exercise variants: one exercise done more than one way, where the way
 * changes the load. The Planet Fitness cable fly high-to-low is done at the
 * wide or the narrow station, and narrow feels about twice as heavy (10 lb
 * narrow vs 20 lb wide). So it is one exercise with one history, but every set
 * carries its variant, and "last time" weights and PRs are per variant.
 *
 * Ids are this account's exercise ids. To give another exercise variants, add
 * it to EXERCISE_VARIANTS.
 */
import type { WorkoutSet } from '../types';

/** Exercise id -> its variants, in toggle order. */
export const EXERCISE_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  'import-cable-fly-high-low': ['Wide', 'Narrow'], // Cable Fly High to Low
};

/**
 * The one-time merge that created the variant exercise: the narrow fly used to
 * be its own exercise. Storage migration V18 and
 * supabase/migrations/20260918000000_cable_fly_variants.sql apply it.
 */
export const CABLE_FLY_MERGE = {
  keeperId: 'import-cable-fly-high-low', // was "Cable wide Fly High to Low"
  keeperVariant: 'Wide',
  sourceId: 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b', // was "Cable Fly high to low narrow"
  sourceVariant: 'Narrow',
  name: 'Cable Fly High to Low',
  baseName: 'Fly High to Low',
} as const;

export function variantsFor(exerciseId: string): readonly string[] | null {
  return EXERCISE_VARIANTS[exerciseId] ?? null;
}

/**
 * Only the sets done the given way. With no variant (an exercise without
 * variants) every set passes; an untagged set on a variant exercise matches
 * nothing, since its load cannot be compared.
 */
export function setsForVariant<T extends Pick<WorkoutSet, 'variant'>>(sets: T[], variant: string | undefined): T[] {
  if (!variant) return sets;
  return sets.filter(s => s.variant === variant);
}

/**
 * Which variant the toggle starts on: whatever was done last in this workout,
 * else last time, else the first variant.
 */
export function defaultVariant(
  exerciseId: string,
  currentSets: Array<Pick<WorkoutSet, 'variant' | 'loggedAt'>>,
  historySets: Array<Pick<WorkoutSet, 'variant' | 'loggedAt'>>,
): string | undefined {
  const variants = variantsFor(exerciseId);
  if (!variants) return undefined;
  const newest = (sets: Array<Pick<WorkoutSet, 'variant' | 'loggedAt'>>) =>
    [...sets].filter(s => s.variant && variants.includes(s.variant)).sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0]?.variant;
  return newest(currentSets) ?? newest(historySets) ?? variants[0];
}

/**
 * Tag every set of the two exercises being merged with the variant it was
 * done as, and move the source's sets onto the keeper. Sets that already
 * carry a variant keep it. Returns the ids of every set that changed.
 */
export function tagSetsForVariantMerge<T extends Pick<WorkoutSet, 'id' | 'exerciseId' | 'variant'>>(
  sets: T[],
  merge: { keeperId: string; keeperVariant: string; sourceId: string; sourceVariant: string },
): { sets: T[]; changedIds: string[] } {
  const changedIds: string[] = [];
  const next = sets.map(s => {
    if (s.exerciseId === merge.sourceId) {
      changedIds.push(s.id);
      return { ...s, exerciseId: merge.keeperId, variant: s.variant ?? merge.sourceVariant };
    }
    if (s.exerciseId === merge.keeperId && !s.variant) {
      changedIds.push(s.id);
      return { ...s, variant: merge.keeperVariant };
    }
    return s;
  });
  return { sets: next, changedIds };
}
