/**
 * The macro spec (maintenance model) against real synced days from the
 * Workouts connector on 2026-09-17. Sep 8 is the fixture the spec names:
 * 1,573 kcal / 156 g protein / 34 g fat reads amber on calories AND fat.
 */
import { DEFAULT_HEALTH_TARGETS, type HealthTargets } from '../../types';
import {
  calorieBand,
  caloriesTile,
  carbsTile,
  dayVerdict,
  fatTile,
  proteinTile,
  type NutritionDaySnapshot,
} from '../healthDashboard';

const t = DEFAULT_HEALTH_TARGETS;
const cutting: HealthTargets = { ...t, macroMode: 'cutting' };

const day = (over: Partial<NutritionDaySnapshot>): NutritionDaySnapshot => ({
  date: '2026-09-08',
  calories: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  sodium_mg: null,
  calcium_mg: null,
  sample_count: 91,
  ...over,
});

// Real Sep 8, 2026 (get_nutrition_log).
const sep8 = day({
  date: '2026-09-08',
  calories: 1573.3,
  protein_g: 156.2,
  carbs_g: 204.2,
  fat_g: 33.6,
  sodium_mg: 1516.5,
  calcium_mg: 1857.6,
});

const morning = new Date(2026, 8, 8, 10, 0);
const evening = new Date(2026, 8, 8, 20, 0);

test('config: the band is 2100–2300 in maintenance and shifts down 250 in cutting', () => {
  expect(calorieBand(t)).toEqual({ lowKcal: 2100, highKcal: 2300 });
  expect(calorieBand(cutting)).toEqual({ lowKcal: 1850, highKcal: 2050 });
});

test('calories: Sep 8 is amber for being UNDER the band, not a win', () => {
  const c = caloriesTile(sep8, t);
  expect(c).toMatchObject({ kind: 'band', status: 'under', tone: 'warning', kcal: 1573 });
  expect(c.headline).toContain('under-fueled');
  expect(c.detail).toBe('527 kcal under the 2,100–2,300 kcal band');
});

test('calories: over the band is amber too, inside it is the target', () => {
  expect(caloriesTile(day({ calories: 2600 }), t)).toMatchObject({ status: 'over', tone: 'warning' });
  expect(caloriesTile(day({ calories: 2183.1 }), t)).toMatchObject({ status: 'inBand', tone: 'good' });
  // Sep 8 still reads under in cutting mode, but the gap is smaller.
  expect(caloriesTile(sep8, cutting)).toMatchObject({ status: 'under', detail: '277 kcal under the 1,850–2,050 kcal band' });
  expect(caloriesTile(day({ calories: 1900 }), cutting)).toMatchObject({ status: 'inBand', tone: 'good' });
});

test('calories: nothing logged is never a zero, and an unreadable nutrient says so', () => {
  expect(caloriesTile(day({ sample_count: 0 }), t)).toMatchObject({ kind: 'noData', status: null, tone: 'muted' });
  expect(caloriesTile(day({ calories: null }), t)).toMatchObject({ kind: 'unreadable', tone: 'warning' });
});

test('fat: Sep 8 34 g is amber in the evening with the hormone-support copy', () => {
  expect(fatTile(sep8, t, evening)).toMatchObject({
    kind: 'progress',
    grams: 34,
    met: false,
    tone: 'warning',
    detail: 'Fat low — hormone support',
  });
});

test('fat: the same 34 g in the morning is not a failure yet', () => {
  expect(fatTile(sep8, t, morning)).toMatchObject({ met: false, tone: 'normal', detail: '26 g to the 60 g floor' });
});

test('fat: at or above the floor reads met, whatever the hour', () => {
  expect(fatTile(day({ fat_g: 69.5 }), t, evening)).toMatchObject({ met: true, tone: 'good', detail: '60 g floor met (60–70 g)' });
});

test('protein: still a floor that counts up, exceeding stays uncolored', () => {
  expect(proteinTile(sep8, t)).toMatchObject({ kind: 'progress', grams: 156, met: false });
  expect(proteinTile(day({ protein_g: 180 }), t)).toMatchObject({ met: true, detail: '170 g floor met' });
});

test('carbs: information only — grams against the range plus remaining calories as carbs', () => {
  const c = carbsTile(sep8, t);
  expect(c).toMatchObject({ kind: 'info', grams: 204, lowG: 220, highG: 250 });
  // 2200 midpoint − 156.2 g protein (624.8 kcal) − 33.6 g fat (302.4 kcal) = 1272.8 kcal → 318 g
  expect(c.remainingAsCarbsG).toBe(318);
  expect(c).not.toHaveProperty('tone');
});

test('day verdict: Sep 8 names every rule it missed', () => {
  const v = dayVerdict(sep8, t, '2026-09-17');
  expect(v).toMatchObject({ kind: 'verdict', tone: 'warning', headline: '4 of 5 rules missed' });
  if (v.kind !== 'verdict') throw new Error('expected a verdict');
  expect(v.failed).toEqual(['calories', 'protein', 'fat', 'calcium']);
  expect(v.passed).toEqual(['sodium']);
  expect(v.detail).toBe('Missed: Calories in band, Protein floor, Fat floor, Calcium band');
});

test('day verdict: green only when all five rules pass', () => {
  const good = day({ date: '2026-09-16', calories: 2200, protein_g: 175, fat_g: 65, sodium_mg: 2100, calcium_mg: 1100 });
  expect(dayVerdict(good, t, '2026-09-17')).toMatchObject({ kind: 'verdict', tone: 'good', failed: [], headline: 'All five rules met' });
});

test('day verdict: a partial day and an unlogged day get no verdict', () => {
  expect(dayVerdict(day({ date: '2026-09-17' }), t, '2026-09-17')).toMatchObject({ kind: 'partial' });
  expect(dayVerdict(day({ sample_count: 0 }), t, '2026-09-17')).toMatchObject({ kind: 'incomplete' });
});

test('day verdict: an unreadable nutrient is not a pass', () => {
  const partlyUnreadable = day({ calories: 2200, protein_g: 175, fat_g: 65, sodium_mg: 2100, calcium_mg: null });
  const v = dayVerdict(partlyUnreadable, t, '2026-09-17');
  if (v.kind !== 'verdict') throw new Error('expected a verdict');
  expect(v.tone).toBe('warning');
  expect(v.unknown).toEqual(['calcium']);
  expect(v.detail).toBe('Unreadable: Calcium band');
});
