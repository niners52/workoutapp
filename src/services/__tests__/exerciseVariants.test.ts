/**
 * Cable fly high-to-low: one exercise, sets tagged Wide or Narrow. The loads
 * differ (about 10 lb narrow vs 20 lb wide), so last-time weights and PRs are
 * per variant while the history holds both.
 */
import type { WorkoutSet } from '../../types';
import {
  CABLE_FLY_MERGE,
  defaultVariant,
  setsForVariant,
  tagSetsForVariantMerge,
  variantsFor,
} from '../exerciseVariants';

const FLY = CABLE_FLY_MERGE.keeperId;
const NARROW = CABLE_FLY_MERGE.sourceId;

const set = (id: string, exerciseId: string, weight: number, loggedAt: string, variant?: string): WorkoutSet =>
  ({ id, workoutId: 'w', exerciseId, reps: 12, weight, loggedAt, ...(variant ? { variant } : {}) }) as WorkoutSet;

test('the cable fly has Wide and Narrow; other exercises have no variants', () => {
  expect(variantsFor(FLY)).toEqual(['Wide', 'Narrow']);
  expect(variantsFor(NARROW)).toBeNull(); // merged away, not a variant exercise of its own
  expect(variantsFor('cable-curl')).toBeNull();
});

test('merge: wide sets are tagged Wide, narrow sets move onto the fly tagged Narrow, others untouched', () => {
  const before = [
    set('a', FLY, 20, '2026-08-30T17:10:00Z'),
    set('b', NARROW, 10, '2026-08-25T11:29:00Z'),
    set('c', 'cable-curl', 30, '2026-08-25T11:40:00Z'),
    set('d', FLY, 20, '2026-09-01T11:00:00Z', 'Wide'), // already tagged: unchanged
  ];
  const { sets, changedIds } = tagSetsForVariantMerge(before, CABLE_FLY_MERGE);
  expect(sets.map(s => [s.id, s.exerciseId, s.variant])).toEqual([
    ['a', FLY, 'Wide'],
    ['b', FLY, 'Narrow'],
    ['c', 'cable-curl', undefined],
    ['d', FLY, 'Wide'],
  ]);
  expect(changedIds).toEqual(['a', 'b']);
  // Running it again changes nothing.
  expect(tagSetsForVariantMerge(sets, CABLE_FLY_MERGE).changedIds).toEqual([]);
});

test('last time and PRs compare within a variant only', () => {
  const history = [
    set('w1', FLY, 20, '2026-08-30T17:10:00Z', 'Wide'),
    set('n1', FLY, 10, '2026-08-25T11:29:00Z', 'Narrow'),
    set('u1', FLY, 15, '2026-08-01T11:00:00Z'), // untagged: comparable to neither
  ];
  expect(setsForVariant(history, 'Narrow').map(s => s.weight)).toEqual([10]);
  expect(setsForVariant(history, 'Wide').map(s => s.weight)).toEqual([20]);
  // An exercise without variants sees everything.
  expect(setsForVariant(history, undefined)).toHaveLength(3);
});

test('the toggle starts on what was done last: this workout first, then last time, then Wide', () => {
  const lastTimeNarrow = [set('n1', FLY, 10, '2026-08-25T11:29:00Z', 'Narrow')];
  const thisWorkoutWide = [set('w2', FLY, 20, '2026-09-18T11:05:00Z', 'Wide')];
  expect(defaultVariant(FLY, thisWorkoutWide, lastTimeNarrow)).toBe('Wide');
  expect(defaultVariant(FLY, [], lastTimeNarrow)).toBe('Narrow');
  expect(defaultVariant(FLY, [], [])).toBe('Wide');
  expect(defaultVariant('cable-curl', [], [])).toBeUndefined();
});
