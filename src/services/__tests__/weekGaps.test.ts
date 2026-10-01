/**
 * What is left this week, counted by muscle rather than by exercise name.
 *
 * The cases that matter: a swap inside a group owes nothing, a skipped group
 * still owes, and neither warm-ups nor deload sets may close a gap.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  DEFAULT_USER_SETTINGS,
  type Exercise,
  type UserSettings,
  type Workout,
  type WorkoutSet,
} from '../../types';
import { computeWeeklyVolume } from '../analytics';
import { weekGaps, summarizeGaps } from '../weekGaps';

const NOW = new Date(2026, 9, 1, 19, 0); // Thursday 2026-10-01, week of Mon 09-28

const settings: UserSettings = {
  ...DEFAULT_USER_SETTINGS,
  weekStartDay: 'monday',
  muscleGroupTargets: { biceps: 9, chest: 15, glutes: 6, quads: 12 },
};

const ex = (id: string, groups: string[], over: Partial<Exercise> = {}): Exercise =>
  ({
    id,
    name: id,
    equipment: 'cable',
    primaryMuscleGroups: groups,
    secondaryMuscleGroups: [],
    locationIds: ['gym'],
    ...over,
  }) as Exercise;

const EXERCISES = [
  ex('preacher-curl', ['biceps']),
  ex('hammer-curl', ['biceps']),
  ex('bayesian-curl', ['biceps'], { locationIds: ['vasa-'] }),
  ex('bench', ['chest']),
  ex('leg-press', ['quads']),
  ex('glute-push', ['glutes'], { isUnilateral: true }),
  ex('cuff-prep', ['rotator_cuff'], { defaultWarmup: true }),
];

let n = 0;
const sets = (exerciseId: string, count: number, over: Partial<WorkoutSet> = {}): WorkoutSet[] =>
  Array.from({ length: count }, () =>
    ({
      id: `s${n++}`,
      workoutId: 'w1',
      exerciseId,
      reps: 10,
      weight: 50,
      loggedAt: '2026-09-29T15:00:00Z',
      ...over,
    }) as WorkoutSet);

const WORKOUTS: Workout[] = [
  { id: 'w1', startedAt: '2026-09-29T14:00:00Z', completedAt: '2026-09-29T15:30:00Z', templateId: null } as Workout,
  { id: 'deload', startedAt: '2026-09-30T14:00:00Z', completedAt: '2026-09-30T15:30:00Z', templateId: null, isDeload: true } as Workout,
];

function gapsFor(logged: WorkoutSet[], upcoming: Array<{ dayLabel: string; exerciseIds: string[] }> = [], locationId = 'gym') {
  const volume = computeWeeklyVolume(logged, WORKOUTS, EXERCISES, settings, NOW).muscleGroups;
  return weekGaps({
    volume,
    upcoming,
    exercises: EXERCISES,
    sets: logged,
    locationId,
    weekStartDay: 'monday',
    now: NOW,
  });
}

const remainingFor = (view: ReturnType<typeof gapsFor>, group: string) =>
  view.all.find(g => g.muscleGroup === group)?.remaining;

describe('a swap inside a muscle group', () => {
  test('curling something else still closes biceps', () => {
    // The plan said preacher curl; 9 sets of hammer curl went in instead.
    const view = gapsFor(sets('hammer-curl', 9));
    expect(remainingFor(view, 'biceps')).toBeUndefined(); // off the list entirely
    expect(view.all.some(g => g.muscleGroup === 'biceps')).toBe(false);
  });

  test('skipping the group altogether leaves the gap', () => {
    const view = gapsFor(sets('bench', 15));
    expect(remainingFor(view, 'biceps')).toBe(9);
    expect(remainingFor(view, 'chest')).toBeUndefined();
  });
});

describe('counting rules carry over', () => {
  test('unilateral sets close half a gap each', () => {
    const view = gapsFor(sets('glute-push', 6)); // 3 per leg
    expect(remainingFor(view, 'glutes')).toBe(3);
  });

  test('warm-ups never reduce remaining', () => {
    const withPrep = gapsFor([...sets('bench', 3), ...sets('bench', 6, { isWarmup: true })]);
    expect(remainingFor(withPrep, 'chest')).toBe(12);
  });

  test('deload sets never reduce remaining', () => {
    const view = gapsFor([...sets('bench', 3), ...sets('bench', 9, { workoutId: 'deload', loggedAt: '2026-09-30T15:00:00Z' })]);
    expect(remainingFor(view, 'chest')).toBe(12);
  });
});

describe('coverage by the rest of the week', () => {
  const upcoming = [
    { dayLabel: 'Friday', exerciseIds: ['bench', 'leg-press'] },
    { dayLabel: 'Saturday', exerciseIds: ['bench'] },
  ];

  test('splits what the remaining days will train from what they will not', () => {
    const view = gapsFor(sets('bench', 6), upcoming);
    expect(view.covered.map(g => g.muscleGroup)).toEqual(['quads', 'chest']);
    expect(view.uncovered.map(g => g.muscleGroup)).toEqual(['biceps', 'glutes']);
    expect(view.covered.find(g => g.muscleGroup === 'chest')?.coveredBy).toEqual(['Friday', 'Saturday']);
    expect(summarizeGaps(view.uncovered)).toBe('biceps 9, glutes 6');
  });

  test('biggest gap first', () => {
    const view = gapsFor([], upcoming);
    expect(view.all.map(g => g.remaining)).toEqual([...view.all.map(g => g.remaining)].sort((a, b) => b - a));
  });
});

describe('suggestions', () => {
  test('name exercises for the group, preferring what is already planned', () => {
    const view = gapsFor([], [{ dayLabel: 'Friday', exerciseIds: ['preacher-curl'] }]);
    const biceps = view.all.find(g => g.muscleGroup === 'biceps')!;
    expect(biceps.suggestions[0]?.exerciseId).toBe('preacher-curl');
  });

  test('an exercise at another gym ranks below one here, and never above a used one', () => {
    const view = gapsFor(sets('hammer-curl', 3));
    const biceps = view.all.find(g => g.muscleGroup === 'biceps')!;
    expect(biceps.suggestions.map(s => s.exerciseId)).toEqual(['hammer-curl', 'preacher-curl']);
  });

  test('a prep movement is never suggested', () => {
    const view = gapsFor([]);
    expect(view.all.flatMap(g => g.suggestions.map(s => s.exerciseId))).not.toContain('cuff-prep');
  });
});

describe('pace', () => {
  test('Thursday with none of the week done is behind; on target is on pace', () => {
    const behind = gapsFor([]).all.find(g => g.muscleGroup === 'chest')!;
    expect(behind.pace).toBe('behind');
    expect(behind.remaining).toBe(15); // the raw number, not scaled to the day

    const onPace = gapsFor(sets('bench', 12)).all.find(g => g.muscleGroup === 'chest');
    expect(onPace?.pace).toBe('on'); // 12 of 15 by day 4 of 7
  });

  test('a deload week is never behind', () => {
    const volume = computeWeeklyVolume([], WORKOUTS, EXERCISES, settings, NOW).muscleGroups;
    const view = weekGaps({ volume, upcoming: [], exercises: EXERCISES, sets: [], weekStartDay: 'monday', now: NOW, deload: true });
    expect(view.all.every(g => g.pace === 'on')).toBe(true);
  });
});

describe('focus groups', () => {
  test('stay on the list and at the top even with no gap left', () => {
    const view = weekGaps({
      volume: computeWeeklyVolume(sets('bench', 15), WORKOUTS, EXERCISES, settings, NOW).muscleGroups,
      upcoming: [],
      exercises: EXERCISES,
      sets: [],
      focusMuscleGroups: ['chest'],
      weekStartDay: 'monday',
      now: NOW,
    });
    expect(view.all[0]?.muscleGroup).toBe('chest');
    expect(view.all[0]?.remaining).toBe(0);
    // A closed gap is not something to do tonight.
    expect(view.uncovered.some(g => g.muscleGroup === 'chest')).toBe(false);
  });
});
