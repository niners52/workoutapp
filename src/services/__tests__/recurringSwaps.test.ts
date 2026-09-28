/**
 * A swap made week after week is not a swap, it is the plan. Three weeks
 * running (and still current) is the point where the app offers to update the
 * template instead of asking again.
 */
import type { Exercise, ExerciseSwap } from '../../types';
import { findRecurringSwaps, recurringSwapKey } from '../recurringSwaps';

// Monday weeks; "now" is Thursday 2026-09-24.
const now = new Date(2026, 8, 24, 19, 0);
const ex = (id: string, name: string): Exercise => ({ id, name, equipment: 'cable' }) as Exercise;
const exercises = [ex('cable-fly', 'Cable Fly'), ex('pec-deck', 'Pec Deck'), ex('curl', 'Curl'), ex('hammer', 'Hammer Curl')];

let n = 0;
const swap = (original: string, current: string, iso: string): ExerciseSwap =>
  ({ id: `s${n++}`, workoutId: `w${n}`, originalExerciseId: original, currentExerciseId: current, swappedAt: iso }) as ExerciseSwap;

test('three consecutive weeks of the same swap is offered for promotion', () => {
  const swaps = [
    swap('cable-fly', 'pec-deck', '2026-09-22T11:00:00Z'), // this week
    swap('cable-fly', 'pec-deck', '2026-09-15T11:00:00Z'),
    swap('cable-fly', 'pec-deck', '2026-09-08T11:00:00Z'),
  ];
  const found = findRecurringSwaps(swaps, exercises, 'monday', now);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({
    originalName: 'Cable Fly',
    currentName: 'Pec Deck',
    weeks: 3,
    key: recurringSwapKey('cable-fly', 'pec-deck'),
  });
});

test('two weeks is not enough', () => {
  const swaps = [
    swap('cable-fly', 'pec-deck', '2026-09-22T11:00:00Z'),
    swap('cable-fly', 'pec-deck', '2026-09-15T11:00:00Z'),
  ];
  expect(findRecurringSwaps(swaps, exercises, 'monday', now)).toEqual([]);
});

test('a gap breaks the run', () => {
  const swaps = [
    swap('cable-fly', 'pec-deck', '2026-09-22T11:00:00Z'),
    // nothing the week of Sep 14
    swap('cable-fly', 'pec-deck', '2026-09-08T11:00:00Z'),
    swap('cable-fly', 'pec-deck', '2026-09-01T11:00:00Z'),
  ];
  expect(findRecurringSwaps(swaps, exercises, 'monday', now)).toEqual([]);
});

test('an old habit that stopped is not raised again', () => {
  const swaps = [
    swap('cable-fly', 'pec-deck', '2026-08-18T11:00:00Z'),
    swap('cable-fly', 'pec-deck', '2026-08-11T11:00:00Z'),
    swap('cable-fly', 'pec-deck', '2026-08-04T11:00:00Z'),
  ];
  expect(findRecurringSwaps(swaps, exercises, 'monday', now)).toEqual([]);
});

test('a run that reached last week still counts, and several swaps sort by length', () => {
  const swaps = [
    // cable fly -> pec deck: 4 weeks, ending last week
    swap('cable-fly', 'pec-deck', '2026-09-15T11:00:00Z'),
    swap('cable-fly', 'pec-deck', '2026-09-08T11:00:00Z'),
    swap('cable-fly', 'pec-deck', '2026-09-01T11:00:00Z'),
    swap('cable-fly', 'pec-deck', '2026-08-25T11:00:00Z'),
    // curl -> hammer: 3 weeks, ending this week
    swap('curl', 'hammer', '2026-09-22T11:00:00Z'),
    swap('curl', 'hammer', '2026-09-15T11:00:00Z'),
    swap('curl', 'hammer', '2026-09-08T11:00:00Z'),
  ];
  const found = findRecurringSwaps(swaps, exercises, 'monday', now);
  expect(found.map(s => [s.originalName, s.weeks])).toEqual([['Cable Fly', 4], ['Curl', 3]]);
});

test('swaps naming an exercise that no longer exists are ignored', () => {
  const swaps = [
    swap('deleted', 'pec-deck', '2026-09-22T11:00:00Z'),
    swap('deleted', 'pec-deck', '2026-09-15T11:00:00Z'),
    swap('deleted', 'pec-deck', '2026-09-08T11:00:00Z'),
  ];
  expect(findRecurringSwaps(swaps, exercises, 'monday', now)).toEqual([]);
});
