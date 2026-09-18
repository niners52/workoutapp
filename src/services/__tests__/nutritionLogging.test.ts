/**
 * Food-logging tile vs Cronometer's midnight stamps. Cronometer writes each
 * Apple Health sample at local midnight, so "last entry" always read 12:00 AM
 * and the evening check could never see dinner. The tile now ignores midnight
 * stamps and falls back to when a sync saw today's totals change.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../healthKit', () => ({ fetchNutritionSamples: jest.fn() }));
jest.mock('../syncService', () => ({ syncNutritionDays: jest.fn() }));

import { DEFAULT_HEALTH_TARGETS } from '../../types';
import { isMidnightStamp, loggingTile, type NutritionDaySnapshot } from '../healthDashboard';
import { trackDayChanges, type CachedNutritionDays } from '../nutritionSync';
import type { NutritionDayRow } from '../syncService';

const t = DEFAULT_HEALTH_TARGETS;
const at = (h: number, m = 0) => new Date(2026, 8, 18, h, m);

const today = (over: Partial<NutritionDaySnapshot> = {}): NutritionDaySnapshot => ({
  date: '2026-09-18',
  calories: 1500,
  protein_g: 120,
  carbs_g: 150,
  fat_g: 50,
  sodium_mg: 1800,
  calcium_mg: 900,
  sample_count: 60,
  last_sample_at: at(0).toISOString(), // what Cronometer actually writes
  synced_at: at(20, 5).toISOString(),
  ...over,
});

test('a midnight stamp is recognised as "no time", a real time is not', () => {
  expect(isMidnightStamp(at(0).toISOString())).toBe(true);
  expect(isMidnightStamp(at(18, 10).toISOString())).toBe(false);
  expect(isMidnightStamp(null)).toBe(false);
});

test('midnight-stamped entries no longer read "Last entry 12:00 AM"', () => {
  const tile = loggingTile(today(), t, at(14));
  expect(tile.headline).not.toContain('12:00 AM');
  expect(tile.headline).toBe('60 entries today');
});

test('with a change seen at 6:40 PM, the tile says when it was updated and the evening counts as logged', () => {
  const tile = loggingTile(today(), t, at(20, 10), at(18, 40).toISOString());
  expect(tile).toMatchObject({ headline: 'Updated 6:40 PM', tone: 'normal', nudge: null });
});

test('if nothing changed since the afternoon, the evening still reads unlogged', () => {
  const tile = loggingTile(today(), t, at(20, 10), at(13, 15).toISOString());
  expect(tile).toMatchObject({ headline: 'Updated 1:15 PM', tone: 'warning', nudge: 'Evening unlogged — sodium invisible' });
});

test('a real entry time still wins over the change time', () => {
  const tile = loggingTile(today({ last_sample_at: at(19, 2).toISOString() }), t, at(20, 10), at(20, 5).toISOString());
  expect(tile.headline).toBe('Last entry 7:02 PM');
});

const row = (date: string, calories: number, count: number): NutritionDayRow => ({
  id: `hk-nutrition-${date}`,
  date,
  calories,
  protein_g: 100,
  carbs_g: 100,
  fat_g: 40,
  fiber_g: 20,
  iron_mg: 8,
  vitamin_b12_mcg: 5,
  vitamin_d_iu: null,
  calcium_mg: 900,
  zinc_mg: 1,
  sodium_mg: 1500,
  sample_count: count,
  last_sample_at: null,
  source: 'healthkit',
  synced_at: '',
});

test('change tracking: unchanged days keep their time, new or edited days take the sync time', () => {
  const first = '2026-09-18T18:00:00.000Z';
  const second = '2026-09-18T23:30:00.000Z';
  const previous: CachedNutritionDays = {
    rows: [row('2026-09-18', 900, 30), row('2026-09-17', 2100, 90)],
    unavailable: [],
    syncedAt: first,
    changedAt: { '2026-09-18': first, '2026-09-17': '2026-09-17T23:00:00.000Z' },
  };
  const changed = trackDayChanges(
    [row('2026-09-18', 1500, 60), row('2026-09-17', 2100, 90), row('2026-09-16', 1800, 70)],
    previous,
    second,
  );
  expect(changed).toEqual({
    '2026-09-18': second, // dinner added
    '2026-09-17': '2026-09-17T23:00:00.000Z', // untouched
    '2026-09-16': second, // first time this phone saw it
  });
});

test('change tracking: the first sync on a phone stamps every day with the sync time', () => {
  expect(trackDayChanges([row('2026-09-18', 900, 30)], null, 'x')).toEqual({ '2026-09-18': 'x' });
});
