/**
 * Exercise variants: one exercise done more than one way, where the way
 * changes the load. On a cable stack the handle spacing does exactly that —
 * the Planet Fitness high-to-low fly is about 10 lb narrow vs 20 lb wide — so
 * every cable exercise offers a Wide / Narrow toggle, each set records which
 * way it was done, and last-time weights and PRs are kept per variant.
 *
 * Sets logged before this existed carry no variant. They are not thrown away:
 * when a variant has no history of its own, the untagged history stands in, so
 * a cable exercise keeps suggesting weights from day one. What never happens is
 * one variant's weights standing in for another's.
 */
import type { Exercise, WorkoutSet } from '../types';

export const WIDTH_VARIANTS = ['Wide', 'Narrow'] as const;

/** Exercises that get variants regardless of equipment. */
export const EXERCISE_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  'import-cable-fly-high-low': WIDTH_VARIANTS, // Cable Fly High to Low (wide and narrow merged)
};

/**
 * The one-time merge that created the first variant exercise: the narrow fly
 * used to be its own exercise. Storage migration V18 and
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

/** The ways this exercise can be done, or null when it has none. */
export function variantsFor(exercise: Pick<Exercise, 'id' | 'equipment'> | null | undefined): readonly string[] | null {
  if (!exercise) return null;
  return EXERCISE_VARIANTS[exercise.id] ?? (exercise.equipment === 'cable' ? WIDTH_VARIANTS : null);
}

/**
 * The sets that are comparable to `variant`: the ones done that way, or the
 * untagged ones when that variant has no history yet. Without a variant (an
 * exercise that has none) every set is comparable.
 */
export function setsForVariant<T extends Pick<WorkoutSet, 'variant'>>(sets: T[], variant: string | undefined): T[] {
  if (!variant) return sets;
  const tagged = sets.filter(s => s.variant === variant);
  return tagged.length > 0 ? tagged : sets.filter(s => !s.variant);
}

/**
 * Which variant the toggle starts on: whatever was done last in this workout,
 * else last time, else the first variant.
 */
export function defaultVariant(
  variants: readonly string[] | null,
  currentSets: Array<Pick<WorkoutSet, 'variant' | 'loggedAt'>>,
  historySets: Array<Pick<WorkoutSet, 'variant' | 'loggedAt'>>,
): string | undefined {
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
