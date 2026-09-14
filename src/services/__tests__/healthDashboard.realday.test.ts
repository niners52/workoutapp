/**
 * Tier 1 against real synced data: the nutrition_days rows get_nutrition_log
 * returned on 2026-09-14 (Cronometer via Apple Health). If the tile math drifts
 * from the synced totals, these fail.
 */
import { DEFAULT_HEALTH_TARGETS } from '../../types';
import { calciumTile, loggingTile, proteinTile, sodiumTile, type NutritionDaySnapshot } from '../healthDashboard';

const t = DEFAULT_HEALTH_TARGETS;

// 2026-09-13 as synced (synced_at 2026-09-14T11:05Z; row predates last_sample_at).
const sep13: NutritionDaySnapshot = {
  date: '2026-09-13',
  sodium_mg: 2605.2,
  calcium_mg: null,
  protein_g: 164.1,
  sample_count: 59,
  last_sample_at: null,
  synced_at: '2026-09-14T11:05:08.231Z',
};

describe('real synced day 2026-09-13', () => {
  const evening = new Date(2026, 8, 13, 21, 30);

  test('sodium: 2,605 mg against a 2,300 mg budget is 305 mg over', () => {
    const s = sodiumTile(sep13, t, evening);
    expect(s.kind).toBe('budget');
    if (s.kind !== 'budget') return;
    expect(s.consumedMg).toBe(2605);
    expect(s.remainingMg).toBe(-305);
    expect(s.tone).toBe('danger');
    expect(s.headline).toBe('305 mg over');
    expect(s.detail).toBe('2,605 of 2,300 mg used');
  });

  test('calcium: null on a logged day reads as not syncing, never as zero', () => {
    expect(calciumTile(sep13, sep13, t).kind).toBe('notSyncing');
  });

  test('protein: 164 g is 6 g short of the 170 g floor', () => {
    const p = proteinTile(sep13, t);
    expect(p).toMatchObject({ kind: 'progress', grams: 164, met: false, detail: '6 g to 170 g floor' });
  });

  test('logging: a row without last_sample_at shows its sample count', () => {
    expect(loggingTile(sep13, t, evening).headline).toBe('59 entries today');
  });
});

describe('real morning 2026-09-14 10:43, nothing synced for today yet', () => {
  const now = new Date(2026, 8, 14, 10, 43);

  test('sodium says nothing logged instead of a full budget', () => {
    const s = sodiumTile(null, t, now);
    expect(s).toMatchObject({ kind: 'noData', headline: 'Nothing logged yet', label: 'Sodium left today' });
  });

  test('calcium still reports the broken read path from yesterday', () => {
    expect(calciumTile(null, sep13, t).kind).toBe('notSyncing');
  });

  test('protein and logging are empty, not zero', () => {
    expect(proteinTile(null, t).kind).toBe('noData');
    expect(loggingTile(null, t, now)).toMatchObject({ tone: 'muted', nudge: null });
  });
});
