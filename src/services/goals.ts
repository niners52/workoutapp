/**
 * Goals: weight band, tape measurements and lifts. The rows live in the
 * Supabase `goals` table (seeded there); the phone reads them, keeps a copy for
 * offline, and works out progress from its own logs.
 *
 * Progress:
 * - weight_band: the 7-day average of morning weigh-ins (one weight per day,
 *   the day's first reading) against the band. In band = met.
 * - measurement: the latest value ("arms" = the mean of the latest left and
 *   right arm) against the target, either direction.
 * - lift: the best working set in the last LIFT_WINDOW_DAYS, compared by
 *   estimated 1RM (Epley) with the target weight × reps. A bodyweight lift
 *   counts body weight plus the added weight. Met once one set reaches both
 *   the target weight and the target reps.
 */
import type { BodyMeasurement, Exercise, Goal, WorkoutSet } from '../types';

export const LIFT_WINDOW_DAYS = 84;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GoalProgress {
  goal: Goal;
  /** 0..1 toward the target (1 = met). Null when there is nothing to measure yet. */
  fraction: number | null;
  met: boolean;
  /** "178.2 lb avg (7 days)", "48.5 in", "260 × 6". */
  current: string | null;
  /** "1.2 lb above the band", "1.5 in to go", "Nov 17". */
  detail: string | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Epley; reps 1 is the weight itself. */
export function e1rm(load: number, reps: number): number {
  return reps <= 1 ? load : load * (1 + reps / 30);
}

/** One weight per day (a manual entry wins over Apple Health), newest first. */
export function dailyWeights(measurements: BodyMeasurement[]): { date: string; weight: number }[] {
  const byDate = new Map<string, BodyMeasurement>();
  for (const m of measurements) {
    if (m.type || typeof m.weight !== 'number') continue;
    const prev = byDate.get(m.date);
    if (!prev || (prev.source !== 'manual' && m.source === 'manual')) byDate.set(m.date, m);
  }
  return [...byDate.values()]
    .map(m => ({ date: m.date, weight: m.weight as number }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function latestTyped(measurements: BodyMeasurement[], type: string): BodyMeasurement | undefined {
  return measurements
    .filter(m => m.type === type && typeof m.value === 'number')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

function measurementValue(measurements: BodyMeasurement[], key: string): { value: number; date: string } | null {
  if (key === 'arms') {
    const l = latestTyped(measurements, 'left_arm');
    const r = latestTyped(measurements, 'right_arm');
    const both = [l, r].filter((m): m is BodyMeasurement => !!m);
    if (both.length === 0) return null;
    const date = both.map(m => m.date).sort().pop()!;
    return { value: both.reduce((a, m) => a + (m.value as number), 0) / both.length, date };
  }
  const m = latestTyped(measurements, key);
  return m ? { value: m.value as number, date: m.date } : null;
}

export function goalProgress(
  goal: Goal,
  ctx: { measurements: BodyMeasurement[]; sets: WorkoutSet[]; exercises: Exercise[]; now?: Date },
): GoalProgress {
  const now = ctx.now ?? new Date();
  const none: GoalProgress = { goal, fraction: null, met: false, current: null, detail: null };

  if (goal.type === 'weight_band') {
    const since = ymd(new Date(now.getTime() - 6 * DAY_MS));
    const week = dailyWeights(ctx.measurements).filter(w => w.date >= since && w.date <= ymd(now));
    if (week.length === 0) return { ...none, detail: 'No weigh-ins in the last 7 days' };
    const avg = week.reduce((a, w) => a + w.weight, 0) / week.length;
    const lo = goal.target;
    const hi = goal.targetMax ?? goal.target;
    const met = avg >= lo && avg <= hi;
    const off = avg < lo ? lo - avg : avg > hi ? avg - hi : 0;
    // 1 inside the band, falling off by a tenth per lb outside it.
    const fraction = Math.max(0, 1 - off / 10);
    return {
      goal,
      fraction,
      met,
      current: `${r1(avg)} lb avg (${week.length} day${week.length === 1 ? '' : 's'})`,
      detail: met ? `In band ${lo}–${hi}` : `${r1(off)} lb ${avg > hi ? 'above' : 'below'} ${lo}–${hi}`,
    };
  }

  if (goal.type === 'measurement') {
    const m = measurementValue(ctx.measurements, goal.metricKey);
    if (!m) return { ...none, detail: 'Not measured yet' };
    const atMost = goal.direction === 'at_most';
    const met = atMost ? m.value <= goal.target : m.value >= goal.target;
    const fraction = Math.min(1, atMost ? goal.target / m.value : m.value / goal.target);
    const gap = r1(Math.abs(goal.target - m.value));
    return {
      goal,
      fraction,
      met,
      current: `${r1(m.value)} in`,
      detail: met ? `Target ${atMost ? '≤' : ''}${goal.target} in reached` : `${gap} in to go · target ${atMost ? '≤ ' : ''}${goal.target}`,
    };
  }

  // lift
  const exercise = ctx.exercises.find(e => e.id === goal.metricKey);
  const bodyweightLift = !!exercise && (exercise.isBodyweight ?? exercise.equipment === 'bodyweight');
  const bw = bodyweightLift ? dailyWeights(ctx.measurements)[0]?.weight ?? 0 : 0;
  const from = now.getTime() - LIFT_WINDOW_DAYS * DAY_MS;
  const sets = ctx.sets.filter(
    s => s.exerciseId === goal.metricKey && !s.isWarmup && s.reps > 0 && new Date(s.loggedAt).getTime() >= from,
  );
  if (sets.length === 0) return { ...none, detail: `No sets in the last ${LIFT_WINDOW_DAYS / 7} weeks` };
  const reps = goal.targetReps ?? 1;
  const targetE = e1rm(bw + goal.target, reps);
  const best = sets.reduce((a, s) => (e1rm(bw + s.weight, s.reps) > e1rm(bw + a.weight, a.reps) ? s : a));
  const met = sets.some(s => s.weight >= goal.target && s.reps >= reps);
  const fraction = Math.min(1, e1rm(bw + best.weight, best.reps) / targetE);
  const shown = (w: number) => (bodyweightLift ? (w > 0 ? `BW + ${w}` : 'BW') : `${w}`);
  return {
    goal,
    fraction: met ? 1 : fraction,
    met,
    current: `${shown(best.weight)} × ${best.reps}`,
    detail: `${met ? 'Reached' : 'Target'} ${shown(goal.target)} × ${reps}`,
  };
}

// ─── Rows ───────────────────────────────────────────────────────────────────

export function goalFromRow(row: any): Goal {
  return {
    id: row.id,
    type: row.type,
    metricKey: row.metric_key,
    label: row.label,
    target: Number(row.target),
    ...(row.target_max != null ? { targetMax: Number(row.target_max) } : {}),
    ...(row.target_reps != null ? { targetReps: Number(row.target_reps) } : {}),
    direction: row.direction ?? 'at_least',
    ...(row.target_date ? { targetDate: row.target_date } : {}),
    sortOrder: row.sort_order ?? 0,
  };
}
