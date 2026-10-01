/**
 * Warm-up sets: prep work that should not read as training volume.
 *
 * Rotator-cuff work before pressing is the case that forced this — eight sets
 * a session of prep were counting like eight working sets and swamping the
 * weekly numbers. A warm-up stays in session history and in the exercise's
 * own history; it is left out of weekly volume and reported separately, the
 * same way deload sets are.
 *
 * A set carries the flag itself. The exercise's `defaultWarmup` only decides
 * what a newly logged set starts as, so flipping the toggle on one set never
 * rewrites history.
 */
import type { Exercise, WorkoutSet } from '../types';

export function isWarmupSet(
  set: Pick<WorkoutSet, 'isWarmup'>,
  exercise?: Pick<Exercise, 'defaultWarmup'> | null,
): boolean {
  // An explicit flag on the set always wins; otherwise fall back to the
  // exercise default, so sets logged before the toggle existed on a prep
  // movement are treated as the prep they were.
  return set.isWarmup ?? exercise?.defaultWarmup ?? false;
}

/** Working sets only — what weekly volume counts. */
export function workingSets<T extends Pick<WorkoutSet, 'isWarmup' | 'exerciseId'>>(
  sets: T[],
  exercisesById: Map<string, Pick<Exercise, 'defaultWarmup'>>,
): T[] {
  return sets.filter(s => !isWarmupSet(s, exercisesById.get(s.exerciseId)));
}

export function countWarmupSets<T extends Pick<WorkoutSet, 'isWarmup' | 'exerciseId'>>(
  sets: T[],
  exercisesById: Map<string, Pick<Exercise, 'defaultWarmup'>>,
): number {
  return sets.length - workingSets(sets, exercisesById).length;
}
