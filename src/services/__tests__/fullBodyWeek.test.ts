/**
 * One week of Full Body 1-6, counted the way the app counts it.
 *
 * Muscle groups come from the cloud records as they stand after the
 * 2026-10-01 migration, so this fixture fails if an exercise is remapped
 * without the program being looked at again.
 *
 * Three groups land over target, and that is a property of the program, not a
 * counting bug: the wide-grip row is mid back *and* traps, and the V-squat is
 * quads, hamstrings *and* glutes, so those sets are credited twice or three
 * times over. The assertions below record the real numbers next to the
 * targets rather than pretending they match.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  DEFAULT_USER_SETTINGS,
  WEEKLY_SET_TARGETS,
  type Exercise,
  type UserSettings,
  type Workout,
  type WorkoutSet,
} from '../../types';
import { FULL_BODY_DAYS } from '../../data/fullBodyTemplates';
import { computeWeeklyVolume } from '../analytics';

/** Primary groups as stored in the cloud on 2026-10-01; '+' means both count. */
const PRIMARIES: Record<string, string[]> = {
  'plate-loaded-incline-press': ['chest'],
  'wide-grip-lat-pulldown': ['lats'],
  'import-low-cable-row': ['mid_back'],
  '29bcb169-528c-4f61-910f-66d52c1d6fd1': ['quads'],
  'seated-leg-curl': ['hamstrings'],
  'cable-lateral-raise': ['side_delts'],
  'cable-machine-crunch': ['abs'],
  'aaedca8e-b918-43f3-b324-caab35e16cda': ['chest'],
  '86847ace-fb9f-421b-b32b-776f27c56775': ['lats'],
  'chest-supported-machine-row': ['mid_back'],
  'seated-leg-extension': ['quads'],
  '45f8c1cc-6bc7-4047-a427-5489ebaf66a3': ['glutes'],
  '22da91ef-ecfa-4cbb-b93b-2b9f7b7bf586': ['triceps'],
  '7524e1ed-a483-4f72-b337-248f8246a1cb': ['traps'],
  'pec-fly-machine': ['chest'],
  'import-pullup': ['lats'],
  'import-wide-grip-row': ['mid_back', 'traps'],
  '87d5e750-60cd-46ef-b5f2-6822a6d070a6': ['hamstrings'],
  'e4ae1797-ec53-4ddf-8473-24cc78c68267': ['biceps'],
  'face-pull': ['rear_delts'],
  'import-leg-raise': ['abs'],
  'incline-bench-press': ['chest'],
  'ae43a483-3e85-46d3-bcb2-33e014dbca97': ['lats'],
  '083c1c85-f090-4a50-a430-19393c82d080': ['mid_back'],
  'back-extension': ['lower_back'],
  '558d0521-308c-418d-9f3a-40ef807cd6a9': ['side_delts'],
  'overhead-triceps-extension-rope': ['triceps'],
  'import-cable-fly-high-low': ['chest'],
  'e1bc84b4-90e6-427e-bd1a-fdebf6b821ae': ['glutes'],
  '9279fe5b-336f-455e-8b2a-6773bea46ce7': ['traps'],
  'b5400777-ab8f-4d03-9b28-c9b393ff04bf': ['rear_delts'],
  'import-alternate-db-curl': ['biceps'],
  'calf-raise-machine': ['calves'],
  '991536ef-ea5a-47a8-9db4-d0b2f8499702': ['abs'],
  '324a7e84-0ec3-4b4e-8314-a87e3f4478e9': ['quads', 'hamstrings', 'glutes'],
  'ec3b885d-db9a-43b2-84ff-859d5d5c3455': ['glutes'],
  '39e393c6-770c-4522-9ee2-8abfd66f7627': ['front_delts'],
  '640c8b84-cec2-4116-aa15-5718034940b7': ['traps'],
  'import-tricep-dip-machine': ['triceps'],
  'import-bayesian-curls': ['biceps'],
  '33b9d9e0-aa70-4bf8-aee6-7437b95a0c92': ['lower_back'],
};

/** The only unilateral exercise in the program: each set is one leg. */
const UNILATERAL = new Set(['45f8c1cc-6bc7-4047-a427-5489ebaf66a3']);

