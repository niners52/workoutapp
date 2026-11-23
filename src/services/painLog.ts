/**
 * Pain log: areas, which muscle groups each one covers, and the warning an
 * exercise gets when one of its muscles sits in an area that hurt recently.
 *
 * An exercise is warned when any of its primary or secondary muscle groups is
 * in an area with a score of PAIN_WARN_SCORE or more in the last
 * PAIN_WINDOW_DAYS. Pure: the store is painLogStore.ts.
 */
import type { Exercise, PainArea, PainLogEntry, PainSide } from '../types';

export const PAIN_WARN_SCORE = 3;
export const PAIN_WINDOW_DAYS = 14;

export const PAIN_AREAS: Array<{ key: PainArea; label: string; muscles: string[] }> = [
  { key: 'neck', label: 'Neck', muscles: ['traps'] },
  { key: 'shoulder', label: 'Shoulder', muscles: ['front_delts', 'side_delts', 'rear_delts', 'rotator_cuff'] },
  { key: 'elbow', label: 'Elbow', muscles: ['triceps', 'biceps', 'forearms'] },
  { key: 'wrist', label: 'Wrist', muscles: ['forearms'] },
  { key: 'chest', label: 'Chest', muscles: ['chest'] },
  { key: 'upper_back', label: 'Upper back', muscles: ['traps', 'mid_back', 'rear_delts', 'upper_back'] },
  { key: 'lower_back', label: 'Lower back', muscles: ['lower_back'] },
  { key: 'hip', label: 'Hip', muscles: ['glutes', 'adductors'] },
  { key: 'knee', label: 'Knee', muscles: ['quads', 'hamstrings'] },
  { key: 'ankle', label: 'Ankle', muscles: ['calves'] },
  { key: 'other', label: 'Other', muscles: [] },
];

export const PAIN_SIDES: Array<{ key: PainSide; label: string }> = [
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'both', label: 'Both / center' },
];

export const painAreaLabel = (area: PainArea) => PAIN_AREAS.find(a => a.key === area)?.label ?? area;

export interface PainWarning {
  area: PainArea;
  /** The worst score in the window. */
  score: number;
  /** Date of that entry. */
  date: string;
  side: PainSide;
  message: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Recent pain in any area this exercise works, worst first. */
export function painWarningsFor(
  exercise: Pick<Exercise, 'primaryMuscleGroups' | 'secondaryMuscleGroups' | 'primaryMuscleGroup'> | undefined,
  entries: PainLogEntry[],
  now: Date = new Date(),
): PainWarning[] {
  if (!exercise) return [];
  const groups = new Set<string>([
    ...(exercise.primaryMuscleGroups ?? (exercise.primaryMuscleGroup ? [exercise.primaryMuscleGroup] : [])),
    ...(exercise.secondaryMuscleGroups ?? []),
  ]);
  const since = new Date(now.getTime() - PAIN_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const worst = new Map<PainArea, PainLogEntry>();
  for (const e of entries) {
    if (e.score < PAIN_WARN_SCORE || e.date < since || e.date > today) continue;
    const area = PAIN_AREAS.find(a => a.key === e.area);
    if (!area || !area.muscles.some(m => groups.has(m))) continue;
    const prev = worst.get(e.area);
    if (!prev || e.score > prev.score || (e.score === prev.score && e.date > prev.date)) worst.set(e.area, e);
  }
  return [...worst.values()]
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
    .map(e => {
      const side = e.side === 'both' ? '' : `${e.side} `;
      return {
        area: e.area,
        score: e.score,
        date: e.date,
        side: e.side,
        message: `${side}${painAreaLabel(e.area).toLowerCase()} pain ${e.score}/10 on ${e.date.slice(5).replace('-', '/')} — go easy or swap`.replace(/^./, c => c.toUpperCase()),
      };
    });
}

export function painEntryFromRow(row: any): PainLogEntry {
  return {
    id: row.id,
    date: row.date,
    area: row.area,
    side: row.side ?? 'both',
    score: Number(row.score),
    ...(row.note ? { note: row.note } : {}),
  };
}
