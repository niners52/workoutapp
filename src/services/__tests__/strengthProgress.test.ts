/**
 * Strength standards on the homepage: what just went up a level, and how many
 * pounds the next one costs.
 */
import type { PrimaryMuscleGroup } from '../../types';
import { strengthHighlights } from '../strengthProgress';
import type { MuscleStrengthResult, StrengthLevel } from '../strengthStandards';

const result = (
  exerciseName: string,
  level: StrengthLevel,
  e1rmLbs: number,
  nextLevelE1rm: number | null,
): MuscleStrengthResult => ({
  level,
  bestExercise: {
    exerciseId: exerciseName,
    exerciseName,
    standardId: 'x',
    e1rmLbs,
    ratio: 1,
    level,
    percentToNext: 50,
    nextLevelE1rm,
  },
  allExercises: [],
});

const levels = (entries: Array<[string, MuscleStrengthResult]>) =>
  new Map(entries as Array<[PrimaryMuscleGroup, MuscleStrengthResult]>);

test('reports the level and the pounds to the next one', () => {
  const now = levels([['chest', result('Bench Press', 'intermediate', 188, 200)]]);
  expect(strengthHighlights(now)).toEqual([
    {
      exerciseName: 'Bench Press',
      level: 'intermediate',
      levelLabel: 'Intermediate',
      nextLevelLabel: 'Advanced',
      poundsToNext: 12,
      previousLevelLabel: null,
    },
  ]);
});

test('a lift that went up a level since the early snapshot is called out and sorted first', () => {
  const now = levels([
    ['chest', result('Bench Press', 'intermediate', 199, 200)], // 1 lb away
    ['quads', result('Squat', 'advanced', 300, 400)],           // 100 lb away, but newly advanced
  ]);
  const start = levels([
    ['chest', result('Bench Press', 'intermediate', 150, 200)],
    ['quads', result('Squat', 'intermediate', 250, 300)],
  ]);
  const out = strengthHighlights(now, start);
  expect(out.map(h => [h.exerciseName, h.previousLevelLabel])).toEqual([
    ['Squat', 'Intermediate'],
    ['Bench Press', null],
  ]);
});

test('elite has no next level, and shows no pounds', () => {
  const now = levels([['chest', result('Bench Press', 'elite', 400, null)]]);
  expect(strengthHighlights(now)[0]).toMatchObject({ nextLevelLabel: null, poundsToNext: null });
});

test('the same lift covering two muscles appears once, and the list is capped', () => {
  const now = levels([
    ['chest', result('Bench Press', 'intermediate', 188, 200)],
    ['triceps', result('Bench Press', 'intermediate', 188, 200)],
    ['quads', result('Squat', 'novice', 200, 260)],
    ['lats', result('Pull-Up', 'novice', 180, 200)],
    ['biceps', result('Curl', 'beginner', 60, 100)],
  ]);
  // Closest first: bench 12 lb, pull-up 20, curl 40, squat 60 (squat drops off).
  const out = strengthHighlights(now, null, 3);
  expect(out.map(h => h.exerciseName)).toEqual(['Bench Press', 'Pull-Up', 'Curl']);
});

test('muscles with no qualifying lift are skipped', () => {
  const now = levels([['chest', { level: 'untrained', bestExercise: null, allExercises: [] }]]);
  expect(strengthHighlights(now)).toEqual([]);
});
