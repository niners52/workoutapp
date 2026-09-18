/**
 * Wide / narrow cable fly: separate exercises (different loads, separate
 * history), linked so switching is not a swap and either one satisfies the
 * weekly catch-up list.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import type { Exercise, ExerciseSwap, Workout, WorkoutSet } from '../../types';
import { VARIANT_GROUPS, variantFamily, variantGroupFor } from '../exerciseVariants';
import { getMissedExercisesThisWeek } from '../missedExercises';
import { getWeekSwapConflicts } from '../swapConflicts';

const WIDE = 'import-cable-fly-high-low';
const NARROW = 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b';
const CURL = 'cable-curl';

const ex = (id: string, name: string): Exercise =>
  ({ id, name, primaryMuscleGroup: 'chest', primaryMuscleGroups: ['chest'], secondaryMuscleGroups: [], equipment: 'cable' }) as Exercise;
const exercises = [ex(WIDE, 'Cable wide Fly High to Low'), ex(NARROW, 'Cable Fly high to low narrow'), ex(CURL, 'Cable Curl')];

test('the Planet Fitness cable fly is one group with a Wide and a Narrow variant', () => {
  expect(variantGroupFor(WIDE)?.variants.map(v => v.label)).toEqual(['Wide', 'Narrow']);
  expect(variantGroupFor(NARROW)).toBe(variantGroupFor(WIDE));
  expect(variantFamily(NARROW)).toEqual([WIDE, NARROW]);
  expect(variantGroupFor(CURL)).toBeNull();
  expect(variantFamily(CURL)).toEqual([CURL]);
  expect(VARIANT_GROUPS).toHaveLength(1);
});

// Monday Sep 14 2026 week; now is Thursday.
const now = new Date(2026, 8, 17, 12, 0);
const mon: Workout = { id: 'w-mon', startedAt: '2026-09-14T11:00:00Z', completedAt: '2026-09-14T12:00:00Z', templateId: null, skippedExerciseIds: [WIDE] } as Workout;
const wed: Workout = { id: 'w-wed', startedAt: '2026-09-16T11:00:00Z', completedAt: '2026-09-16T12:00:00Z', templateId: null } as Workout;
const set = (exerciseId: string, workoutId: string, loggedAt: string): WorkoutSet =>
  ({ id: `${exerciseId}-${loggedAt}`, workoutId, exerciseId, weight: 10, reps: 12, loggedAt }) as WorkoutSet;

test('catch-up: wide skipped Monday is cleared by narrow on Wednesday', () => {
  jest.useFakeTimers().setSystemTime(now);
  const missed = getMissedExercisesThisWeek([mon, wed], [set(NARROW, 'w-wed', '2026-09-16T11:20:00Z')], [], exercises, 'monday');
  expect(missed.map(m => m.exercise.id)).toEqual([]);
  jest.useRealTimers();
});

test('catch-up: an unrelated skip is still reported', () => {
  jest.useFakeTimers().setSystemTime(now);
  const monCurl = { ...mon, skippedExerciseIds: [CURL] };
  const missed = getMissedExercisesThisWeek([monCurl, wed], [set(NARROW, 'w-wed', '2026-09-16T11:20:00Z')], [], exercises, 'monday');
  expect(missed.map(m => m.exercise.id)).toEqual([CURL]);
  jest.useRealTimers();
});

test('swap banner: an old wide→narrow swap record is not flagged as a conflict', () => {
  const swaps: ExerciseSwap[] = [
    { id: 's1', workoutId: 'w-mon', originalExerciseId: WIDE, currentExerciseId: NARROW, swappedAt: '2026-09-14T11:15:00Z' },
    { id: 's2', workoutId: 'w-mon', originalExerciseId: CURL, currentExerciseId: 'hammer-curl', swappedAt: '2026-09-14T11:30:00Z' },
  ];
  const conflicts = getWeekSwapConflicts([WIDE, NARROW, CURL], {
    exerciseSwaps: swaps,
    exercises,
    weekStartDay: 'monday',
    currentWorkoutId: 'w-thu',
    now,
  });
  expect([...conflicts.keys()]).toEqual([CURL]);
});
