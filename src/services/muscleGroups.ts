/**
 * Reading stored muscle groups.
 *
 * The set of groups changes over time (V10 merged rear_delts into upper_back,
 * V16 brought lats back, V19 split upper_back into mid_back and rear_delts).
 * Rows written before a change still carry the old name, so every read goes
 * through here rather than trusting the stored string.
 */
import { ALL_TRACKABLE_MUSCLE_GROUPS, type PrimaryMuscleGroup } from '../types';

/** Retired group -> what it is read as now. */
export const LEGACY_MUSCLE_GROUPS: Record<string, PrimaryMuscleGroup> = {
  // V19: rows kept the bulk of the old upper_back volume, so it reads as mid_back.
  // Rear-delt exercises were remapped explicitly by the migration.
  upper_back: 'mid_back',
};

export function canonicalMuscleGroup(value: unknown): PrimaryMuscleGroup | null {
  if (typeof value !== 'string') return null;
  if ((ALL_TRACKABLE_MUSCLE_GROUPS as string[]).includes(value)) return value as PrimaryMuscleGroup;
  return LEGACY_MUSCLE_GROUPS[value] ?? null;
}

/**
 * The distinct credited groups for an exercise's stored primaries: duplicates
 * collapse, legacy names resolve, and the 'miscellaneous' placeholder earns
 * nothing. Empty means the exercise is unmapped.
 */
export function creditedPrimaries(stored: ReadonlyArray<unknown> | null | undefined): PrimaryMuscleGroup[] {
  const out = new Set<PrimaryMuscleGroup>();
  for (const raw of stored ?? []) {
    const group = canonicalMuscleGroup(raw);
    if (group && group !== 'miscellaneous') out.add(group);
  }
  return [...out];
}
