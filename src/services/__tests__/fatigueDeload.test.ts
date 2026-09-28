/**
 * A deload week must not read as fatigue. The volume-trend signal compares this
 * week against two weeks ago; with a deload on either side the comparison is
 * meaningless, because a deload is lighter on purpose.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { DEFAULT_USER_SETTINGS, type Exercise, type UserSettings, type Workout, type WorkoutSet } from '../../types';
import { analyzeFatigue } from '../fatigueDetection';

const settings: UserSettings = { ...DEFAULT_USER_SETTINGS, weekStartDay: 'monday', fatigueDetectionEnabled: true, isOnDeload: false };
const exercises = [{ id: 'bench', name: 'Bench Press', equipment: 'barbell', primaryMuscleGroups: ['chest'] }] as Exercise[];

const workout = (id: string, iso: string, isDeload = false): Workout =>
  ({ id, startedAt: iso, completedAt: iso, templateId: null, ...(isDeload ? { isDeload: true } : {}) }) as Workout;
const setsFor = (workoutId: string, count: number, weight: number): WorkoutSet[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${workoutId}-${i}`, workoutId, exerciseId: 'bench', reps: 10, weight, loggedAt: '' }) as WorkoutSet);

const volumeSignal = (workouts: Workout[], sets: WorkoutSet[]) =>
  analyzeFatigue(workouts, sets, exercises, settings).overallSignals.find(s => s.signalType === 'volume_drop');

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

test('a heavy week two weeks ago against a light week now still reports a volume drop', () => {
  const workouts = [workout('base', daysAgo(14)), workout('now', daysAgo(0))];
  const sets = [...setsFor('base', 20, 200), ...setsFor('now', 3, 100)];
  expect(volumeSignal(workouts, sets)).toBeTruthy();
});

test('but not when this week is the deload week', () => {
  const workouts = [workout('base', daysAgo(14)), workout('now', daysAgo(0), true)];
  const sets = [...setsFor('base', 20, 200), ...setsFor('now', 3, 100)];
  expect(volumeSignal(workouts, sets)).toBeUndefined();
});

test('and not when the baseline two weeks ago was the deload week', () => {
  const workouts = [workout('base', daysAgo(14), true), workout('now', daysAgo(0))];
  const sets = [...setsFor('base', 20, 200), ...setsFor('now', 3, 100)];
  expect(volumeSignal(workouts, sets)).toBeUndefined();
});
