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
