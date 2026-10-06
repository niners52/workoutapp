/**
 * Strength standards, said out loud on the homepage.
 *
 * The strength map already works out a level per muscle from your best
 * estimated 1RM against body weight. What it never says is the bit that
 * motivates: which lift just went up a level, and how many pounds the next one
 * costs.
 */
import {
  STRENGTH_LEVELS,
  STRENGTH_LEVEL_LABELS,
  type MuscleStrengthResult,
  type StrengthLevel,
} from './strengthStandards';

import type { PrimaryMuscleGroup } from '../types';

/**
 * How far into the next level still counts as "nearly there". Below the lower
 * bound the gap is rounding, not a goal: being one pound off Novice says
 * nothing worth putting on the homepage.
 */
const TRIVIAL_POUNDS_TO_NEXT = 3;


export interface StrengthHighlight {
  exerciseName: string;
  level: StrengthLevel;
  levelLabel: string;
  /** The level above this one, or null at elite. */
  nextLevelLabel: string | null;
  /** Pounds of estimated 1RM still needed for the next level; null at elite. */
  poundsToNext: number | null;
  /** Level at the start-of-training snapshot, when it was lower. */
  previousLevelLabel: string | null;
  /** The next level is within a couple of pounds — say so instead of counting. */
  atThreshold: boolean;
}

function nextLevel(level: StrengthLevel): StrengthLevel | null {
  const i = STRENGTH_LEVELS.indexOf(level);
  return i >= 0 && i < STRENGTH_LEVELS.length - 1 ? STRENGTH_LEVELS[i + 1]! : null;
}

function isHigher(a: StrengthLevel, b: StrengthLevel): boolean {
  return STRENGTH_LEVELS.indexOf(a) > STRENGTH_LEVELS.indexOf(b);
}

/**
 * The lines worth showing: lifts that have gone up a level since the early
 * snapshot first, then the ones closest to their next level. `limit` caps the
 * list so the homepage stays a glance, not a report.
 */
export function strengthHighlights(
  current: Map<PrimaryMuscleGroup, MuscleStrengthResult>,
  start?: Map<PrimaryMuscleGroup, MuscleStrengthResult> | null,
  limit: number = 3,
): StrengthHighlight[] {
  const rows: Array<StrengthHighlight & { sortKey: number; levelUp: boolean }> = [];

  for (const [muscle, result] of current) {
    const best = result.bestExercise;
    if (!best) continue;
    const startLevel = start?.get(muscle)?.bestExercise?.level ?? null;
    const levelUp = !!startLevel && isHigher(best.level, startLevel);
    const next = nextLevel(best.level);
    const poundsToNext =
      best.nextLevelE1rm !== null ? Math.max(1, Math.round(best.nextLevelE1rm - best.e1rmLbs)) : null;

    rows.push({
      exerciseName: best.exerciseName,
      level: best.level,
      levelLabel: STRENGTH_LEVEL_LABELS[best.level],
      nextLevelLabel: next ? STRENGTH_LEVEL_LABELS[next] : null,
      poundsToNext,
      previousLevelLabel: levelUp && startLevel ? STRENGTH_LEVEL_LABELS[startLevel] : null,
      atThreshold: poundsToNext !== null && poundsToNext < TRIVIAL_POUNDS_TO_NEXT,
      // Level-ups first, then the strongest lifts, then whoever needs the
      // fewest pounds. Sorting on closeness alone promoted whatever happened
      // to sit a pound under a threshold, which was usually a lift at the
      // bottom of the scale.
      sortKey: poundsToNext ?? Number.MAX_SAFE_INTEGER,
      levelUp,
    });
  }

  // One row per exercise: the same lift can be the best for two muscle groups.
  const byExercise = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = byExercise.get(row.exerciseName);
    if (!existing || (!existing.levelUp && row.levelUp) || row.sortKey < existing.sortKey) {
      byExercise.set(row.exerciseName, row);
    }
  }

  const levelRank = (l: StrengthLevel) => STRENGTH_LEVELS.indexOf(l);
  return [...byExercise.values()]
    .sort(
      (a, b) =>
        Number(b.levelUp) - Number(a.levelUp) ||
        levelRank(b.level) - levelRank(a.level) ||
        a.sortKey - b.sortKey ||
        a.exerciseName.localeCompare(b.exerciseName),
    )
    .slice(0, limit)
    .map(({ sortKey: _sortKey, levelUp: _levelUp, ...highlight }) => highlight);
}
