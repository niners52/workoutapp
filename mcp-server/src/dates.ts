/**
 * Week bucketing in a fixed IANA time zone. The app buckets by the phone's local
 * date; the server runs in UTC, so it evaluates each timestamp in TIMEZONE first.
 */

export type WeekStartDay = 'sunday' | 'monday';

export interface LocalDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  weekday: number; // 0 = Sunday .. 6 = Saturday
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function toLocalDate(date: Date, timeZone: string): LocalDate {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

/** Calendar arithmetic on a y-m-d triple, independent of time zone. */
export function addDays(d: { year: number; month: number; day: number }, n: number): { year: number; month: number; day: number } {
  const t = Date.UTC(d.year, d.month - 1, d.day + n);
  const u = new Date(t);
  return { year: u.getUTCFullYear(), month: u.getUTCMonth() + 1, day: u.getUTCDate() };
}

export function ymd(d: { year: number; month: number; day: number }): string {
  const mm = String(d.month).padStart(2, '0');
  const dd = String(d.day).padStart(2, '0');
  return `${d.year}-${mm}-${dd}`;
}

/** 'YYYY-MM-DD' of the week containing `date`, per the app's week-start setting. */
export function weekStartKey(date: Date, timeZone: string, weekStartDay: WeekStartDay): string {
  const local = toLocalDate(date, timeZone);
  const startOffset = weekStartDay === 'monday' ? 1 : 0;
  const daysSinceStart = (local.weekday - startOffset + 7) % 7;
  return ymd(addDays(local, -daysSinceStart));
}

export function weekEndKey(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number) as [number, number, number];
  return ymd(addDays({ year: y, month: m, day: d }, 6));
}

/**
 * Week-start keys for the last `weeksBack` weeks ending with the current week,
 * oldest first.
 */
export function recentWeekStarts(now: Date, weeksBack: number, timeZone: string, weekStartDay: WeekStartDay): string[] {
  const current = weekStartKey(now, timeZone, weekStartDay);
  const [y, m, d] = current.split('-').map(Number) as [number, number, number];
  const keys: string[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    keys.push(ymd(addDays({ year: y, month: m, day: d }, -7 * i)));
  }
  return keys;
}

/**
 * A UTC instant safely before the start of the oldest week, used as the
 * database lower bound. Padded by one day so time-zone offsets can't clip it.
 */
export function lowerBoundIso(oldestWeekStart: string): string {
  const [y, m, d] = oldestWeekStart.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString();
}
