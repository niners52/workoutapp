/**
 * The strength card, dialled in.
 *
 * It was offering "Barbell Deadlift — Beginner, 1 lb to Novice" on a lift
 * Tyler last pulled in June 2025, and bench dips he stopped doing in
 * September 2025. Two causes: no recency gate at all, and a sort on
 * closeness-to-next-level that promoted whatever happened to sit a pound under
 * a threshold — always something at the bottom of the scale.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import type { Exercise, Workout, WorkoutSet } from '../../types';
import { calculateAllMuscleStrengthLevels } from '../strengthStandards';
import { strengthHighlights } from '../strengthProgress';

const BODY_WEIGHT = 190;
const NOW = new Date('2026-10-06T12:00:00.000Z');

const ex = (id: string, name: string, equipment: Exercise['equipment'], groups: string[]): Exercise =>
  ({ id, name, equipment, primaryMuscleGroups: groups, secondaryMuscleGroups: [] }) as Exercise;

const EXERCISES = [
  ex('import-deadlift', 'Barbell Deadlift', 'barbell', ['hamstrings']),
  ex('bench-dips', 'Bodyweight Bench Dips', 'bodyweight', ['triceps']),
  ex('import-tricep-dip-machine', 'Bodyweight Tricep Dip', 'bodyweight', ['triceps']),
];

interface Entry { exerciseId: string; day: string; weight: number; reps: number }

function build(entries: Entry[]): { workouts: Workout[]; sets: WorkoutSet[] } {
  const workouts: Workout[] = [];
  const sets: WorkoutSet[] = [];
  entries.forEach((e, i) => {
    const id = `w${i}`;
    workouts.push({ id, startedAt: `${e.day}T16:00:00.000Z`, completedAt: `${e.day}T17:00:00.000Z`, templateId: null } as Workout);
    sets.push({ id: `s${i}`, workoutId: id, exerciseId: e.exerciseId, weight: e.weight, reps: e.reps, loggedAt: `${e.day}T16:10:00.000Z` } as WorkoutSet);
  });
  return { workouts, sets };
}

// Tyler's real shape: two abandoned lifts, one current.
const ENTRIES: Entry[] = [
  { exerciseId: 'import-deadlift', day: '2025-06-03', weight: 175, reps: 5 },
  { exerciseId: 'bench-dips', day: '2025-09-26', weight: 0, reps: 12 },
  { exerciseId: 'import-tricep-dip-machine', day: '2026-10-02', weight: 75, reps: 8 },
];

const uniqueNames = (m: Map<unknown, { bestExercise?: { exerciseName: string } | null }>) =>
  [...new Set([...m.values()].map(r => r.bestExercise?.exerciseName))].sort();

const levels = (activeSince?: Date) => {
  const { workouts, sets } = build(ENTRIES);
  return calculateAllMuscleStrengthLevels(EXERCISES, sets, workouts, BODY_WEIGHT, activeSince ? { activeSince } : undefined);
};

test('without a recency gate, lifts from last year still rank', () => {
  // The deadlift has not been pulled since June 2025 and still shows up as
  // hamstring standing; bench dips are there too, beaten only by the dip
  // variation Tyler does do.
  expect(uniqueNames(levels())).toEqual(['Barbell Deadlift', 'Bodyweight Tricep Dip']);
});

test('a twelve-week gate leaves only the lifts still in the rotation', () => {
  const activeSince = new Date('2026-07-14T00:00:00.000Z');
  expect(uniqueNames(levels(activeSince))).toEqual(['Bodyweight Tricep Dip']);
});

test('a one-pound gap reads as being on the edge, not as a target', () => {
  const [highlight] = strengthHighlights(
    new Map([
      [
        'hamstrings' as const,
        {
          level: 'beginner' as const,
          bestExercise: {
            exerciseId: 'import-deadlift',
            exerciseName: 'Barbell Deadlift',
            standardId: 'deadlift',
            e1rmLbs: 204,
            ratio: 1.07,
            level: 'beginner' as const,
            percentToNext: 99,
            nextLevelE1rm: 204.6,
          },
          allExercises: [],
        },
      ],
    ]),
  );
  expect(highlight!.poundsToNext).toBe(1);
  expect(highlight!.atThreshold).toBe(true);
});

test('the strongest lift leads, not whichever one sits a pound under a threshold', () => {
  const row = (name: string, level: 'beginner' | 'advanced', e1rm: number, next: number) => ({
    level,
    bestExercise: { exerciseId: name, exerciseName: name, standardId: name, e1rmLbs: e1rm, ratio: 1, level, percentToNext: 50, nextLevelE1rm: next },
    allExercises: [],
  });
  const highlights = strengthHighlights(
    new Map<any, any>([
      ['hamstrings', row('Barbell Deadlift', 'beginner', 204, 205)], // 1 lb to novice
      ['triceps', row('Bodyweight Tricep Dip', 'advanced', 230, 260)], // 30 lbs to elite
    ]),
  );
  expect(highlights.map(h => h.exerciseName)).toEqual(['Bodyweight Tricep Dip', 'Barbell Deadlift']);
});

test('a level-up still outranks everything', () => {
  const current = new Map<any, any>([
    [
      'chest',
      {
        level: 'advanced',
        bestExercise: { exerciseId: 'a', exerciseName: 'Incline Press', standardId: 'a', e1rmLbs: 230, ratio: 1, level: 'advanced', percentToNext: 10, nextLevelE1rm: 300 },
        allExercises: [],
      },
    ],
    [
      'triceps',
      {
        level: 'elite',
        bestExercise: { exerciseId: 'b', exerciseName: 'Dip', standardId: 'b', e1rmLbs: 300, ratio: 2, level: 'elite', percentToNext: 100, nextLevelE1rm: null },
        allExercises: [],
      },
    ],
  ]);
  const start = new Map<any, any>([
    ['chest', { level: 'intermediate', bestExercise: { ...current.get('chest').bestExercise, level: 'intermediate' }, allExercises: [] }],
  ]);
  expect(strengthHighlights(current, start).map(h => [h.exerciseName, h.previousLevelLabel])).toEqual([
    ['Incline Press', 'Intermediate'],
    ['Dip', null],
  ]);
});

void NOW;
