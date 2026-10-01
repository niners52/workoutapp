/**
 * Exercise records that describe the wrong movement.
 *
 * Three of these were found by reading the history rather than the name: a
 * "Front raise" whose 9 sets at 20-45 lbs are all pull-throughs, and two
 * exercises left with no primary group at all — their seed rows used the old
 * singular `primaryMuscleGroup` field, which nothing reads any more, so every
 * set they hold earned no credit anywhere.
 *
 * Applied to stored exercises by migration V20 and to the cloud by
 * `20261001000000_exercise_record_fixes_full_body.sql`. Both must agree.
 */
import type { Exercise, PrimaryMuscleGroup } from '../types';

export interface ExerciseRecordFix {
  name?: string;
  baseName?: string;
  primaryMuscleGroups?: PrimaryMuscleGroup[];
  secondaryMuscleGroups?: PrimaryMuscleGroup[];
  /** Locations to add to the ones already tagged — never removes any. */
  addLocationIds?: string[];
  /** Why, for the migration log and for anyone reading this later. */
  reason: string;
}

export const EXERCISE_RECORD_FIXES: Record<string, ExerciseRecordFix> = {
  // 9 sets on 2026-08-31, 09-18 and 10-01 at 20-45 lbs, all the same movement.
  'e1bc84b4-90e6-427e-bd1a-fdebf6b821ae': {
    name: 'Cable (Rope) Pull-Through',
    baseName: 'Pull-Through',
    primaryMuscleGroups: ['glutes'],
    secondaryMuscleGroups: ['hamstrings'],
    reason: 'logged as a front raise, actually a cable pull-through',
  },
  // Seeded with the deprecated singular field, so it has no primary group.
  'db-hip-thrust': {
    primaryMuscleGroups: ['glutes'],
    secondaryMuscleGroups: ['hamstrings'],
    reason: 'no primary group — its sets earned no credit',
  },
  // Same fault, 168 sets deep. A pullover is lats work, as the others are.
  'db-pullover': {
    primaryMuscleGroups: ['lats'],
    secondaryMuscleGroups: ['chest'],
    reason: 'no primary group — 168 sets earning no credit; a pullover is lats',
  },
  'import-close-grip-bench-press': {
    primaryMuscleGroups: ['triceps'],
    secondaryMuscleGroups: ['chest'],
    reason: 'no primary group — 45 sets earning no credit',
  },
  // Both are at both gyms; they were tagged for one, which made them look
  // unavailable on the full-body day they sit on.
  'cable-lateral-raise': { addLocationIds: ['vasa-'], reason: 'available at Vasa too' },
  'import-tricep-dip-machine': { addLocationIds: ['vasa-'], reason: 'available at Vasa too' },
};

/**
 * The fixed exercise, or null when nothing changes. Favourite, unilateral,
 * location and variant fields are left exactly as they are: only the fields
 * named in the fix move.
 */
export function applyExerciseRecordFix(exercise: Exercise): Exercise | null {
  const fix = EXERCISE_RECORD_FIXES[exercise.id];
  if (!fix) return null;

  const next: Exercise = { ...exercise };
  if (fix.name) next.name = fix.name;
  if (fix.baseName) next.baseName = fix.baseName;
  if (fix.primaryMuscleGroups) next.primaryMuscleGroups = [...fix.primaryMuscleGroups];
  if (fix.secondaryMuscleGroups) next.secondaryMuscleGroups = [...fix.secondaryMuscleGroups];
  // The singular field is deprecated but still seeded; leaving it set to the
  // old muscle is what hid these records in the first place.
  if (fix.primaryMuscleGroups) next.primaryMuscleGroup = fix.primaryMuscleGroups[0];
  if (fix.addLocationIds) next.locationIds = [...new Set([...(exercise.locationIds ?? []), ...fix.addLocationIds])];

  const same =
    next.name === exercise.name &&
    next.baseName === exercise.baseName &&
    sameGroups(next.primaryMuscleGroups, exercise.primaryMuscleGroups) &&
    sameGroups(next.secondaryMuscleGroups, exercise.secondaryMuscleGroups) &&
    sameGroups(next.locationIds, exercise.locationIds) &&
    next.primaryMuscleGroup === exercise.primaryMuscleGroup;
  return same ? null : next;
}

function sameGroups(a?: string[], b?: string[]): boolean {
  if ((a?.length ?? 0) !== (b?.length ?? 0)) return false;
  return (a ?? []).every((g, i) => g === b?.[i]);
}
