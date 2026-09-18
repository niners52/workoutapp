import { startOfWeek, endOfWeek } from 'date-fns';
import { ExerciseSwap, Exercise, WeekStartDay, DAY_NAMES } from '../types';

// A swap made earlier this week that's relevant to an exercise in the current workout.
export interface SwapConflict {
  exerciseId: string;
  // 'swapped_in'  → this exercise was swapped IN earlier this week (it's a replacement)
  // 'swapped_out' → this exercise was swapped OUT earlier this week (you replaced it)
  kind: 'swapped_in' | 'swapped_out';
  dayLabel: string;   // e.g. "Monday"
  otherName: string;  // swapped_in → the original it replaced; swapped_out → what replaced it
  message: string;    // ready-to-render banner text
}

/**
 * Detect cross-day swap conflicts for the exercises in the current workout.
 *
 * Scenario: on Monday the user swaps Cable Curl → Hammer Curl. On Thursday the
 * template also contains Hammer Curl. When Thursday's workout loads we flag Hammer
 * Curl as "swapped in on Monday (was Cable Curl)" so the user can decide whether to
 * keep it, revert to the original, or pick a third option — avoiding accidental
 * doubling-up or loss of intended variety.
 *
 * Only swaps from OTHER workouts earlier in the current week are considered; swaps
 * made inside the current workout are excluded (they're not a "later day" conflict).
 */
export function getWeekSwapConflicts(
  currentExerciseIds: string[],
  opts: {
    exerciseSwaps: ExerciseSwap[];
    exercises: Exercise[];
    weekStartDay: WeekStartDay;
    currentWorkoutId: string | null;
    now?: Date;
  }
): Map<string, SwapConflict> {
  const { exerciseSwaps, exercises, weekStartDay, currentWorkoutId } = opts;
  const result = new Map<string, SwapConflict>();
  if (currentExerciseIds.length === 0 || exerciseSwaps.length === 0) return result;

  const now = opts.now ?? new Date();
  const weekStartsOn = weekStartDay === 'monday' ? 1 : 0;
  const weekStart = startOfWeek(now, { weekStartsOn });
  const weekEnd = endOfWeek(now, { weekStartsOn });

  const nameById = new Map(exercises.map(e => [e.id, e.name]));
  const idSet = new Set(currentExerciseIds);

  // Swaps from earlier this week, excluding the active workout, most recent first so
  // the freshest swap wins when an exercise matches more than one.
  const weekSwaps = exerciseSwaps
    .filter(s => {
      if (s.workoutId === currentWorkoutId) return false;
      const t = new Date(s.swappedAt);
      return t >= weekStart && t <= weekEnd;
    })
    .sort((a, b) => b.swappedAt.localeCompare(a.swappedAt));

  for (const swap of weekSwaps) {
    const dayLabel = DAY_NAMES[new Date(swap.swappedAt).getDay()];

    // This exercise was swapped IN earlier this week (it is the replacement).
    if (idSet.has(swap.currentExerciseId) && !result.has(swap.currentExerciseId)) {
      const originalName = nameById.get(swap.originalExerciseId) ?? 'another exercise';
      result.set(swap.currentExerciseId, {
        exerciseId: swap.currentExerciseId,
        kind: 'swapped_in',
        dayLabel,
        otherName: originalName,
        message: `⚠️ Swapped in on ${dayLabel} (was ${originalName})`,
      });
    }

    // This exercise was swapped OUT earlier this week (you replaced it with something).
    if (idSet.has(swap.originalExerciseId) && !result.has(swap.originalExerciseId)) {
      const replacementName = nameById.get(swap.currentExerciseId) ?? 'another exercise';
      result.set(swap.originalExerciseId, {
        exerciseId: swap.originalExerciseId,
        kind: 'swapped_out',
        dayLabel,
        otherName: replacementName,
        message: `You replaced this with ${replacementName} on ${dayLabel}`,
      });
    }
  }

  return result;
}
