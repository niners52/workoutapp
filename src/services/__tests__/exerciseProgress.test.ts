/**
 * "All the coach does is say I did less weight or reps." The session
 * comparisons that report a drop now report a gain too, on the same gym and
 * the same staleness bounds.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { DEFAULT_USER_SETTINGS, type Exercise, type UserSettings, type Workout, type WorkoutLocation, type WorkoutSet } from '../../types';
import { analyzeFatigue } from '../fatigueDetection';

const LOCATIONS: WorkoutLocation[] = [
  { id: 'gym', name: 'Planet Fitness', sortOrder: 0 },
  { id: 'vasa-', name: 'Vasa', sortOrder: 1 },
];

const EXERCISE: Exercise = {
  id: 'cable-lateral-raise',
  name: 'Cable Lateral Raise',
  equipment: 'cable',
  primaryMuscleGroups: ['side_delts'],
  secondaryMuscleGroups: [],
  locationIds: ['gym', 'vasa-'],
} as Exercise;

const settings: UserSettings = { ...DEFAULT_USER_SETTINGS, fatigueSensitivity: 10 };

interface Session {
  day: string; // YYYY-MM-DD
  locationId: string;
  weight: number;
  reps: number[];
}

function build(history: Session[]): { workouts: Workout[]; sets: WorkoutSet[] } {
  const workouts: Workout[] = [];
  const sets: WorkoutSet[] = [];
  history.forEach((session, i) => {
    const id = `w${i}`;
    workouts.push({
      id,
      startedAt: `${session.day}T16:00:00.000Z`,
      completedAt: `${session.day}T17:00:00.000Z`,
      templateId: null,
      locationId: session.locationId,
    } as Workout);
    session.reps.forEach((reps, j) => {
      sets.push({
        id: `${id}-${j}`,
        workoutId: id,
        exerciseId: EXERCISE.id,
        reps,
        weight: session.weight,
        loggedAt: `${session.day}T16:${String(10 + j).padStart(2, '0')}:00.000Z`,
      } as WorkoutSet);
    });
  });
  return { workouts, sets };
}

const analyzeOn = (history: Session[], now: Date) => {
  const { workouts, sets } = build(history);
  jest.setSystemTime(now);
  return analyzeFatigue(workouts, sets, [EXERCISE], settings, LOCATIONS);
};

beforeAll(() => jest.useFakeTimers({ advanceTimers: true }));
afterAll(() => jest.useRealTimers());

const NOW = new Date('2026-10-05T12:00:00.000Z');

test('a heavier top set is called out as a win', () => {
  const analysis = analyzeOn([
    { day: '2026-10-04', locationId: 'gym', weight: 17.5, reps: [10, 10, 10] },
    { day: '2026-10-01', locationId: 'gym', weight: 17.5, reps: [9, 9, 9] },
    { day: '2026-09-27', locationId: 'gym', weight: 15, reps: [10, 10, 10] },
    { day: '2026-09-24', locationId: 'gym', weight: 15, reps: [10, 10, 10] },
  ], NOW);
  expect(analysis.exerciseSignals).toEqual([]);
  expect(analysis.progressSignals.map(s => s.signalType)).toEqual(['strength_gain']);
  expect(analysis.progressSignals[0]!.tone).toBe('progress');
  expect(analysis.progressSignals[0]!.message).toBe('Cable Lateral Raise up 17% vs 10 days ago');
});

test('more reps at the same weight is a win', () => {
  const analysis = analyzeOn([
    { day: '2026-10-04', locationId: 'gym', weight: 15, reps: [12, 12, 12] },
    { day: '2026-10-01', locationId: 'gym', weight: 15, reps: [11, 11, 11] },
    { day: '2026-09-27', locationId: 'gym', weight: 15, reps: [10, 10, 10] },
    { day: '2026-09-24', locationId: 'gym', weight: 15, reps: [10, 10, 10] },
  ], NOW);
  expect(analysis.progressSignals.map(s => s.message)).toEqual([
    'Cable Lateral Raise: more reps at 15 lbs vs 10 days ago',
  ]);
});

test('a lighter top set with more reps is not called progress', () => {
  const analysis = analyzeOn([
    { day: '2026-10-04', locationId: 'gym', weight: 15, reps: [14, 14, 14] },
    { day: '2026-10-01', locationId: 'gym', weight: 15, reps: [14, 14, 14] },
    { day: '2026-09-27', locationId: 'gym', weight: 25, reps: [6, 6, 6] },
    { day: '2026-09-24', locationId: 'gym', weight: 25, reps: [6, 6, 6] },
  ], NOW);
  expect(analysis.progressSignals).toEqual([]);
});

test('a gain from sessions weeks ago is not news', () => {
  const analysis = analyzeOn([
    { day: '2026-09-04', locationId: 'gym', weight: 17.5, reps: [10, 10, 10] },
    { day: '2026-09-01', locationId: 'gym', weight: 17.5, reps: [10, 10, 10] },
    { day: '2026-08-27', locationId: 'gym', weight: 15, reps: [10, 10, 10] },
    { day: '2026-08-24', locationId: 'gym', weight: 15, reps: [10, 10, 10] },
  ], NOW);
  expect(analysis.progressSignals).toEqual([]);
});
