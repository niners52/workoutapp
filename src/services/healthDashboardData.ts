/**
 * Loads what the health dashboard needs from the sync layer. Shaping lives in
 * healthDashboard.ts; this file only decides where each piece is read from.
 */
import { format, subDays } from 'date-fns';
import { getCachedNutritionDays } from './nutritionSync';
import { fetchNutritionDays, fetchSleepNight, type NutritionDayRow } from './syncService';
import type { SleepInput } from './healthDashboard';

export interface NutritionLoad {
  today: NutritionDayRow | null;
  /** Newest logged day on or before today; reveals a nutrient the build cannot read. */
  latestLogged: NutritionDayRow | null;
  /** Logged days, newest first (up to 14), for the detail screen. */
  recent: NutritionDayRow[];
  /** Nutrients the phone's build cannot read, when known. */
  unavailable: string[];
  source: 'phone' | 'cloud' | 'none';
  /** When the rows were produced by the HealthKit sync. */
  syncedAt: string | null;
  /** When a sync on this phone saw today's totals change; null when unknown (e.g. read from the cloud). */
  todayChangedAt: string | null;
  error: string | null;
}

/**
 * Reads the rows the nutrition sync last produced on this phone (identical to
 * what it upserted), falling back to the cloud copy before the first sync.
 */
export async function loadNutrition(now: Date = new Date()): Promise<NutritionLoad> {
  const todayKey = format(now, 'yyyy-MM-dd');
  let rows: NutritionDayRow[] = [];
  let source: NutritionLoad['source'] = 'none';
  let syncedAt: string | null = null;
  let unavailable: string[] = [];
  let error: string | null = null;
  let todayChangedAt: string | null = null;

  const cached = await getCachedNutritionDays();
  if (cached) {
    rows = cached.rows;
    source = 'phone';
    syncedAt = cached.syncedAt;
    unavailable = cached.unavailable;
    todayChangedAt = cached.changedAt?.[todayKey] ?? null;
  } else {
    const cloud = await fetchNutritionDays(format(subDays(now, 13), 'yyyy-MM-dd'));
    if (cloud.ok) {
      rows = cloud.data;
      source = 'cloud';
      syncedAt = cloud.data[0]?.synced_at ?? null;
    } else {
      error = cloud.error;
    }
  }

  const logged = rows
    .filter(r => r.sample_count > 0 && r.date <= todayKey)
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    today: logged.find(r => r.date === todayKey) ?? null,
    latestLogged: logged[0] ?? null,
    recent: logged.slice(0, 14),
    unavailable,
    source,
    syncedAt,
    todayChangedAt,
    error,
  };
}

/** Last night = the sleep_nights row keyed to this morning's wake date. */
export async function loadSleep(now: Date = new Date()): Promise<SleepInput> {
  const res = await fetchSleepNight(format(now, 'yyyy-MM-dd'));
  if (res.ok) return { state: 'loaded', night: res.data };
  return res.missingTable ? { state: 'notDeployed' } : { state: 'error', message: res.error };
}
