/**
 * Sleep sync: Apple Health sleep samples -> sleep_nights in Supabase.
 *
 * Same mechanism and cadence as nutritionSync.ts: runs on launch after
 * HealthKit initializes, at most every MIN_INTERVAL_MS, re-upserting the
 * trailing SLEEP_WINDOW_DAYS. Nights with no samples are never written.
 * Read-only against HealthKit.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { startOfDay, subDays } from 'date-fns';
import { fetchSleepSamples } from './healthKit';
import { buildSleepNights } from './sleepNights';
import { syncSleepNights } from './syncService';

const LAST_SYNC_KEY = '@workout_tracker/sleep_sync_at';
export const SLEEP_WINDOW_DAYS = 30;
const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface SleepSyncResult {
  nights: number;
  skipped: 'not_ios' | 'throttled' | 'unavailable' | null;
}

export async function syncSleepFromHealthKit(force: boolean = false, now: Date = new Date()): Promise<SleepSyncResult> {
  if (Platform.OS !== 'ios') return { nights: 0, skipped: 'not_ios' };

  const last = Number(await AsyncStorage.getItem(LAST_SYNC_KEY).catch(() => null)) || 0;
  if (!force && now.getTime() - last < MIN_INTERVAL_MS) return { nights: 0, skipped: 'throttled' };

  // One extra day so the evening segments of the oldest night are included.
  const start = startOfDay(subDays(now, SLEEP_WINDOW_DAYS));
  const samples = await fetchSleepSamples(start, now);
  if (samples === null) return { nights: 0, skipped: 'unavailable' };

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const rows = buildSleepNights(samples, tz, now.toISOString());
  if (rows.length > 0) await syncSleepNights(rows);
  await AsyncStorage.setItem(LAST_SYNC_KEY, String(now.getTime())).catch(() => {});
  console.log(`[Sleep] Synced ${rows.length} night(s) from ${samples.length} HealthKit samples`);
  return { nights: rows.length, skipped: null };
}
