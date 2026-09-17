import type { Exercise, FocusGroup, PrimaryMuscleGroup } from '../types';

/**
 * Exercises that train the lats as the prime mover: every vertical pulldown
 * variant, pull-ups, the straight-arm pulldowns, and pullovers. Rows (seated, low cable,
 * T-bar, chest-supported) stay upper_back. Ids match the cloud rows remapped by
 * supabase/migrations/20260917000000_lats_remap.sql (storage migration V16).
 */
export const LATS_PRIMARY_EXERCISE_IDS: readonly string[] = [
  'wide-grip-lat-pulldown',               // Cable Wide-Grip Lat Pulldown
  'close-grip-pulldown',                  // Cable Close-Grip Pulldown
  'neutral-close-grip-pulldown',          // Cable (Other) Neutral Pulldown
  'import-reverse-grip-pulldown',         // Cable Reverse Grip Pulldown
  'import-mts-front-pulldown',            // Machine MTS Front Pulldown
  '86847ace-fb9f-421b-b32b-776f27c56775', // Machine Lat pulldown (was lats + upper_back)
  '163ac4a9-8e88-4508-bca8-3fffb18bdd7b', // Machine ISO lateral wide pulldown
  'import-pullup',                        // Bodyweight Pull-Up
  'import-pullup-assisted',               // Machine Pull-Up (Assisted)
  'straight-arm-pulldown',                // Cable Straight-Arm Pulldown
  'ae43a483-3e85-46d3-bcb2-33e014dbca97', // Cable (Straight Bar) arm pulldown (already lats)
  'b26cd556-5623-418d-8ca1-8122fe91a8c7', // Machine Pullover
  'b255de9b-fc45-4315-b222-aaa82387dff0', // Cable Rope Pullover
];

export const LATS_WEEKLY_TARGET = 10;

export const LATS_FOCUS_GROUP: FocusGroup = { id: 'lats', label: 'Lats', muscleGroup: 'lats' };

/**
 * Lats-only primaries for the exercises above. An upper_back primary moves to
 * the secondaries (context only, never credited), so a pulldown set counts
 * once, for lats. Returns null when the exercise is not listed or already matches.
 */
export function remapToLatsPrimary(e: Exercise): Exercise | null {
  if (!LATS_PRIMARY_EXERCISE_IDS.includes(e.id)) return null;
  const stored: PrimaryMuscleGroup[] = e.primaryMuscleGroups ?? (e.primaryMuscleGroup ? [e.primaryMuscleGroup] : []);
  const secondaries = [...(e.secondaryMuscleGroups ?? [])];
  if (stored.includes('upper_back') && !secondaries.includes('upper_back')) secondaries.push('upper_back');
  const unchanged =
    e.primaryMuscleGroup === 'lats' &&
    stored.length === 1 &&
    stored[0] === 'lats' &&
    secondaries.length === (e.secondaryMuscleGroups ?? []).length;
  if (unchanged) return null;
  return { ...e, primaryMuscleGroup: 'lats', primaryMuscleGroups: ['lats'], secondaryMuscleGroups: secondaries };
}

/** Focus rows with a whole-group lats row appended, unless one is already there. */
export function withLatsFocusGroup(focusGroups: FocusGroup[]): FocusGroup[] {
  return focusGroups.some(f => f.muscleGroup === 'lats' && !f.exerciseNameIncludes?.trim())
    ? focusGroups
    : [...focusGroups, { ...LATS_FOCUS_GROUP }];
}