const EXERCISES: Exercise[] = Object.entries(PRIMARIES).map(([id, groups]) => ({
  id,
  name: id,
  equipment: 'machine',
  primaryMuscleGroups: groups,
  secondaryMuscleGroups: [],
  isUnilateral: UNILATERAL.has(id),
}) as Exercise);

const settings: UserSettings = { ...DEFAULT_USER_SETTINGS, weekStartDay: 'monday', muscleGroupTargets: WEEKLY_SET_TARGETS };

/** Monday 2026-09-28 through Saturday: one full-body day each. */
function trainTheWeek(): { sets: WorkoutSet[]; workouts: Workout[] } {
  const allSets: WorkoutSet[] = [];
  const workouts: Workout[] = [];
  FULL_BODY_DAYS.forEach((day, index) => {
    const date = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'][index]!;
    const workoutId = `w${index + 1}`;
    workouts.push({ id: workoutId, startedAt: `${date}T16:00:00Z`, completedAt: `${date}T17:30:00Z`, templateId: day.template.id } as Workout);
    for (const item of day.items) {
      for (let i = 0; i < item.sets; i++) {
        allSets.push({
          id: `${workoutId}-${item.exerciseId}-${i}`,
          workoutId,
          exerciseId: item.exerciseId,
          reps: 10,
          weight: 100,
          loggedAt: `${date}T16:${String(10 + i).padStart(2, '0')}:00Z`,
        } as WorkoutSet);
      }
    }
  });
  return { sets: allSets, workouts };
}

describe('the six full-body days', () => {
  test('every exercise is a real record and nothing new is invented', () => {
    const ids = FULL_BODY_DAYS.flatMap(d => d.items.map(i => i.exerciseId));
    expect(ids.every(id => id in PRIMARIES)).toBe(true);
    expect(FULL_BODY_DAYS.map(d => d.template.name)).toEqual([
      'Full Body 1', 'Full Body 2', 'Full Body 3', 'Full Body 4', 'Full Body 5', 'Full Body 6',
    ]);
    // Five at Planet Fitness, the sixth at Vasa.
    expect(FULL_BODY_DAYS.map(d => d.template.locationId)).toEqual(['gym', 'gym', 'gym', 'gym', 'gym', 'vasa-']);
    // 3 sets each; the unilateral glute push logs 6, which is 3 per leg.
    expect(FULL_BODY_DAYS.flatMap(d => d.items).every(i => i.sets === 3 || UNILATERAL.has(i.exerciseId))).toBe(true);
  });

  test('a week of all six, counted by the app', () => {
    const { sets, workouts } = trainTheWeek();
    const volume = computeWeeklyVolume(sets, workouts, EXERCISES, settings, new Date(2026, 9, 4, 12, 0));
    const got = Object.fromEntries(volume.muscleGroups.filter(mg => mg.sets > 0).map(mg => [mg.muscleGroup, mg.sets]));

    expect(got).toEqual({
      chest: 15,
      lats: 12,
      mid_back: 12,
      rear_delts: 6,
      side_delts: 9,
      front_delts: 3,
      triceps: 9,
      biceps: 9,
      quads: 12,
      abs: 9,
      calves: 3,
      lower_back: 6,
      // Over target, by design of the program rather than by miscount:
      traps: 12, // target 9 — the wide-grip row credits traps as well as mid back
      hamstrings: 12, // target 9 — the V-squat credits hamstrings too
      glutes: 12, // target 6 — three glute movements plus the V-squat
    });
  });

  test('which groups the program does not hit on the nose', () => {
    const { sets, workouts } = trainTheWeek();
    const volume = computeWeeklyVolume(sets, workouts, EXERCISES, settings, new Date(2026, 9, 4, 12, 0));
    const off = volume.muscleGroups
      .filter(mg => mg.target > 0 && mg.sets !== mg.target)
      .map(mg => `${mg.muscleGroup} ${mg.sets} vs ${mg.target}`);
    expect(off).toEqual(['hamstrings 12 vs 9', 'glutes 12 vs 6', 'traps 12 vs 9']);
  });
});
