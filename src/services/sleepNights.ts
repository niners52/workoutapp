/**
 * Sleep nights: raw HealthKit sleep samples -> one row per night.
 *
 * Pure module (no React Native imports) so it runs under `npm run test:unit`.
 * Rules, matching the spec for the sleep_nights table:
 *   - A night is keyed to the local date it ENDS on (wake date). A segment that
 *     ends at or after 6 PM local belongs to the following morning, so a
 *     bedtime nap before midnight still lands on the same night as the sleep
 *     that follows it.
 *   - Sources are never added together. Per night, only the highest-priority
 *     source is kept (Apple Watch over iPhone over anything else).
 *   - Overlapping samples of the same kind are merged (union of intervals)
 *     before counting minutes, so duplicated segments are not double counted.
 *   - Stage minutes are null when the source recorded no stages; awake_min is
 *     null when no AWAKE segments exist. A night with zero asleep minutes
 *     (in-bed only) is skipped rather than written as zeros.
 */
import type { SleepNightRow } from './syncService';

export interface RawSleepSample {
  /** HealthKit category: INBED | ASLEEP | AWAKE | CORE | DEEP | REM (case-insensitive). */
  value: string;
  startDate: string;
  endDate: string;
  sourceName?: string;
  sourceId?: string;
}

export type SleepNight = SleepNightRow;

type Kind = 'INBED' | 'ASLEEP' | 'AWAKE' | 'CORE' | 'DEEP' | 'REM';
const KINDS: Kind[] = ['INBED', 'ASLEEP', 'AWAKE', 'CORE', 'DEEP', 'REM'];

export function kindOf(value: string): Kind | null {
  const v = value.trim().toUpperCase();
  return (KINDS as string[]).includes(v) ? (v as Kind) : null;
}

/** Lower is better. Watch 0, iPhone 1, everything else 2. */
export function sourcePriority(sourceName: string | undefined): number {
  const s = (sourceName ?? '').toLowerCase();
  if (s.includes('watch')) return 0;
  if (s.includes('iphone')) return 1;
  return 2;
}

export function sleepNightId(date: string): string {
  return `hk-sleep-${date}`;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** Local calendar date and hour of an instant in the given IANA zone. */
export function localParts(iso: string, tz: string): { date: string; hour: number } {
  const parts = formatter(tz).formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  const hour = Number(get('hour')) % 24;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour };
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Night (wake date) a sleep segment belongs to, from its end instant. */
export function nightDateFor(endIso: string, tz: string): string {
  const { date, hour } = localParts(endIso, tz);
  return hour >= 18 ? shiftDate(date, 1) : date;
}

/** Total minutes covered by the union of the intervals (overlaps counted once). */
export function mergedMinutes(intervals: Array<{ start: number; end: number }>): number {
  const sorted = intervals
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const i of sorted) {
    if (i.start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = i.start;
      curEnd = i.end;
    } else if (i.end > curEnd) {
      curEnd = i.end;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return Math.round(total / 60000);
}

interface Segment { kind: Kind; start: number; end: number; priority: number; source: string }

export function buildSleepNights(samples: RawSleepSample[], tz: string, syncedAt: string): SleepNight[] {
  const byNight = new Map<string, Segment[]>();
  for (const s of samples) {
    const kind = kindOf(s.value);
    if (!kind) continue;
    const start = Date.parse(s.startDate);
    const end = Date.parse(s.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const night = nightDateFor(s.endDate, tz);
    const list = byNight.get(night) ?? [];
    list.push({ kind, start, end, priority: sourcePriority(s.sourceName), source: s.sourceName ?? 'unknown' });
    byNight.set(night, list);
  }

  const rows: SleepNight[] = [];
  for (const [date, all] of byNight) {
    const best = Math.min(...all.map(s => s.priority));
    const segs = all.filter(s => s.priority === best); // one source only, never summed across
    const of = (kind: Kind) => segs.filter(s => s.kind === kind).map(s => ({ start: s.start, end: s.end }));

    const stageIntervals = [...of('CORE'), ...of('DEEP'), ...of('REM')];
    const hasStages = stageIntervals.length > 0;
    const asleepMin = hasStages ? mergedMinutes(stageIntervals) : mergedMinutes(of('ASLEEP'));
    if (asleepMin <= 0) continue; // in-bed only: nothing to report

    const sleepSegs = segs.filter(s => s.kind !== 'INBED');
    const bedtime = Math.min(...sleepSegs.map(s => s.start));
    const wake = Math.max(...sleepSegs.map(s => s.end));
    const inBedMin = of('INBED').length > 0 ? mergedMinutes(of('INBED')) : Math.round((wake - bedtime) / 60000);
    const awake = of('AWAKE');

    rows.push({
      id: sleepNightId(date),
      date,
      time_asleep_min: asleepMin,
      time_in_bed_min: Math.max(inBedMin, asleepMin),
      bedtime: new Date(bedtime).toISOString(),
      wake_time: new Date(wake).toISOString(),
      deep_min: hasStages ? mergedMinutes(of('DEEP')) : null,
      rem_min: hasStages ? mergedMinutes(of('REM')) : null,
      core_min: hasStages ? mergedMinutes(of('CORE')) : null,
      awake_min: awake.length > 0 ? mergedMinutes(awake) : null,
      sample_count: segs.length,
      source: segs[0]?.source ?? 'unknown',
      synced_at: syncedAt,
    });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}
