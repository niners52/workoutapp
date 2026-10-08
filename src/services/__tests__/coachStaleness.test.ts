/**
 * The lateral-raise complaint, from the real sets.
 *
 * Cable Lateral Raise is logged at both gyms. Vasa's stack runs 12.75 / 16.25
 * lbs; Planet Fitness runs 10 / 12.5 / 15 / 25. The coach said "fewer reps at
 * 16.25 lbs vs 2 weeks ago" while Tyler was at Planet Fitness: 16.25 lbs is a
 * weight he can only touch at Vasa, and the sessions it compared were six and
 * seven weeks old, not two.
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

/** Tyler's actual lateral-raise history, newest first. */
const HISTORY: Session[] = [
  { day: '2026-10-05', locationId: 'gym', weight: 15, reps: [9, 9, 9, 9, 13, 13] },
  { day: '2026-09-29', locationId: 'vasa-', weight: 16.25, reps: [6, 6, 6, 6, 6, 6] },
  { day: '2026-09-25', locationId: 'vasa-', weight: 12.75, reps: [12, 12, 12, 12, 12, 12] },
  { day: '2026-09-24', locationId: 'gym', weight: 15, reps: [8, 8, 8, 8, 12, 12] },
  { day: '2026-09-17', locationId: 'gym', weight: 25, reps: [11, 12, 12, 12, 12, 12] },
  { day: '2026-09-13', locationId: 'gym', weight: 17.5, reps: [8, 8, 8, 8, 8, 8] },
  { day: '2026-08-23', locationId: 'vasa-', weight: 16.25, reps: [9, 9, 9, 9, 9, 9] },
  { day: '2026-08-15', locationId: 'vasa-', weight: 16.25, reps: [8, 8, 8, 8] },
];

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

const signalsOn = (history: Session[], now: Date) => {
  const { workouts, sets } = build(history);
  jest.setSystemTime(now);
  return analyzeFatigue(workouts, sets, [EXERCISE], settings, LOCATIONS).exerciseSignals;
};

beforeAll(() => jest.useFakeTimers({ advanceTimers: true }));
afterAll(() => jest.useRealTimers());

test('a Vasa-only weight is not reported while the last session was at Planet Fitness', () => {
  // Latest session is 2026-10-05 at PF, so the comparison runs on PF sessions
  // and nothing it says can involve a weight that only exists at Vasa.
  const signals = signalsOn(HISTORY, new Date('2026-10-06T12:00:00.000Z'));
  expect(signals.some(s => s.message.includes('16.25') || s.message.includes('Vasa'))).toBe(false);
  // The PF top set really did fall, 25 lbs on Sep 17 to 15 on Oct 5, with the
  // work down too — so it is still reported, at the gym it happened at. One
  // dismissal silences it for eight weeks if the lighter load was the plan.
  expect(signals.map(s => s.signalType)).toEqual(['strength_decline']);
  expect(signals[0]!.message).toContain('at Planet Fitness');
});

test('the same Vasa drop is not reported two weeks after the last Vasa session either', () => {
  // Drop the PF sessions that came after: now the newest session is Vasa
  // 2026-09-29, whose baseline is 2026-08-23 and 2026-08-15 — five and six
  // weeks back, and nothing has happened at Vasa since.
  const vasaOnly = HISTORY.filter(s => s.locationId === 'vasa-');
  expect(signalsOn(vasaOnly, new Date('2026-10-14T12:00:00.000Z'))).toEqual([]);
});

test('a real, current drop at one gym is reported, and says which gym', () => {
  const current: Session[] = [
    { day: '2026-10-04', locationId: 'vasa-', weight: 16.25, reps: [6, 6, 6, 6, 6, 6] },
    // A Planet Fitness session in the mix, so the gym is worth naming.
    { day: '2026-10-01', locationId: 'vasa-', weight: 16.25, reps: [6, 6, 6, 6, 6, 6] },
    { day: '2026-09-27', locationId: 'vasa-', weight: 16.25, reps: [9, 9, 9, 9, 9, 9] },
    { day: '2026-09-24', locationId: 'vasa-', weight: 16.25, reps: [9, 9, 9, 9, 9, 9] },
    { day: '2026-09-20', locationId: 'gym', weight: 15, reps: [10, 10, 10] },
  ];
  const signals = signalsOn(current, new Date('2026-10-05T12:00:00.000Z'));
  const repDrop = signals.find(s => s.signalType === 'rep_drop');
  expect(repDrop?.locationLabel).toBe('Vasa');
  expect(repDrop?.message).toBe('Cable Lateral Raise: fewer reps at 16.25 lbs at Vasa vs 10 days ago');
  expect(repDrop?.detail).toContain('9.0 → 6.0 reps at 16.25 lbs at Vasa');
});

test('one gym only: no gym name, because there is nothing to disambiguate', () => {
  const pfOnly: Session[] = [
    { day: '2026-10-04', locationId: 'gym', weight: 15, reps: [6, 6, 6, 6, 6, 6] },
    { day: '2026-10-01', locationId: 'gym', weight: 15, reps: [6, 6, 6, 6, 6, 6] },
    { day: '2026-09-27', locationId: 'gym', weight: 15, reps: [10, 10, 10, 10, 10, 10] },
    { day: '2026-09-24', locationId: 'gym', weight: 15, reps: [10, 10, 10, 10, 10, 10] },
  ];
  const repDrop = signalsOn(pfOnly, new Date('2026-10-05T12:00:00.000Z')).find(s => s.signalType === 'rep_drop');
  expect(repDrop?.locationLabel).toBeUndefined();
  expect(repDrop?.message).toBe('Cable Lateral Raise: fewer reps at 15 lbs vs 10 days ago');
});

describe('a rep-range change is not a decline', () => {
  test('load down a third with the reps up and the work holding says nothing', () => {
    const repRangeChange: Session[] = [
      { day: '2026-10-04', locationId: 'gym', weight: 15, reps: [14, 14, 14] },
      { day: '2026-10-01', locationId: 'gym', weight: 15, reps: [14, 14, 14] },
      { day: '2026-09-27', locationId: 'gym', weight: 25, reps: [6, 6, 6] },
      { day: '2026-09-24', locationId: 'gym', weight: 25, reps: [6, 6, 6] },
    ];
    expect(signalsOn(repRangeChange, new Date('2026-10-05T12:00:00.000Z'))).toEqual([]);
  });

  test('the same load drop with the reps flat is still a decline', () => {
    const realDecline: Session[] = [
      { day: '2026-10-04', locationId: 'gym', weight: 15, reps: [6, 6, 6] },
      { day: '2026-10-01', locationId: 'gym', weight: 15, reps: [6, 6, 6] },
      { day: '2026-09-27', locationId: 'gym', weight: 25, reps: [6, 6, 6] },
      { day: '2026-09-24', locationId: 'gym', weight: 25, reps: [6, 6, 6] },
    ];
    const signals = signalsOn(realDecline, new Date('2026-10-05T12:00:00.000Z'));
    expect(signals.map(s => s.signalType)).toContain('strength_decline');
  });
});
