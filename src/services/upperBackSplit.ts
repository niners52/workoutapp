/**
 * V19: upper_back splits into mid_back (rows) and rear_delts (face pulls,
 * reverse flyes). One group covering both meant a week of rows read as full
 * back work while the rear delts went untouched.
 *
 * Every exercise mapped to upper_back on 2026-09-30 is listed here, so the
 * phone migration, supabase/migrations/20260930000000_upper_back_split.sql and
 * the regression fixture all make the same call.
 */
import type { Exercise, PrimaryMuscleGroup } from '../types';

/** Horizontal pulling. */
export const MID_BACK_EXERCISE_IDS: readonly string[] = [
  'import-seated-row',                    // Machine Seated Row
  'import-low-cable-row',                 // Cable Low Row
  'import-bentover-row',                  // Dumbbell Bentover Row
  'import-dumbbell-barbell-row',          // Dumbbell/Barbell Row
  'one-arm-db-row',                       // One-Arm DB Row
  'chest-supported-db-row',               // Chest-Supported DB Row
  'chest-supported-machine-row',          // Chest-Supported Machine Row
  'import-wide-grip-row',                 // Cable Wide Grip Row (also traps)
  '84b5317c-7dfb-4cf2-8b65-4f5c08e02901', // Machine Mts row
  '083c1c85-f090-4a50-a430-19393c82d080', // Machine ISO Lateral Row
  '32f82f4b-eea1-4434-9c5c-3d726318bff3', // Machine ISO Lateral Low Row
  '53e24479-949d-4501-b1c8-d88990d49c8f', // Machine T Bar Row
];

/** Rear-delt work: face pulls, reverse flyes, Y raises. */
export const REAR_DELT_EXERCISE_IDS: readonly string[] = [
  'face-pull',                            // Cable Face Pull
  'rear-delt-fly-machine',                // Machine Rear-Delt Fly Machine
  'incline-bench-rear-delt-db-fly',       // Incline Bench Rear-Delt DB Fly
  'import-y-raise',                       // Dumbbell Y Raise (rear delts / lower traps)
  'b5400777-ab8f-4d03-9b28-c9b393ff04bf', // Machine Reverse pec fly
  'ded1d7f5-e42b-4ccc-8fb4-58e0889821ff', // Cable (Other) Single arm rear delt fly
  '3ce3318e-5633-421b-a6e6-776bf1d8abe3', // Cable Rear delt cross pull
  'e6488686-a1db-4032-b766-0dc133f65fa7', // Cable Rear delt fly
];

/**
 * Exercises where upper_back was a second group on something that belongs
 * elsewhere: a shrug is traps, a pulldown is lats. They just lose it.
 */
export const DROP_UPPER_BACK_EXERCISE_IDS: readonly string[] = [
  'e7e07ae2-6022-41ce-a33a-2cf29d92a8f8', // Cable (D-Handle) Shrug -> traps
  '3d73048e-fe49-448d-b81a-76fd7d54ff32', // Machine ISO lateral front lat pulldown -> lats
];

/** The rotator-cuff prep work that logs as warm-up from now on. */
export const WARMUP_BY_DEFAULT_EXERCISE_IDS: readonly string[] = [
  'bcc9b2b0-0309-4b44-84d7-49de58ab8064', // Cable (D-Handle) Rotator cuff
];

function replaceUpperBack(groups: PrimaryMuscleGroup[] | undefined, replacement: PrimaryMuscleGroup | null): PrimaryMuscleGroup[] | undefined {
  if (!groups) return groups;
  const mapped = groups.flatMap(g => (g === 'upper_back' ? (replacement ? [replacement] : []) : [g]));
  return [...new Set(mapped)];
}

/**
 * The exercise as it should be after the split, or null when nothing changes.
 * Anything still mapped to upper_back that is not in the lists above is read
 * as mid_back, since rows were the bulk of that group.
 */
export function splitUpperBack(exercise: Exercise): Exercise | null {
  const stored: PrimaryMuscleGroup[] =
    exercise.primaryMuscleGroups ?? (exercise.primaryMuscleGroup ? [exercise.primaryMuscleGroup] : []);
  const touchesUpperBack = stored.includes('upper_back') || (exercise.secondaryMuscleGroups ?? []).includes('upper_back');
  const warmup = WARMUP_BY_DEFAULT_EXERCISE_IDS.includes(exercise.id) && !exercise.defaultWarmup;
  if (!touchesUpperBack && !warmup) return null;

  const replacement: PrimaryMuscleGroup | null = REAR_DELT_EXERCISE_IDS.includes(exercise.id)
    ? 'rear_delts'
    : DROP_UPPER_BACK_EXERCISE_IDS.includes(exercise.id)
      ? null
      : 'mid_back';

  const primaries = replaceUpperBack(stored, replacement) ?? [];
  // A duplicate of the primary in the secondaries says nothing; drop it there.
  const secondaries = (replaceUpperBack(exercise.secondaryMuscleGroups, replacement) ?? []).filter(
    g => !primaries.includes(g),
  );

  return {
    ...exercise,
    ...(primaries.length > 0 ? { primaryMuscleGroup: primaries[0], primaryMuscleGroups: primaries } : {}),
    secondaryMuscleGroups: secondaries,
    ...(warmup ? { defaultWarmup: true } : {}),
  };
}
