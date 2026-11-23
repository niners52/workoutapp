import type { BodyMeasurement } from '../../types';
import { measurementRatios, scanMeasurement, scanSeries } from '../bodyComposition';

const typed = (type: BodyMeasurement['type'], date: string, value: number): BodyMeasurement => ({
  id: `${type}-${date}`,
  date,
  type,
  value,
  source: 'manual',
});

describe('ratios', () => {
  const log: BodyMeasurement[] = [
    typed('shoulders', '2026-10-01', 48),
    typed('waist', '2026-10-01', 38.4),
    typed('chest', '2026-10-01', 42),
    typed('shoulders', '2026-11-19', 48.5),
    typed('waist', '2026-11-19', 38),
    typed('chest', '2026-11-19', 42),
    typed('waist_narrow', '2026-11-23', 36.5), // no shoulders that day
  ];

  test('each ratio uses only dates where both were measured', () => {
    const [sw, swn, wc] = measurementRatios(log);
    expect(sw!.series).toEqual([
      { date: '2026-10-01', value: 1.25 },
      { date: '2026-11-19', value: 1.276 },
    ]);
    expect(sw!.latest).toEqual({ date: '2026-11-19', value: 1.276 });
    expect(sw!.change).toBe(0.026);
    expect(swn!.series).toEqual([]);
    expect(swn!.latest).toBeNull();
    expect(wc!.latest?.value).toBe(0.905);
    expect(wc!.spec.higherIsBetter).toBe(false);
  });
});

describe('InBody scans', () => {
  test('a scan on a day with a weigh-in updates that row instead of adding a second weight', () => {
    const hk: BodyMeasurement = { id: 'hk-body-2026-11-23', date: '2026-11-23', weight: 180.9, source: 'healthkit' };
    const row = scanMeasurement(
      { date: '2026-11-23', scanType: 'inbody', weight: 181.5, bodyFatPercentage: 9, skeletalMuscleLbs: 93.3, leanMassLbs: 165.1, visceralFatArea: 33.5, ecwTbw: 0.383, phaseAngle: 6.5 },
      [hk],
    );
    expect(row).toMatchObject({ id: 'hk-body-2026-11-23', weight: 181.5, skeletalMuscleLbs: 93.3, scanType: 'inbody', source: 'manual' });
  });

  test('a scan on a new day is its own manual row; blank fields are left off', () => {
    const row = scanMeasurement({ date: '2026-12-01', scanType: 'dexa', weight: 180, skeletalMuscleLbs: NaN }, []);
    expect(row.id).toBe('manual-body-2026-12-01-dexa');
    expect(row).not.toHaveProperty('skeletalMuscleLbs');
  });

  test('history: scans only, oldest first', () => {
    const log: BodyMeasurement[] = [
      { id: 'b', date: '2026-11-23', weight: 181.5, skeletalMuscleLbs: 93.3, visceralFatArea: 33.5, scanType: 'inbody', source: 'manual' },
      { id: 'w', date: '2026-11-21', weight: 175.3, source: 'healthkit' },
      { id: 'a', date: '2026-08-01', weight: 178, skeletalMuscleLbs: 91.8, scanType: 'inbody', source: 'manual' },
    ];
    expect(scanSeries(log, 'skeletalMuscleLbs')).toEqual([
      { date: '2026-08-01', value: 91.8 },
      { date: '2026-11-23', value: 93.3 },
    ]);
    expect(scanSeries(log, 'visceralFatArea')).toEqual([{ date: '2026-11-23', value: 33.5 }]);
  });
});
