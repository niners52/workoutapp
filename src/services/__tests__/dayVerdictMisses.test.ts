/**
 * The day verdict, with the numbers in it.
 *
 * "3 of 5 rules missed · Missed: Calories in band, Fat floor, Calcium band"
 * never said how close anything was, so Tyler could not tell a 2 g miss from a
 * 25 g one. Built from his real 2026-10-05 row against his real targets.
 */
import { dayVerdict, formatMiss, type NutritionDaySnapshot } from '../healthDashboard';
import type { HealthTargets } from '../../types';
import { DEFAULT_HEALTH_TARGETS } from '../../types';

// Tyler's targets: 2,100-2,300 kcal, protein floor 170, fat floor 60,
// sodium budget 2,300, calcium band 1,000-1,200.
const t: HealthTargets = {
  ...DEFAULT_HEALTH_TARGETS,
  macroMode: 'maintenance',
  calorieBandLowKcal: 2100,
  calorieBandHighKcal: 2300,
  proteinFloorG: 170,
  fatFloorG: 60,
  sodiumBudgetMg: 2300,
  calciumBandLowMg: 1000,
  calciumBandHighMg: 1200,
};

const oct5: NutritionDaySnapshot = {
  date: '2026-10-05',
  calories: 1603.8,
  protein_g: 170,
  fat_g: 37.5,
  sodium_mg: 1721.5,
  calcium_mg: 1828.8,
  sample_count: 40,
  last_sample_at: null,
  synced_at: '2026-10-06T11:00:00.000Z',
} as NutritionDaySnapshot;

describe('2026-10-05 as synced', () => {
  const v = dayVerdict(oct5, t, '2026-10-06');

  test('three rules missed, and each says by how much', () => {
    expect(v.kind).toBe('verdict');
    if (v.kind !== 'verdict') return;
    expect(v.failed).toEqual(['calories', 'fat', 'calcium']);
    expect(v.misses.map(formatMiss)).toEqual([
      'calories in band 1,603.8 kcal (496.2 under 2,100)',
      'fat floor 37.5 g (22.5 under 60)',
      'calcium band 1,828.8 mg (628.8 over 1,200)',
    ]);
    expect(v.headline).toBe('3 of 5 rules missed');
  });

  test('protein exactly on the floor passes, and sodium under budget passes', () => {
    if (v.kind !== 'verdict') return;
    expect(v.passed).toEqual(['protein', 'sodium']);
  });

  test('none of those three was a near miss', () => {
    if (v.kind !== 'verdict') return;
    expect(v.misses.map(m => m.near)).toEqual([false, false, false]);
  });
});

describe('a miss that really is small', () => {
  test('2 g under a 60 g fat floor still fails, but reads as just short', () => {
    const row = { ...oct5, calories: 2200, fat_g: 58, calcium_mg: 1100 } as NutritionDaySnapshot;
    const v = dayVerdict(row, t, '2026-10-06');
    if (v.kind !== 'verdict') return;
    expect(v.failed).toEqual(['fat']);
    expect(v.misses[0]).toMatchObject({ rule: 'fat', value: 58, bound: 60, delta: 2, direction: 'under', near: true });
    expect(v.headline).toBe('1 of 5 just short');
  });

  test('a 1 g miss alongside a big one is not called just short', () => {
    const row = { ...oct5, calories: 2200, fat_g: 59, calcium_mg: 1828.8 } as NutritionDaySnapshot;
    const v = dayVerdict(row, t, '2026-10-06');
    if (v.kind !== 'verdict') return;
    expect(v.headline).toBe('2 of 5 rules missed');
    expect(v.misses.map(m => m.near)).toEqual([true, false]);
  });

  test('a clean day still says so', () => {
    const row = { ...oct5, calories: 2200, fat_g: 65, calcium_mg: 1100 } as NutritionDaySnapshot;
    const v = dayVerdict(row, t, '2026-10-06');
    if (v.kind !== 'verdict') return;
    expect(v.headline).toBe('All five rules met');
    expect(v.misses).toEqual([]);
  });
});
