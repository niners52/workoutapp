/**
 * Swaps that have stopped being swaps.
 *
 * Replacing the same exercise with the same one week after week is not a
 * substitution any more, it is the plan — and every week it stays a "swap" the
 * original turns up as work still owed. When that happens for a few weeks
 * running, the app offers to update the template instead of asking again.
 */
import { startOfWeek } from 'date-fns';
import type { Exercise, ExerciseSwap, WeekStartDay } from '../types';

/** Weeks in a row before the app offers to make a swap permanent. */
export const RECURRING_SWAP_WEEKS = 3;

export interface RecurringSwap {
  originalExerciseId: string;
  currentExerciseId: string;
  originalName: string;
  currentName: string;
  /** How many consecutive weeks (including this one or last) the swap was made. */
  weeks: number;
  /** Stable id for dismissals. */
  key: string;
}

function weekKey(iso: string, weekStartDay: WeekStartDay): string | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return startOfWeek(d, { weekStartsOn: weekStartDay === 'monday' ? 1 : 0 }).toISOString().slice(0, 10);
}

export function recurringSwapKey(originalExerciseId: string, currentExerciseId: string): string {
  return `${originalExerciseId}->${currentExerciseId}`;
}

/**
 * Swap pairs made in at least `minWeeks` consecutive weeks, counting back from
 * the most recent week the pair appears in. A gap week ends the run, so an
 * old habit that stopped does not keep prompting.
 */
export function findRecurringSwaps(
  swaps: ExerciseSwap[],
  exercises: Exercise[],
  weekStartDay: WeekStartDay,
  now: Date = new Date(),
  minWeeks: number = RECURRING_SWAP_WEEKS,
): RecurringSwap[] {
  const byId = new Map(exercises.map(e => [e.id, e]));
  const weeksByPair = new Map<string, Set<string>>();

  for (const swap of swaps) {
    const week = weekKey(swap.swappedAt, weekStartDay);
    if (!week) continue;
    const key = recurringSwapKey(swap.originalExerciseId, swap.currentExerciseId);
    const weeks = weeksByPair.get(key) ?? new Set<string>();
    weeks.add(week);
    weeksByPair.set(key, weeks);
  }

  const thisWeek = startOfWeek(now, { weekStartsOn: weekStartDay === 'monday' ? 1 : 0 });
  const weekBefore = (key: string, back: number): string => {
    const d = new Date(key);
    d.setDate(d.getDate() - 7 * back);
    return d.toISOString().slice(0, 10);
  };

  const out: RecurringSwap[] = [];
  for (const [key, weeks] of weeksByPair) {
    const sorted = [...weeks].sort((a, b) => b.localeCompare(a));
    const newest = sorted[0];
    if (!newest) continue;
    // Only an ongoing habit counts: the run has to reach this week or last.
    const thisWeekKey = thisWeek.toISOString().slice(0, 10);
    if (newest !== thisWeekKey && newest !== weekBefore(thisWeekKey, 1)) continue;

    let run = 1;
    while (weeks.has(weekBefore(newest, run))) run += 1;
    if (run < minWeeks) continue;

    const [originalExerciseId, currentExerciseId] = key.split('->');
    const original = byId.get(originalExerciseId!);
    const current = byId.get(currentExerciseId!);
    if (!original || !current) continue;
    out.push({
      originalExerciseId: originalExerciseId!,
      currentExerciseId: currentExerciseId!,
      originalName: original.name,
      currentName: current.name,
      weeks: run,
      key,
    });
  }

  return out.sort((a, b) => b.weeks - a.weeks || a.originalName.localeCompare(b.originalName));
}
