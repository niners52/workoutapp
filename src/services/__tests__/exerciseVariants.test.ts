/**
 * Wide / Narrow on cable exercises: the handle spacing changes the load (about
 * 10 lb narrow vs 20 lb wide on the Planet Fitness fly), so each set records
 * how it was done and last-time weights and PRs are per variant. Sets logged
 * before this existed are untagged and stand in until a variant has history.
 */
import type { Exercise, WorkoutSet } from '../../types';
import {
  CABLE_FLY_MERGE,
  defaultVariant,
  setsForVariant,
  tagSetsForVariantMerge,
  variantsFor,
} from '../exerciseVariants';

const FLY = CABLE_FLY_MERGE.keeperId;
const NARROW = CABLE_FLY_MERGE.sourceId;

const ex = (id: string, equipment: Exercise['equipment']): Exercise => ({ id, name: id, equipment }) as Exercise;
const set = (id: string, exerciseId: string, weight: number, loggedAt: string, variant?: string): WorkoutSet =>
  ({ id, workoutId: 'w', exerciseId, reps: 12, weight, loggedAt, ...(variant ? { variant } : {}) }) as WorkoutSet;

test('every cable exercise offers Wide and Narrow; other equipment does not', () => {
  expect(variantsFor(ex('cable-curl', 'cable'))).toEqual(['Wide', 'Narrow']);
  expect(variantsFor(ex(FLY, 'cable'))).toEqual(['Wide', 'Narrow']);
  expect(variantsFor(ex('seated-leg-extension', 'machine'))).toBeNull();
  expect(variantsFor(ex('import-pullup', 'bodyweight'))).toBeNull();
  expect(variantsFor(null)).toBeNull();
});

test('last time and PRs compare within a variant', () => {
  const history = [
    set('w1', FLY, 20, '2026-08-30T17:10:00Z', 'Wide'),
    set('n1', FLY, 10, '2026-08-25T11:29:00Z', 'Narrow'),
  ];
  expect(setsForVariant(history, 'Narrow').map(s => s.weight)).toEqual([10]);
  expect(setsForVariant(history, 'Wide').map(s => s.weight)).toEqual([20]);
  expect(setsForVariant(history, undefined)).toHaveLength(2);
});

test('untagged history stays comparable to either variant; only the other variant is excluded', () => {
  const history = [
    set('u1', 'cable-curl', 105, '2026-09-17T11:00:00Z'), // logged before variants existed
    set('u2', 'cable-curl', 100, '2026-09-10T11:00:00Z'),
    set('w1', 'cable-curl', 90, '2026-09-20T11:00:00Z', 'Wide'),
    set('n1', 'cable-curl', 60, '2026-09-21T11:00:00Z', 'Narrow'),
  ];
  expect(setsForVariant(history, 'Narrow').map(s => s.id)).toEqual(['u1', 'u2', 'n1']);
  expect(setsForVariant(history, 'Wide').map(s => s.id)).toEqual(['u1', 'u2', 'w1']);
});

test('the first tagged set of a session is not a PR against itself', () => {
  // The bug: one Wide set logged today used to hide years of untagged history,
  // so the next set at any weight looked like a personal record.
  const history = [
    set('u1', 'cable-curl', 105, '2026-09-17T11:00:00Z'),
    set('w1', 'cable-curl', 90, '2026-09-28T11:00:00Z', 'Wide'),
  ];
  const comparable = setsForVariant(history, 'Wide');
  expect(Math.max(...comparable.map(s => s.weight))).toBe(105);
});

test('merge: wide sets are tagged Wide, narrow sets move onto the fly tagged Narrow, others untouched', () => {
  const before = [
    set('a', FLY, 20, '2026-08-30T17:10:00Z'),
    set('b', NARROW, 10, '2026-08-25T11:29:00Z'),
    set('c', 'cable-curl', 30, '2026-08-25T11:40:00Z'),
    set('d', FLY, 20, '2026-09-01T11:00:00Z', 'Wide'),
  ];
  const { sets, changedIds } = tagSetsForVariantMerge(before, CABLE_FLY_MERGE);
  expect(sets.map(s => [s.id, s.exerciseId, s.variant])).toEqual([
    ['a', FLY, 'Wide'],
    ['b', FLY, 'Narrow'],
    ['c', 'cable-curl', undefined],
    ['d', FLY, 'Wide'],
  ]);
  expect(changedIds).toEqual(['a', 'b']);
  expect(tagSetsForVariantMerge(sets, CABLE_FLY_MERGE).changedIds).toEqual([]);
});

test('the toggle starts on what was done last: this workout first, then last time, then Wide', () => {
  const variants = variantsFor(ex(FLY, 'cable'));
  const lastTimeNarrow = [set('n1', FLY, 10, '2026-08-25T11:29:00Z', 'Narrow')];
  const thisWorkoutWide = [set('w2', FLY, 20, '2026-09-18T11:05:00Z', 'Wide')];
  expect(defaultVariant(variants, thisWorkoutWide, lastTimeNarrow)).toBe('Wide');
  expect(defaultVariant(variants, [], lastTimeNarrow)).toBe('Narrow');
  // Untagged history says nothing about which way, so the toggle starts on Wide.
  expect(defaultVariant(variants, [], [set('u1', FLY, 20, '2026-08-01T11:00:00Z')])).toBe('Wide');
  expect(defaultVariant(null, [], [])).toBeUndefined();
});
