/**
 * Variants: separate exercises that are the same movement set up differently
 * (the Planet Fitness cable fly at the wide vs narrow stations). They stay
 * separate exercises on purpose — the loads differ (10 lb narrow feels like
 * 20 lb wide), so each keeps its own history, last-time weight and PRs — but
 * they are linked so that:
 *   - the active-workout card shows a toggle that switches between them in
 *     place, which is not recorded as a swap;
 *   - doing any variant satisfies the others on the weekly catch-up list.
 *
 * Ids are this account's exercise ids. To link another pair, add a group here.
 */

export interface VariantGroup {
  id: string;
  variants: ReadonlyArray<{ exerciseId: string; label: string }>;
}

export const VARIANT_GROUPS: ReadonlyArray<VariantGroup> = [
  {
    id: 'cable-fly-high-to-low',
    variants: [
      { exerciseId: 'import-cable-fly-high-low', label: 'Wide' },             // Cable wide Fly High to Low
      { exerciseId: 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b', label: 'Narrow' }, // Cable Fly high to low narrow
    ],
  },
];

const GROUP_BY_EXERCISE = new Map<string, VariantGroup>(
  VARIANT_GROUPS.flatMap(g => g.variants.map(v => [v.exerciseId, g] as const)),
);

/** The group an exercise belongs to, or null when it has no variants. */
export function variantGroupFor(exerciseId: string, groups: ReadonlyArray<VariantGroup> = VARIANT_GROUPS): VariantGroup | null {
  if (groups === VARIANT_GROUPS) return GROUP_BY_EXERCISE.get(exerciseId) ?? null;
  return groups.find(g => g.variants.some(v => v.exerciseId === exerciseId)) ?? null;
}

/** Every exercise id in the same group, including this one; just [id] when ungrouped. */
export function variantFamily(exerciseId: string, groups: ReadonlyArray<VariantGroup> = VARIANT_GROUPS): string[] {
  const group = variantGroupFor(exerciseId, groups);
  return group ? group.variants.map(v => v.exerciseId) : [exerciseId];
}
