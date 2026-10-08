/**
 * The week's change log: what got swapped, and what the plan asked for that
 * did not happen.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import type { Exercise, ExerciseSwap, Template, Workout, WorkoutSet } from '../../types';
import { routineChanges } from '../routineChanges';

// Week of Mon 2026-09-28; "now" is Thursday evening.
const now = new Date(2026, 9, 1, 19, 0);
const at = (day: number, hour = 11) => new Date(2026, 8, day, hour).toISOString();

const ex = (id: string, name: string): Exercise => ({ id, name, equipment: 'cable' }) as Exercise;
const exercises = [
  ex('preacher-curl', 'Machine Preacher Curl'),
  ex('hammer-curl', 'Dumbbell Hammer Curl'),
  ex('face-pull', 'Cable Face Pull'),
  ex('leg-press', 'Machine Leg press'),
];
const templates: Template[] = [
  { id: 'fb3', name: 'Full Body 3', type: 'full_body', locationId: 'gym', exerciseIds: ['face-pull', 'preacher-curl'] },
];
const workout = (id: string, iso: string, skipped: string[] = [], templateId: string | null = 'fb3'): Workout =>
  ({ id, startedAt: iso, completedAt: iso, templateId, ...(skipped.length ? { skippedExerciseIds: skipped } : {}) }) as Workout;
const swap = (id: string, workoutId: string, from: string, to: string, iso: string): ExerciseSwap =>
  ({ id, workoutId, originalExerciseId: from, currentExerciseId: to, swappedAt: iso });
const set = (id: string, exerciseId: string, workoutId: string, iso: string): WorkoutSet =>
  ({ id, workoutId, exerciseId, reps: 10, weight: 50, loggedAt: iso }) as WorkoutSet;

const run = (args: Partial<Parameters<typeof routineChanges>[0]> = {}) =>
  routineChanges({
    workouts: [],
    sets: [],
    exercises,
    swaps: [],
    templates,
    weekStartDay: 'monday',
    now,
    ...args,
  });

test('a swap reads as one thing replacing another, with the day and the session', () => {
  const changes = run({
    workouts: [workout('w1', at(29))],
    swaps: [swap('s1', 'w1', 'preacher-curl', 'hammer-curl', at(29))],
  });
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({
    kind: 'swap',
    exerciseName: 'Machine Preacher Curl',
    replacementName: 'Dumbbell Hammer Curl',
    dayLabel: 'Tuesday',
    templateName: 'Full Body 3',
  });
});

test('an exercise the session recorded as skipped reads as not done', () => {
  const changes = run({ workouts: [workout('w1', at(29), ['face-pull'])] });
  expect(changes).toMatchObject([{ kind: 'missed', exerciseName: 'Cable Face Pull', dayLabel: 'Tuesday' }]);
});

test('skipped in the morning but done at night is not a change at all', () => {
  const changes = run({
    workouts: [workout('w1', at(29), ['face-pull']), workout('w2', at(29, 20), [], null)],
    sets: [set('x1', 'face-pull', 'w2', at(29, 20))],
  });
  expect(changes).toEqual([]);
});

test('an exercise swapped out is reported once, as a swap', () => {
  const changes = run({
    workouts: [workout('w1', at(29), ['preacher-curl'])],
    swaps: [swap('s1', 'w1', 'preacher-curl', 'hammer-curl', at(29))],
  });
  expect(changes.map(c => c.kind)).toEqual(['swap']);
});

test('last week stays out of this week, and newest comes first', () => {
  const changes = run({
    workouts: [workout('w0', at(24), ['leg-press']), workout('w1', at(29), ['face-pull']), workout('w2', at(30), ['leg-press'])],
  });
  expect(changes.map(c => [c.exerciseName, c.dayLabel])).toEqual([
    ['Machine Leg press', 'Wednesday'],
    ['Cable Face Pull', 'Tuesday'],
  ]);
});

test('a swap chain that ends where it started is not a change', () => {
  const changes = run({
    workouts: [workout('w1', at(29))],
    swaps: [swap('s1', 'w1', 'preacher-curl', 'preacher-curl', at(29))],
  });
  expect(changes).toEqual([]);
});

describe('a scheduled day that never ran', () => {
  // The week of 2026-10-05 as it happened. Mon FB1 and Tue FB2 ran at Planet
  // Fitness, Tue night was an untemplated Vasa session, Wednesday's FB3 was
  // replaced by a home workout, and a 0-set home start was abandoned Thursday.
  const thursday = new Date(2026, 9, 8, 16, 0);
  const d = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();
  const fb = (n: number): Template => ({
    id: `fb${n}`,
    name: `Full Body ${n}`,
    type: 'full_body',
    locationId: n === 6 ? 'vasa-' : 'gym',
    exerciseIds: [`fb${n}-a`],
  });
  const routine = {
    id: 'r',
    name: 'Back focus 6 days',
    isActive: true,
    daySchedule: [
      { day: 0, templateIds: [] },
      ...[1, 2, 3, 4, 5, 6].map(n => ({ day: n, templateIds: [`fb${n}`] })),
    ],
  };
  const locations = [
    { id: 'gym', name: 'Planet Fitness', sortOrder: 0 },
    { id: 'home', name: 'Home', sortOrder: 1 },
    { id: 'vasa-', name: 'Vasa', sortOrder: 2 },
  ];
  const w = (id: string, iso: string, templateId: string | null, locationId: string): Workout =>
    ({ id, startedAt: iso, completedAt: iso, templateId, locationId }) as Workout;
  const workouts = [
    w('mon', d(5, 6), 'fb1', 'gym'),
    w('tue', d(6, 6), 'fb2', 'gym'),
    w('tue-night', d(6, 19), null, 'vasa-'),
    w('wed', d(7, 7), null, 'home'),
    w('thu-empty', d(8, 15), null, 'home'),
  ];
  const sets = [
    ...Array.from({ length: 21 }, (_, i) => set(`m${i}`, 'fb1-a', 'mon', d(5, 6))),
    ...Array.from({ length: 27 }, (_, i) => set(`t${i}`, 'fb2-a', 'tue', d(6, 6))),
    ...Array.from({ length: 21 }, (_, i) => set(`n${i}`, 'x', 'tue-night', d(6, 19))),
    ...Array.from({ length: 12 }, (_, i) => set(`h${i}`, 'y', 'wed', d(7, 7))),
  ];

  const changes = routineChanges({
    workouts,
    sets,
    exercises,
    swaps: [],
    templates: [1, 2, 3, 4, 5, 6].map(fb),
    weekStartDay: 'monday',
    now: thursday,
    routine,
    locations,
  });

  test('Wednesday reads as Full Body 3 not done, with what happened instead', () => {
    expect(changes.filter(c => c.kind === 'skippedDay')).toMatchObject([
      {
        kind: 'skippedDay',
        exerciseName: 'Full Body 3',
        dayLabel: 'Wednesday',
        instead: { locationName: 'Home', sets: 12 },
      },
    ]);
  });

  test('days that ran are not reported, and neither is today', () => {
    // Thursday's Full Body 4 is still to come tonight: no verdict yet.
    expect(changes.map(c => c.exerciseName)).not.toContain('Full Body 1');
    expect(changes.map(c => c.exerciseName)).not.toContain('Full Body 2');
    expect(changes.map(c => c.exerciseName)).not.toContain('Full Body 4');
  });

  test('a template run on a different day is a move, not a miss', () => {
    const moved = routineChanges({
      workouts: [...workouts, w('thu-fb3', d(8, 6), 'fb3', 'gym')],
      sets,
      exercises,
      swaps: [],
      templates: [1, 2, 3, 4, 5, 6].map(fb),
      weekStartDay: 'monday',
      now: thursday,
      routine,
      locations,
    });
    expect(moved.filter(c => c.kind === 'skippedDay')).toEqual([]);
  });

  test('a day with nothing logged says only that it did not happen', () => {
    const quiet = routineChanges({
      workouts: workouts.filter(x => x.id !== 'wed'),
      sets,
      exercises,
      swaps: [],
      templates: [1, 2, 3, 4, 5, 6].map(fb),
      weekStartDay: 'monday',
      now: thursday,
      routine,
      locations,
    });
    const wed = quiet.find(c => c.kind === 'skippedDay');
    expect(wed?.instead).toBeUndefined();
  });
});
