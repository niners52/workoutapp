/**
 * Regression fixture for the V19 volume rules, built from the week of
 * 2026-09-07 as it stands in the cloud:
 *   - 40 rotator-cuff prep sets that used to count as training volume
 *   - 12 sets on the old upper_back group, which split 6 rear delts / 6 rows
 *   - working total 153 across the revised targets (193 with the prep sets)
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
import { computeWeeklyVolume } from '../analytics';
import { canonicalMuscleGroup, creditedPrimaries } from '../muscleGroups';
import { isWarmupSet } from '../warmupSets';
import { splitUpperBack } from '../upperBackSplit';

const settings: UserSettings = { ...DEFAULT_USER_SETTINGS, weekStartDay: 'monday', muscleGroupTargets: WEEKLY_SET_TARGETS };

const ex = (id: string, groups: string[], over: Partial<Exercise> = {}): Exercise =>
  ({ id, name: id, equipment: 'cable', primaryMuscleGroups: groups, secondaryMuscleGroups: [], ...over }) as Exercise;

let n = 0;
const sets = (exerciseId: string, count: number, over: Partial<WorkoutSet> = {}): WorkoutSet[] =>
  Array.from({ length: count }, () =>
    ({ id: `s${n++}`, workoutId: 'w1', exerciseId, reps: 10, weight: 50, loggedAt: '2026-09-09T11:00:00Z', ...over }) as WorkoutSet);

const week = new Date(2026, 8, 9); // Wednesday of the week of Mon 2026-09-07
const workouts = [{ id: 'w1', startedAt: '2026-09-09T11:00:00Z', completedAt: '2026-09-09T12:00:00Z', templateId: null } as Workout];

describe('targets', () => {
  // Revised again on 2026-10-01 with the full-body program: traps 9, abs 9,
  // calves 3, adductors 0.
  test('15 targeted groups totalling 129 sets, and rotator cuff is no longer one of them', () => {
    const targeted = Object.entries(WEEKLY_SET_TARGETS).filter(([, v]) => v > 0);
    expect(targeted).toHaveLength(15);
    expect(targeted.reduce((sum, [, v]) => sum + v, 0)).toBe(129);
    expect(WEEKLY_SET_TARGETS.rotator_cuff).toBe(0);
    expect(WEEKLY_SET_TARGETS.mid_back).toBe(12);
    expect(WEEKLY_SET_TARGETS.rear_delts).toBe(6);
  });
});

describe('warm-up sets', () => {
  const cuff = ex('cuff', ['rotator_cuff'], { defaultWarmup: true });
  const press = ex('press', ['chest']);

  test('a prep exercise logs as warm-up, and warm-ups leave weekly volume but are reported', () => {
    const all = [...sets('cuff', 40), ...sets('press', 12)];
    const v = computeWeeklyVolume(all, workouts, [cuff, press], settings, week);
    expect(v.muscleGroups.find(m => m.muscleGroup === 'rotator_cuff')?.sets).toBe(0);
    expect(v.muscleGroups.find(m => m.muscleGroup === 'chest')?.sets).toBe(12);
    expect(v.warmupSets).toBe(40);
  });

  test('the flag on a set wins over the exercise default, both ways', () => {
    expect(isWarmupSet({ isWarmup: false }, cuff)).toBe(false);
    expect(isWarmupSet({ isWarmup: true }, press)).toBe(true);
    expect(isWarmupSet({}, cuff)).toBe(true);
    expect(isWarmupSet({}, press)).toBe(false);

    const all = [...sets('cuff', 3), ...sets('cuff', 2, { isWarmup: false })];
    const v = computeWeeklyVolume(all, workouts, [cuff, press], settings, week);
    expect(v.muscleGroups.find(m => m.muscleGroup === 'rotator_cuff')?.sets).toBe(2);
    expect(v.warmupSets).toBe(3);
  });
});

describe('upper_back split', () => {
  test('rows become mid_back, rear-delt work becomes rear_delts', () => {
    expect(splitUpperBack(ex('import-seated-row', ['upper_back']))?.primaryMuscleGroups).toEqual(['mid_back']);
    expect(splitUpperBack(ex('face-pull', ['upper_back'], { secondaryMuscleGroups: ['upper_back'] }))).toMatchObject({
      primaryMuscleGroups: ['rear_delts'],
      secondaryMuscleGroups: [], // the duplicate of the primary goes
    });
    expect(splitUpperBack(ex('import-y-raise', ['upper_back']))?.primaryMuscleGroups).toEqual(['rear_delts']);
  });

  test('a stray second group is dropped, not renamed: a shrug is traps, a pulldown is lats', () => {
    expect(splitUpperBack(ex('e7e07ae2-6022-41ce-a33a-2cf29d92a8f8', ['traps', 'upper_back']))?.primaryMuscleGroups).toEqual(['traps']);
    expect(splitUpperBack(ex('3d73048e-fe49-448d-b81a-76fd7d54ff32', ['lats', 'upper_back']))?.primaryMuscleGroups).toEqual(['lats']);
  });

  test('an unlisted exercise still on upper_back reads as a row', () => {
    expect(splitUpperBack(ex('some-new-row', ['upper_back']))?.primaryMuscleGroups).toEqual(['mid_back']);
    expect(canonicalMuscleGroup('upper_back')).toBe('mid_back');
    expect(creditedPrimaries(['upper_back', 'mid_back', 'miscellaneous'])).toEqual(['mid_back']);
  });

  test('the rotator-cuff prep exercise picks up the warm-up default, and nothing else changes', () => {
    expect(splitUpperBack(ex('bcc9b2b0-0309-4b44-84d7-49de58ab8064', ['rotator_cuff']))).toMatchObject({ defaultWarmup: true });
    expect(splitUpperBack(ex('cable-curl', ['biceps']))).toBeNull();
  });

  test('the old 12 upper_back sets land as 6 rear delts and 6 rows', () => {
    const exercises = [
      splitUpperBack(ex('face-pull', ['upper_back']))!,
      splitUpperBack(ex('import-seated-row', ['upper_back']))!,
    ];
    const all = [...sets('face-pull', 6), ...sets('import-seated-row', 6)];
    const v = computeWeeklyVolume(all, workouts, exercises, settings, week);
    expect(v.muscleGroups.find(m => m.muscleGroup === 'rear_delts')?.sets).toBe(6);
    expect(v.muscleGroups.find(m => m.muscleGroup === 'mid_back')?.sets).toBe(6);
    expect(v.muscleGroups.find(m => m.muscleGroup === 'lats')?.sets).toBe(0);
  });
});
