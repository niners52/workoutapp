/**
 * How many sets an exercise is aiming for in the current workout.
 *
 * Normal: a per-workout override wins, then the exercise's own saved target,
 * then the global default (doubled for unilateral exercises, since each set is
 * one side).
 *
 * On a workout flagged as deload the target drops to the deload number (also
 * doubled for unilateral). It only ever lowers: an exercise already aiming for
 * fewer sets keeps its own number, and a per-workout override always wins,
 * because that is the user saying what they want right now.
 */
import type { Exercise, UserSettings } from '../types';
import { DEFAULT_USER_SETTINGS } from '../types';

export interface TargetSetsInput {
  exercise?: Pick<Exercise, 'targetSets' | 'isUnilateral'> | null;
  /** Per-workout choice from the exercise edit sheet ("not permanent"). */
  override?: number;
  settings?: Pick<UserSettings, 'defaultTargetSets' | 'deloadTargetSets'> | null;
  isDeloadWorkout?: boolean;
}

export function targetSetsFor({ exercise, override, settings, isDeloadWorkout }: TargetSetsInput): number {
  const perSide = (n: number) => (exercise?.isUnilateral ? n * 2 : n);
  const base = settings?.defaultTargetSets ?? DEFAULT_USER_SETTINGS.defaultTargetSets;
  const normal = override ?? exercise?.targetSets ?? perSide(base);
  if (!isDeloadWorkout || override !== undefined) return normal;

  const deload = perSide(settings?.deloadTargetSets ?? DEFAULT_USER_SETTINGS.deloadTargetSets ?? base);
  return Math.min(normal, deload);
}
