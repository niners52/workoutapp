/**
 * Body composition from the measurements log: InBody / DEXA scan history and
 * the circumference ratios (shoulders ÷ waist, shoulders ÷ narrowest waist,
 * waist ÷ chest). Pure: takes the measurements, returns what the cards show.
 */
import type { BodyMeasurement, BodyMeasurementTypeKey, ScanType } from '../types';

export type ScanField = 'skeletalMuscleLbs' | 'leanMassLbs' | 'visceralFatArea' | 'ecwTbw' | 'phaseAngle' | 'bodyFatPercentage' | 'weight';

/** A weight row that carries scan detail. */
export function isScan(m: BodyMeasurement): boolean {
  return !m.type && (m.scanType === 'inbody' || m.scanType === 'dexa' || m.skeletalMuscleLbs != null || m.visceralFatArea != null);
}

/** Scans, oldest first. */
export function scans(measurements: BodyMeasurement[]): BodyMeasurement[] {
  return measurements.filter(isScan).sort((a, b) => a.date.localeCompare(b.date));
}

/** One field across scans, oldest first, skipping scans without it. */
export function scanSeries(measurements: BodyMeasurement[], field: ScanField): { date: string; value: number }[] {
  return scans(measurements)
    .map(m => ({ date: m.date, value: m[field] }))
    .filter((p): p is { date: string; value: number } => typeof p.value === 'number');
}

export interface ScanInput {
  date: string;
  scanType: ScanType;
  weight?: number;
  bodyFatPercentage?: number;
  skeletalMuscleLbs?: number;
  leanMassLbs?: number;
  visceralFatArea?: number;
  ecwTbw?: number;
  phaseAngle?: number;
}

/**
 * The row a scan saves as. A weight row already on that date is updated in
 * place (a manual one first), so the day keeps one weight; the row becomes
 * manual, which also stops the Apple Health import overwriting it. Otherwise
 * a new row.
 */
export function scanMeasurement(input: ScanInput, existing: BodyMeasurement[]): BodyMeasurement {
  const sameDay = existing.filter(m => !m.type && m.date === input.date);
  const base = sameDay.find(m => m.source === 'manual') ?? sameDay[0];
  const fields = Object.fromEntries(
    Object.entries({
      weight: input.weight,
      bodyFatPercentage: input.bodyFatPercentage,
      skeletalMuscleLbs: input.skeletalMuscleLbs,
      leanMassLbs: input.leanMassLbs,
      visceralFatArea: input.visceralFatArea,
      ecwTbw: input.ecwTbw,
      phaseAngle: input.phaseAngle,
    }).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)),
  );
  return {
    ...(base ?? {}),
    id: base?.id ?? `manual-body-${input.date}-${input.scanType}`,
    date: input.date,
    ...fields,
    scanType: input.scanType,
    source: 'manual',
  } as BodyMeasurement;
}

// ─── Ratios ─────────────────────────────────────────────────────────────────

export interface RatioSpec {
  key: string;
  label: string;
  numerator: BodyMeasurementTypeKey;
  denominator: BodyMeasurementTypeKey;
  /** Whether a higher ratio is the good direction. */
  higherIsBetter: boolean;
}

export const RATIOS: RatioSpec[] = [
  { key: 'shoulders_waist', label: 'Shoulders ÷ waist', numerator: 'shoulders', denominator: 'waist', higherIsBetter: true },
  { key: 'shoulders_waist_narrow', label: 'Shoulders ÷ narrowest waist', numerator: 'shoulders', denominator: 'waist_narrow', higherIsBetter: true },
  { key: 'waist_chest', label: 'Waist ÷ chest', numerator: 'waist', denominator: 'chest', higherIsBetter: false },
];

export interface RatioView {
  spec: RatioSpec;
  /** Ratio on each date both were measured, oldest first. */
  series: { date: string; value: number }[];
  latest: { date: string; value: number } | null;
  /** latest − the first point in the series; null with fewer than two points. */
  change: number | null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function measurementRatios(measurements: BodyMeasurement[]): RatioView[] {
  const byTypeDate = new Map<string, number>();
  for (const m of measurements) {
    if (m.type && typeof m.value === 'number' && m.value > 0) byTypeDate.set(`${m.type}|${m.date}`, m.value);
  }
  const dates = [...new Set(measurements.filter(m => m.type).map(m => m.date))].sort();
  return RATIOS.map(spec => {
    const series = dates.flatMap(date => {
      const n = byTypeDate.get(`${spec.numerator}|${date}`);
      const d = byTypeDate.get(`${spec.denominator}|${date}`);
      return n && d ? [{ date, value: round3(n / d) }] : [];
    });
    const latest = series[series.length - 1] ?? null;
    const change = series.length >= 2 && latest ? round3(latest.value - series[0]!.value) : null;
    return { spec, series, latest, change };
  });
}
