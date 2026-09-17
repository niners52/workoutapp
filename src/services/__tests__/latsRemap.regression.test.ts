/**
 * Regression fixture for the lats remap (storage V16 /
 * supabase/migrations/20260917000000_lats_remap.sql).
 *
 * `before` rows are the exercise mappings read from the Workouts connector on
 * 2026-09-17. The week of 2026-09-07 uses the real lats-family sets from that
 * week (get_exercise_history); the connector reported lats 3 / upper_back 24
 * for it before the remap. One seated-row block is synthetic, to pin that rows
 * stay upper_back.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { DEFAULT_USER_SETTINGS, type Exercise, type Workout, type WorkoutSet } from '../../types';
import { computeWeeklyVolume } from '../analytics';
import { LATS_FOCUS_GROUP, LATS_PRIMARY_EXERCISE_IDS, remapToLatsPrimary, withLatsFocusGroup } from '../latsRemap';

const ex = (id: string, name: string, primaries: Exercise['primaryMuscleGroups'], secondaries: Exercise['secondaryMuscleGroups'] = []): Exercise =>
  ({ id, name, primaryMuscleGroup: primaries![0], primaryMuscleGroups: primaries, secondaryMuscleGroups: secondaries, equipment: 'cable' }) as Exercise;

const before: Exercise[] = [
  ex('wide-grip-lat-pulldown', 'Cable Wide-Grip Lat Pulldown', ['upper_back'], ['biceps']),
  ex('close-grip-pulldown', 'Cable Close-Grip Pulldown', ['upper_back'], ['biceps']),
  ex('neutral-close-grip-pulldown', 'Cable (Other) Neutral Pulldown', ['upper_back'], ['biceps']),
  ex('import-reverse-grip-pulldown', 'Cable Reverse Grip Pulldown', ['upper_back']),
  ex('import-mts-front-pulldown', 'Machine MTS Front Pulldown', ['upper_back']),
  ex('86847ace-fb9f-421b-b32b-776f27c56775', 'Machine Lat pulldown', ['lats', 'upper_back']),
  ex('163ac4a9-8e88-4508-bca8-3fffb18bdd7b', 'Machine ISO lateral wide pulldown', ['upper_back']),
  ex('import-pullup', 'Bodyweight Pull-Up', ['upper_back']),
  ex('import-pullup-assisted', 'Machine Pull-Up (Assisted)', ['upper_back']),
  ex('straight-arm-pulldown', 'Cable Straight-Arm Pulldown', ['upper_back']),
  ex('ae43a483-3e85-46d3-bcb2-33e014dbca97', 'Cable (Straight Bar) arm pulldown', ['lats']),
  ex('b26cd556-5623-418d-8ca1-8122fe91a8c7', 'Machine Pullover', ['upper_back'], ['side_delts']),
  ex('b255de9b-fc45-4315-b222-aaa82387dff0', 'Cable Rope Pullover', ['upper_back']),
  // Must not move.
  ex('import-seated-row', 'Machine Seated Row', ['upper_back']),
  ex('import-low-cable-row', 'Cable Low Row', ['upper_back']),
  ex('e4ae1797-ec53-4ddf-8473-24cc78c68267', 'Cable (Lat Bar) Pulldown bicep curl', ['biceps']),
  ex('22da91ef-ecfa-4cbb-b93b-2b9f7b7bf586', 'Cable (Rope) Tricep rope pulldown', ['triceps']),
];

const expectedAfter: Record<string, { primaries: string[]; secondaries: string[] }> = {
  'wide-grip-lat-pulldown': { primaries: ['lats'], secondaries: ['biceps', 'upper_back'] },
  'close-grip-pulldown': { primaries: ['lats'], secondaries: ['biceps', 'upper_back'] },
  'neutral-close-grip-pulldown': { primaries: ['lats'], secondaries: ['biceps', 'upper_back'] },
  'import-reverse-grip-pulldown': { primaries: ['lats'], secondaries: ['upper_back'] },
  'import-mts-front-pulldown': { primaries: ['lats'], secondaries: ['upper_back'] },
  '86847ace-fb9f-421b-b32b-776f27c56775': { primaries: ['lats'], secondaries: ['upper_back'] },
  '163ac4a9-8e88-4508-bca8-3fffb18bdd7b': { primaries: ['lats'], secondaries: ['upper_back'] },
  'import-pullup': { primaries: ['lats'], secondaries: ['upper_back'] },
  'import-pullup-assisted': { primaries: ['lats'], secondaries: ['upper_back'] },
  'straight-arm-pulldown': { primaries: ['lats'], secondaries: ['upper_back'] },
  'b26cd556-5623-418d-8ca1-8122fe91a8c7': { primaries: ['lats'], secondaries: ['side_delts', 'upper_back'] },
  'b255de9b-fc45-4315-b222-aaa82387dff0': { primaries: ['lats'], secondaries: ['upper_back'] },
};

const after = before.map(e => remapToLatsPrimary(e) ?? e);

test('mappings: exactly the pulldown / pull-up / straight-arm / pullover rows change, to lats-only primaries', () => {
  const changed = Object.fromEntries(
    before.flatMap(e => {
      const next = remapToLatsPrimary(e);
      return next ? [[e.id, { primaries: next.primaryMuscleGroups, secondaries: next.secondaryMuscleGroups }]] : [];
    }),
  );
  expect(changed).toEqual(expectedAfter);
  expect(after.find(e => e.id === 'ae43a483-3e85-46d3-bcb2-33e014dbca97')?.primaryMuscleGroups).toEqual(['lats']);
  for (const id of ['import-seated-row', 'import-low-cable-row']) {
    expect(after.find(e => e.id === id)?.primaryMuscleGroups).toEqual(['upper_back']);
  }
  expect(LATS_PRIMARY_EXERCISE_IDS).toHaveLength(Object.keys(expectedAfter).length + 1);
});

test('mappings: the remap is idempotent', () => {
  expect(after.map(remapToLatsPrimary).filter(Boolean)).toEqual([]);
});

const W = 'w-0907';
let n = 0;
const sets = (exerciseId: string, ...loggedAt: string[]): WorkoutSet[] =>
  loggedAt.map(t => ({ id: `s${n++}`, workoutId: W, exerciseId, weight: 100, reps: 8, loggedAt: t }) as WorkoutSet);

const week0907: WorkoutSet[] = [
  ...sets('import-pullup', '2026-09-07T15:13:40Z', '2026-09-07T15:16:29Z', '2026-09-07T15:19:50Z', '2026-09-10T11:54:21Z', '2026-09-10T11:57:28Z', '2026-09-11T00:50:18Z'),
  ...sets('wide-grip-lat-pulldown', '2026-09-09T11:32:11Z', '2026-09-09T11:37:30Z', '2026-09-09T11:45:22Z'),
  ...sets('86847ace-fb9f-421b-b32b-776f27c56775', '2026-09-13T16:30:51Z', '2026-09-13T16:31:52Z', '2026-09-13T16:35:12Z'),
  // Synthetic seated-row block: rows stay upper_back.
  ...sets('import-seated-row', '2026-09-11T11:55:00Z', '2026-09-11T11:58:00Z', '2026-09-11T12:02:14Z'),
];
const workouts = [{ id: W, startedAt: '2026-09-09T11:00:00Z', isDeload: false }] as Workout[];
const settings = { ...DEFAULT_USER_SETTINGS, weekStartDay: 'monday' as const };
const volumeFor = (exercises: Exercise[]) => {
  const v = computeWeeklyVolume(week0907, workouts, exercises, settings, new Date(2026, 8, 9, 12));
  return Object.fromEntries(v.muscleGroups.map(mg => [mg.muscleGroup, mg.sets]));
};

test('week of 2026-09-07: lats recounts from 3 to 12 raw sets; pulldowns stop crediting upper_back', () => {
  const pre = volumeFor(before);
  const post = volumeFor(after);
  expect(pre.lats).toBe(3);
  expect(post.lats).toBe(12);
  expect(post.lats).toBeGreaterThanOrEqual(9);
  expect(pre.upper_back - post.upper_back).toBe(12);
  expect(post.upper_back).toBe(3); // only the seated rows
});

test('focus rows: lats is appended once and never duplicated', () => {
  const base = [{ id: 'traps', label: 'Traps', muscleGroup: 'traps' as const }];
  expect(withLatsFocusGroup(base)).toEqual([...base, LATS_FOCUS_GROUP]);
  expect(withLatsFocusGroup(withLatsFocusGroup(base))).toHaveLength(2);
});
