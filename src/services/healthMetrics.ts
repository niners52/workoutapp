/**
 * Pure builders behind healthMetricsSync.ts: one row per local day of Apple
 * Health metrics, and minutes in heart-rate zones per workout. No I/O, so
 * they are tested directly (__tests__/healthMetricsSync.test.ts).
 */
import type { Workout } from '../types';
import type { BloodPressureReading, HealthKitWorkout, TimedSample } from './healthKit';
import type { DailyHealthMetricRow, WorkoutHrZonesRow } from './syncService';

/** Zone lower bounds as a share of max HR, Z1..Z5. */
export const ZONE_FLOORS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;
/** A gap between heart-rate samples longer than this counts only this long. */
const MAX_SAMPLE_GAP_S = 60;

/** 'YYYY-MM-DD' of an instant in a time zone. */
export function localDate(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;

export interface DailyInputs {
  vo2: TimedSample[];
  restingHr: TimedSample[];
  hrv: TimedSample[];
  steps: TimedSample[];
  activeEnergy: TimedSample[];
  bloodPressure: BloodPressureReading[];
}

/** One row per local day that has any metric. */
export function buildDailyMetrics(input: DailyInputs, timeZone: string, syncedAt: string): DailyHealthMetricRow[] {
  type Acc = {
    vo2?: { at: string; v: number };
    rhr: number[];
    hrv: number[];
    steps?: number;
    energy?: number;
    bp?: { at: string; sys: number; dia: number };
  };
  const days = new Map<string, Acc>();
  const day = (iso: string) => {
    const d = localDate(iso, timeZone);
    const acc = days.get(d) ?? { rhr: [], hrv: [] };
    days.set(d, acc);
    return acc;
  };

  for (const s of input.vo2) {
    const acc = day(s.start);
    if (!acc.vo2 || s.start > acc.vo2.at) acc.vo2 = { at: s.start, v: s.value };
  }
  for (const s of input.restingHr) day(s.start).rhr.push(s.value);
  for (const s of input.hrv) day(s.start).hrv.push(s.value);
  for (const s of input.steps) {
    if (s.value <= 0) continue;
    const acc = day(s.start);
    acc.steps = (acc.steps ?? 0) + s.value;
  }
  for (const s of input.activeEnergy) {
    if (s.value <= 0) continue;
    const acc = day(s.start);
    acc.energy = (acc.energy ?? 0) + s.value;
  }
  for (const r of input.bloodPressure) {
    const acc = day(r.start);
    if (!acc.bp || r.start > acc.bp.at) acc.bp = { at: r.start, sys: r.systolic, dia: r.diastolic };
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return [...days.entries()]
    .map(([date, a]) => {
      const rhr = mean(a.rhr);
      const hrv = mean(a.hrv);
      return {
        id: `hk-day-${date}`,
        date,
        vo2_max: a.vo2 ? round(a.vo2.v, 1) : null,
        resting_hr: rhr === null ? null : round(rhr, 1),
        hrv_sdnn_ms: hrv === null ? null : round(hrv, 1),
        steps: a.steps === undefined ? null : Math.round(a.steps),
        active_energy_kcal: a.energy === undefined ? null : Math.round(a.energy),
        bp_systolic: a.bp ? Math.round(a.bp.sys) : null,
        bp_diastolic: a.bp ? Math.round(a.bp.dia) : null,
        source: 'healthkit',
        synced_at: syncedAt,
      };
    })
    .filter(r =>
      [r.vo2_max, r.resting_hr, r.hrv_sdnn_ms, r.steps, r.active_energy_kcal, r.bp_systolic].some(v => v !== null),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The setting if set, else 220 - age, else null. */
export function maxHeartRateFor(setting: number | undefined | null, age: number | null): number | null {
  if (typeof setting === 'number' && setting >= 100 && setting <= 240) return Math.round(setting);
  if (typeof age === 'number' && age > 0) return 220 - Math.round(age);
  return null;
}

export interface ZoneSummary {
  minutes: [number, number, number, number, number];
  avgHr: number | null;
  peakHr: number | null;
  sampleCount: number;
}

/**
 * Time in each zone. Each sample holds until the next one (at most
 * MAX_SAMPLE_GAP_S, so a dropout does not inflate one zone); the last holds
 * until the workout ends, under the same cap.
 */
export function computeHrZones(samples: TimedSample[], workoutStart: string, workoutEnd: string, maxHr: number): ZoneSummary {
  const from = new Date(workoutStart).getTime();
  const to = new Date(workoutEnd).getTime();
  const inside = samples
    .map(s => ({ t: new Date(s.start).getTime(), v: s.value }))
    .filter(s => s.t >= from && s.t <= to && s.v > 0)
    .sort((a, b) => a.t - b.t);
  const seconds = [0, 0, 0, 0, 0];
  let weighted = 0;
  let total = 0;
  let peak = 0;
  inside.forEach((s, i) => {
    const next = i + 1 < inside.length ? inside[i + 1]!.t : to;
    const dt = Math.min(Math.max(0, (next - s.t) / 1000), MAX_SAMPLE_GAP_S);
    weighted += s.v * dt;
    total += dt;
    peak = Math.max(peak, s.v);
    const pct = s.v / maxHr;
    let zone = -1;
    ZONE_FLOORS.forEach((floor, z) => {
      if (pct >= floor) zone = z;
    });
    if (zone >= 0) seconds[zone]! += dt;
  });
  const m = seconds.map(x => round(x / 60, 1)) as ZoneSummary['minutes'];
  return {
    minutes: m,
    avgHr: total > 0 ? round(weighted / total, 0) : null,
    peakHr: inside.length ? round(peak, 0) : null,
    sampleCount: inside.length,
  };
}

/** The app workout that overlaps this one for at least half the shorter of the two. */
export function matchAppWorkout(hk: { start: string; end: string }, workouts: Pick<Workout, 'id' | 'startedAt' | 'completedAt'>[]): string | null {
  const hs = new Date(hk.start).getTime();
  const he = new Date(hk.end).getTime();
  let best: { id: string; overlap: number } | null = null;
  for (const w of workouts) {
    if (!w.completedAt) continue;
    const ws = new Date(w.startedAt).getTime();
    const we = new Date(w.completedAt).getTime();
    const overlap = Math.min(he, we) - Math.max(hs, ws);
    const shorter = Math.min(he - hs, we - ws);
    if (overlap > 0 && shorter > 0 && overlap >= shorter / 2 && (!best || overlap > best.overlap)) best = { id: w.id, overlap };
  }
  return best?.id ?? null;
}

export function buildZonesRow(
  hk: HealthKitWorkout,
  samples: TimedSample[],
  maxHr: number,
  appWorkouts: Pick<Workout, 'id' | 'startedAt' | 'completedAt'>[],
  syncedAt: string,
): WorkoutHrZonesRow {
  const z = computeHrZones(samples, hk.start, hk.end, maxHr);
  const durationMin = hk.duration > 0 ? hk.duration : (new Date(hk.end).getTime() - new Date(hk.start).getTime()) / 60000;
  return {
    id: `hk-zones-${hk.id}`,
    hk_workout_id: hk.id,
    workout_id: matchAppWorkout(hk, appWorkouts),
    activity_name: hk.activityName || null,
    start_at: hk.start,
    end_at: hk.end,
    duration_min: round(durationMin, 1),
    max_hr_used: maxHr,
    avg_hr: z.avgHr,
    peak_hr: z.peakHr,
    z1_min: z.minutes[0],
    z2_min: z.minutes[1],
    z3_min: z.minutes[2],
    z4_min: z.minutes[3],
    z5_min: z.minutes[4],
    sample_count: z.sampleCount,
    synced_at: syncedAt,
  };
}
