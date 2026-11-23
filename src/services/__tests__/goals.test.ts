import type { BodyMeasurement, Exercise, Goal, WorkoutSet } from '../../types';
import { dailyWeights, e1rm, goalProgress } from '../goals';

const NOW = new Date('2026-11-23T18:00:00Z');
const weigh = (date: string, weight: number, source: 'manual' | 'healthkit' = 'healthkit'): BodyMeasurement => ({ id: `${source}-${date}`, date, weight, source });
const tape = (type: BodyMeasurement['type'], date: string, value: number): BodyMeasurement => ({ id: `${type}-${date}`, date, type, value, source: 'manual' });
const goal = (over: Partial<Goal>): Goal => ({ id: 'g', type: 'measurement', metricKey: 'shoulders', label: 'x', target: 50, direction: 'at_least', sortOrder: 0, ...over });
const set = (exerciseId: string, weight: number, reps: number, loggedAt: string, over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `${exerciseId}-${loggedAt}-${weight}-${reps}`,
  workoutId: 'w',
  exerciseId,
  weight,
  reps,
  loggedAt,
  ...over,
});
const ex = (id: string, over: Partial<Exercise> = {}) => ({ id, name: id, equipment: 'machine', ...over }) as Exercise;

describe('weight band', () => {
  const band = goal({ type: 'weight_band', metricKey: 'weight', target: 175, targetMax: 179, direction: 'band' });

  test('the 7-day average against the band; older days left out', () => {
    const log = [weigh('2026-11-23', 181.5, 'manual'), weigh('2026-11-21', 175.3), weigh('2026-11-20', 176), weigh('2026-11-10', 170)];
    const p = goalProgress(band, { measurements: log, sets: [], exercises: [], now: NOW });
    expect(p.current).toBe('177.6 lb avg (3 days)');
    expect(p.met).toBe(true);
  });

  test('above the band says by how much', () => {
    const p = goalProgress(band, { measurements: [weigh('2026-11-23', 181.5)], sets: [], exercises: [], now: NOW });
    expect(p.met).toBe(false);
    expect(p.detail).toBe('2.5 lb above 175–179');
  });

  test('a manual entry wins over Apple Health on the same day', () => {
    expect(dailyWeights([weigh('2026-11-23', 180.9), weigh('2026-11-23', 181.5, 'manual')])).toEqual([{ date: '2026-11-23', weight: 181.5 }]);
  });
});

describe('measurements', () => {
  const log = [tape('shoulders', '2026-11-19', 48.5), tape('left_arm', '2026-11-19', 14.5), tape('right_arm', '2026-11-19', 15), tape('waist_narrow', '2026-11-23', 36.5)];

  test('at least: shoulders 48.5 of 50', () => {
    const p = goalProgress(goal({}), { measurements: log, sets: [], exercises: [], now: NOW });
    expect(p.fraction).toBeCloseTo(0.97, 2);
    expect(p.detail).toBe('1.5 in to go · target 50');
  });

  test('arms is the mean of both arms', () => {
    const p = goalProgress(goal({ metricKey: 'arms', target: 15.5 }), { measurements: log, sets: [], exercises: [], now: NOW });
    expect(p.current).toBe('14.8 in');
  });

  test('at most: narrow waist 36.5 against ≤ 36', () => {
    const p = goalProgress(goal({ metricKey: 'waist_narrow', target: 36, direction: 'at_most' }), { measurements: log, sets: [], exercises: [], now: NOW });
    expect(p.met).toBe(false);
    expect(p.detail).toBe('0.5 in to go · target ≤ 36');
  });
});

describe('lifts', () => {
  const incline = goal({ type: 'lift', metricKey: 'plate-loaded-incline-press', target: 300, targetReps: 6 });

  test('best recent set by estimated 1RM, as a share of the target', () => {
    const sets = [set('plate-loaded-incline-press', 260, 6, '2026-11-17T12:00:00Z'), set('plate-loaded-incline-press', 250, 8, '2026-11-10T12:00:00Z')];
    const p = goalProgress(incline, { measurements: [], sets, exercises: [ex('plate-loaded-incline-press')], now: NOW });
    // 250 × 8 (e1RM 316.7) beats 260 × 6 (312).
    expect(p.current).toBe('250 × 8');
    expect(p.fraction).toBeCloseTo(e1rm(250, 8) / e1rm(300, 6), 5);
    expect(p.met).toBe(false);
  });

  test('met once a single set hits weight and reps; warm-ups and old sets do not count', () => {
    const sets = [
      set('plate-loaded-incline-press', 300, 6, '2026-11-20T12:00:00Z', { isWarmup: true }),
      set('plate-loaded-incline-press', 305, 6, '2026-06-01T12:00:00Z'),
    ];
    const p = goalProgress(incline, { measurements: [], sets, exercises: [ex('plate-loaded-incline-press')], now: NOW });
    expect(p.met).toBe(false);
    expect(p.fraction).toBeNull();
  });

  test('a bodyweight lift counts body weight plus the added weight', () => {
    const pullup = goal({ type: 'lift', metricKey: 'import-pullup', target: 25, targetReps: 8 });
    const sets = [set('import-pullup', 0, 8, '2026-11-13T12:00:00Z')];
    const p = goalProgress(pullup, {
      measurements: [weigh('2026-11-21', 175)],
      sets,
      exercises: [ex('import-pullup', { equipment: 'bodyweight' })],
      now: NOW,
    });
    expect(p.current).toBe('BW × 8');
    expect(p.detail).toBe('Target BW + 25 × 8');
    expect(p.fraction).toBeCloseTo(175 / 200, 5);
  });
});
