import type { PainLogEntry } from '../../types';
import { painWarningsFor } from '../painLog';

const NOW = new Date('2026-11-23T18:00:00Z');
const entry = (over: Partial<PainLogEntry>): PainLogEntry => ({ id: 'p', date: '2026-11-20', area: 'elbow', side: 'left', score: 4, ...over });

describe('pain warnings', () => {
  test('elbow pain warns triceps, biceps and forearm work', () => {
    const log = [entry({})];
    expect(painWarningsFor({ primaryMuscleGroups: ['triceps'] }, log, NOW)).toHaveLength(1);
    expect(painWarningsFor({ primaryMuscleGroups: ['lats'], secondaryMuscleGroups: ['biceps'] }, log, NOW)).toHaveLength(1);
    expect(painWarningsFor({ primaryMuscleGroups: ['quads'] }, log, NOW)).toHaveLength(0);
  });

  test('only scores of 3 or more in the last 14 days', () => {
    const log = [entry({ score: 2 }), entry({ id: 'old', date: '2026-11-05', score: 8 })];
    expect(painWarningsFor({ primaryMuscleGroups: ['triceps'] }, log, NOW)).toEqual([]);
  });

  test('one warning per area, the worst score, with side and date', () => {
    const log = [entry({ id: 'a', score: 3, date: '2026-11-21' }), entry({ id: 'b', score: 6, date: '2026-11-18' })];
    const [w, ...rest] = painWarningsFor({ primaryMuscleGroups: ['triceps'] }, log, NOW);
    expect(rest).toEqual([]);
    expect(w).toMatchObject({ area: 'elbow', score: 6, date: '2026-11-18' });
    expect(w!.message).toBe('Left elbow pain 6/10 on 11/18 — go easy or swap');
  });

  test('shoulder pain covers every delt head and the rotator cuff', () => {
    const log = [entry({ area: 'shoulder', side: 'both' })];
    for (const g of ['front_delts', 'side_delts', 'rear_delts', 'rotator_cuff'] as const) {
      expect(painWarningsFor({ primaryMuscleGroups: [g] }, log, NOW)).toHaveLength(1);
    }
  });
});
