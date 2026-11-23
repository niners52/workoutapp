import {
  buildDailyMetrics,
  buildZonesRow,
  computeHrZones,
  localDate,
  matchAppWorkout,
  maxHeartRateFor,
} from '../healthMetrics';

const TZ = 'America/Chicago';
const s = (start: string, value: number) => ({ start, end: start, value });

describe('daily health metrics', () => {
  test('days are local: 11 pm Chicago stays on its own day', () => {
    expect(localDate('2026-11-23T04:30:00Z', TZ)).toBe('2026-11-22');
    expect(localDate('2026-11-23T06:30:00Z', TZ)).toBe('2026-11-23');
  });

  test('VO2 latest, resting HR and HRV averaged, steps and energy summed, BP last reading', () => {
    const rows = buildDailyMetrics(
      {
        vo2: [s('2026-11-22T14:00:00Z', 44.1), s('2026-11-22T20:00:00Z', 44.6)],
        restingHr: [s('2026-11-22T12:00:00Z', 52), s('2026-11-22T18:00:00Z', 54)],
        hrv: [s('2026-11-22T10:00:00Z', 60), s('2026-11-22T11:00:00Z', 70), s('2026-11-22T12:00:00Z', 80)],
        steps: [s('2026-11-22T06:00:00Z', 6000), s('2026-11-22T18:00:00Z', 2500)],
        activeEnergy: [s('2026-11-22T06:00:00Z', 512.4)],
        bloodPressure: [
          { start: '2026-11-22T13:00:00Z', systolic: 121, diastolic: 79 },
          { start: '2026-11-22T22:00:00Z', systolic: 118, diastolic: 76 },
        ],
      },
      TZ,
      '2026-11-23T00:00:00Z',
    );
    expect(rows).toEqual([
      expect.objectContaining({
        id: 'hk-day-2026-11-22',
        date: '2026-11-22',
        vo2_max: 44.6,
        resting_hr: 53,
        hrv_sdnn_ms: 70,
        steps: 8500,
        active_energy_kcal: 512,
        bp_systolic: 118,
        bp_diastolic: 76,
      }),
    ]);
  });

  test('a day with nothing is not written; missing metrics stay null', () => {
    const rows = buildDailyMetrics(
      { vo2: [], restingHr: [s('2026-11-21T12:00:00Z', 50)], hrv: [], steps: [s('2026-11-20T12:00:00Z', 0)], activeEnergy: [], bloodPressure: [] },
      TZ,
      'now',
    );
    expect(rows.map(r => r.date)).toEqual(['2026-11-21']);
    expect(rows[0]).toMatchObject({ vo2_max: null, steps: null, bp_systolic: null, resting_hr: 50 });
  });
});

describe('max heart rate', () => {
  test('the setting wins; otherwise 220 - age; otherwise none', () => {
    expect(maxHeartRateFor(190, 40)).toBe(190);
    expect(maxHeartRateFor(undefined, 44)).toBe(176);
    expect(maxHeartRateFor(undefined, null)).toBeNull();
  });
});

describe('heart-rate zones', () => {
  const start = '2026-11-22T12:00:00Z';
  const end = '2026-11-22T12:10:00Z';
  // Max 200: Z1 100-119, Z2 120-139, Z3 140-159, Z4 160-179, Z5 180+.
  test('each sample holds until the next; below 50 % is no zone', () => {
    const samples = [
      s('2026-11-22T12:00:00Z', 90), // 1 min, no zone
      s('2026-11-22T12:01:00Z', 110), // Z1, 1 min
      s('2026-11-22T12:02:00Z', 130), // Z2, 1 min
      s('2026-11-22T12:03:00Z', 150), // Z3, 1 min
      s('2026-11-22T12:04:00Z', 170), // Z4, 1 min
      s('2026-11-22T12:05:00Z', 190), // Z5, 1 min (capped at 60 s to the end)
    ];
    const z = computeHrZones(samples, start, end, 200);
    expect(z.minutes).toEqual([1, 1, 1, 1, 1]);
    expect(z.peakHr).toBe(190);
    expect(z.sampleCount).toBe(6);
  });

  test('a long dropout counts only 60 s, and samples outside the workout are ignored', () => {
    const samples = [s('2026-11-22T11:59:00Z', 150), s('2026-11-22T12:00:00Z', 150), s('2026-11-22T12:08:00Z', 150)];
    const z = computeHrZones(samples, start, end, 200);
    expect(z.minutes[2]).toBe(2); // 60 s + 60 s
    expect(z.sampleCount).toBe(2);
  });

  test('a zones row carries the overlapping app workout', () => {
    const hk = { id: 'ABC', activityName: 'Traditional Strength Training', calories: 0, distance: 0, start, end, duration: 10, sourceName: 'Watch', sourceId: '' };
    const row = buildZonesRow(hk, [s(start, 120)], 200, [{ id: 'w1', startedAt: '2026-11-22T11:58:00Z', completedAt: '2026-11-22T12:09:00Z' }], 'now');
    expect(row).toMatchObject({ id: 'hk-zones-ABC', hk_workout_id: 'ABC', workout_id: 'w1', duration_min: 10, max_hr_used: 200, z2_min: 1 });
  });

  test('no app workout when the overlap is under half', () => {
    expect(matchAppWorkout({ start, end }, [{ id: 'w', startedAt: '2026-11-22T12:08:00Z', completedAt: '2026-11-22T13:00:00Z' }])).toBeNull();
  });
});
