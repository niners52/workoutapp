/**
 * Target sets per workout, including the deload drop (3 -> 2, doubled for
 * unilateral). Deload only ever lowers the number.
 */
import type { Exercise, UserSettings } from '../../types';
import { targetSetsFor } from '../targetSets';

const settings = { defaultTargetSets: 3, deloadTargetSets: 2 } as UserSettings;
const ex = (over: Partial<Exercise> = {}): Exercise => ({ id: 'e', name: 'Exercise', ...over }) as Exercise;

test('normal workout: the global default, doubled for unilateral', () => {
  expect(targetSetsFor({ exercise: ex(), settings })).toBe(3);
  expect(targetSetsFor({ exercise: ex({ isUnilateral: true }), settings })).toBe(6);
});

test('normal workout: a saved target and a per-workout override both win', () => {
  expect(targetSetsFor({ exercise: ex({ targetSets: 5 }), settings })).toBe(5);
  expect(targetSetsFor({ exercise: ex({ targetSets: 5 }), override: 4, settings })).toBe(4);
});

test('deload workout: 3 becomes 2, and a unilateral 6 becomes 4', () => {
  expect(targetSetsFor({ exercise: ex(), settings, isDeloadWorkout: true })).toBe(2);
  expect(targetSetsFor({ exercise: ex({ isUnilateral: true }), settings, isDeloadWorkout: true })).toBe(4);
});

test('deload never raises a target', () => {
  // An exercise already aiming for 1 set stays at 1, not 2.
  expect(targetSetsFor({ exercise: ex({ targetSets: 1 }), settings, isDeloadWorkout: true })).toBe(1);
  // A saved 5 comes down to the deload number.
  expect(targetSetsFor({ exercise: ex({ targetSets: 5 }), settings, isDeloadWorkout: true })).toBe(2);
});

test('deload respects a per-workout override, because that is the user choosing now', () => {
  expect(targetSetsFor({ exercise: ex(), override: 4, settings, isDeloadWorkout: true })).toBe(4);
});

test('the deload number is configurable, and falls back to the default when unset', () => {
  expect(targetSetsFor({ exercise: ex(), settings: { ...settings, deloadTargetSets: 1 }, isDeloadWorkout: true })).toBe(1);
  const noDeloadSetting = { defaultTargetSets: 4 } as UserSettings;
  expect(targetSetsFor({ exercise: ex(), settings: noDeloadSetting, isDeloadWorkout: true })).toBe(2);
});

test('missing settings fall back to the app defaults', () => {
  expect(targetSetsFor({ exercise: ex() })).toBe(3);
  expect(targetSetsFor({ exercise: ex(), isDeloadWorkout: true })).toBe(2);
  expect(targetSetsFor({})).toBe(3);
});
