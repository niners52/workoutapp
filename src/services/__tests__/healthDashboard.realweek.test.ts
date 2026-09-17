/**
 * Tier 2 against real data from the Workouts connector on 2026-09-14:
 * get_body_weight_log (newest entries) and get_weekly_volume (week of Sep 14,
 * cloud targets). Volume here stands in for analytics.getWeeklyVolume output.
 */
import { DEFAULT_HEALTH_TARGETS, type MuscleGroupVolume } from '../../types';
import { bodyWeightTile, weeklyVolumeView } from '../healthDashboard';

const t = DEFAULT_HEALTH_TARGETS;
const mondayMorning = new Date(2026, 8, 14, 10, 43);

const weights = [
  { date: '2026-09-13', weight: 183.4 },
  { date: '2026-09-10', weight: 186.9 },
  { date: '2026-09-08', weight: 187.5 },
  { date: '2026-09-03', weight: 187.9 },
  { date: '2026-09-01', weight: 192.9 },
  { date: '2026-08-28', weight: 188 },
];

test('body weight: 7-day average 185.9 lb is within 1 lb of 185, so maintenance mode', () => {
  const w = bodyWeightTile(weights, t, mondayMorning);
  expect(w).toMatchObject({ kind: 'trend', avg7: 185.9, atGoal: true, phase: 'maintenance', detail: 'At goal — maintenance mode' });
});

const vol = (muscleGroup: string, sets: number, target: number): MuscleGroupVolume =>
  ({ muscleGroup, sets, target, exercises: [] }) as unknown as MuscleGroupVolume;

const week = [
  vol('chest', 11, 12), vol('lats', 3, 0), vol('upper_back', 0, 12), vol('side_delts', 0, 6),
  vol('triceps', 3, 12), vol('biceps', 3, 12), vol('quads', 0, 12), vol('hamstrings', 0, 6),
  vol('glutes', 0, 3), vol('calves', 0, 3), vol('abs', 3, 6), vol('traps', 3, 6), vol('lower_back', 0, 6),
];

test('weekly volume: focus rows first, then biggest gap first, pinned groups not repeated', () => {
  const v = weeklyVolumeView(week, t, mondayMorning, 'monday');
  expect(v.deload).toBe(false);
  expect(v.focus.map(r => [r.key, r.sets, r.target])).toEqual([
    ['focus:upper-chest', 0, null], ['focus:traps', 3, 6], ['focus:mid-back', 0, 12], ['focus:hamstrings', 0, 6],
    // Before the lats remap the cloud had no lats target, so the pinned row has none either.
    ['focus:lats', 3, null],
  ]);
  expect(v.open.map(r => r.muscleGroup)).toEqual([
    'quads', 'biceps', 'triceps', 'lower_back', 'side_delts', 'abs', 'calves', 'glutes', 'chest',
  ]);
  expect(v.met).toEqual([]);
  expect(v.open.find(r => r.muscleGroup === 'quads')?.tone).toBe('warning');
  expect(v.open.find(r => r.muscleGroup === 'triceps')?.tone).toBe('normal');
});

// The same snapshot with the new lats target of 10 and an illustrative 6 lats
// sets. No UI change: the target flows in through mg.target like every group.
const weekAfterLatsRemap = week.map(v =>
  v.muscleGroup === 'lats' ? vol('lats', 6, 10) : v,
);

test('lats target: the pinned lats focus row picks up the target of 10', () => {
  const v = weeklyVolumeView(weekAfterLatsRemap, t, mondayMorning, 'monday');
  expect(v.focus.find(r => r.key === 'focus:lats')).toMatchObject({ label: 'Lats', sets: 6, target: 10, gap: 4, pinned: true });
  expect(v.open.some(r => r.muscleGroup === 'lats')).toBe(false);
});

test('lats target: unpinned, lats joins the gap sort (gap 4 sits between side delts and abs)', () => {
  const unpinned = { ...t, focusGroups: t.focusGroups.filter(f => f.id !== 'lats') };
  const v = weeklyVolumeView(weekAfterLatsRemap, unpinned, mondayMorning, 'monday');
  expect(v.open.map(r => r.muscleGroup)).toEqual([
    'quads', 'biceps', 'triceps', 'lower_back', 'side_delts', 'lats', 'abs', 'calves', 'glutes', 'chest',
  ]);
});

test('weekly volume: the seeded deload week (Sep 21) suspends urgency', () => {
  const v = weeklyVolumeView(week, t, new Date(2026, 8, 25, 12, 0), 'monday');
  expect(v.deload).toBe(true);
  expect([...v.focus, ...v.open].every(r => r.tone === 'normal' || r.tone === 'muted')).toBe(true);
});
