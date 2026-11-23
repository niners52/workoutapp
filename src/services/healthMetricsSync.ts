/**
 * Apple Health -> daily_health_metrics and workout_hr_zones in Supabase.
 *
 * Same shape as sleepSync.ts and bodyWeightImport.ts: runs after HealthKit
 * initializes, at most every MIN_INTERVAL_MS. The first run on a phone
 * backfills (BACKFILL_DAYS of daily metrics, ZONES_BACKFILL_DAYS of workouts);
 * after that each run re-reads the trailing RECENT_DAYS. Rows are keyed by day
 * (hk-day-YYYY-MM-DD) and by HealthKit workout id, so re-running never
 * duplicates. Read-only against HealthKit.
 *
 * Daily values: VO2 max = the day's latest estimate; resting HR and HRV (SDNN)
 * = the day's average; steps and active energy = the day's total; blood
 * pressure = the day's last reading. A day with none of them is not written.
 *
 * Heart-rate zones are cut from max HR: Z1 50-60 %, Z2 60-70 %, Z3 70-80 %,
 * Z4 80-90 %, Z5 90 % and up; below 50 % counts toward no zone. Max HR is the
 * setting (Health targets -> Max heart rate) or 220 - age from Apple Health's
 * date of birth; with neither, zones are skipped.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  fetchActiveEnergyBuckets,
  fetchBloodPressureReadings,
  fetchHeartRateSamples,
  fetchHrvSamples,
  fetchRestingHeartRateSamples,
  fetchStepBuckets,
  fetchVo2MaxSamples,
  getAgeFromHealthKit,
  getWorkoutsFromHealthKit,
} from './healthKit';
import { buildDailyMetrics, buildZonesRow, maxHeartRateFor } from './healthMetrics';
import { getUserSettings, getWorkouts } from './storage';
import { syncDailyHealthMetrics, syncWorkoutHrZones, type WorkoutHrZonesRow } from './syncService';

const BACKFILL_DONE_KEY = '@workout_tracker/health_metrics_backfill_v1';
const LAST_SYNC_KEY = '@workout_tracker/health_metrics_sync_at';
export const BACKFILL_DAYS = 365;
export const ZONES_BACKFILL_DAYS = 180;
const RECENT_DAYS = 14;
const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Runner ─────────────────────────────────────────────────────────────────

export interface HealthMetricsSyncResult {
  days: number;
  workouts: number;
  skipped: 'not_ios' | 'throttled' | null;
  /** Why zones were not computed, when they were not. */
  zonesSkipped?: 'no_max_hr';
}

export async function syncHealthMetricsFromHealthKit(
  { force = false, now = new Date() }: { force?: boolean; now?: Date } = {},
): Promise<HealthMetricsSyncResult> {
  if (Platform.OS !== 'ios') return { days: 0, workouts: 0, skipped: 'not_ios' };

  const [backfilled, lastRaw] = await Promise.all([
    AsyncStorage.getItem(BACKFILL_DONE_KEY).catch(() => null),
    AsyncStorage.getItem(LAST_SYNC_KEY).catch(() => null),
  ]);
  if (backfilled && !force && now.getTime() - (Number(lastRaw) || 0) < MIN_INTERVAL_MS) {
    return { days: 0, workouts: 0, skipped: 'throttled' };
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const syncedAt = now.toISOString();
  const metricsStart = new Date(now.getTime() - (backfilled ? RECENT_DAYS : BACKFILL_DAYS) * DAY_MS);

  const [vo2, restingHr, hrv, steps, activeEnergy, bloodPressure] = await Promise.all([
    fetchVo2MaxSamples(metricsStart, now),
    fetchRestingHeartRateSamples(metricsStart, now),
    fetchHrvSamples(metricsStart, now),
    fetchStepBuckets(metricsStart, now),
    fetchActiveEnergyBuckets(metricsStart, now),
    fetchBloodPressureReadings(metricsStart, now),
  ]);
  const rows = buildDailyMetrics(
    {
      vo2: vo2 ?? [],
      restingHr: restingHr ?? [],
      hrv: hrv ?? [],
      steps: steps ?? [],
      activeEnergy: activeEnergy ?? [],
      bloodPressure: bloodPressure ?? [],
    },
    tz,
    syncedAt,
  );
  if (rows.length > 0) await syncDailyHealthMetrics(rows);

  // Workout heart-rate zones.
  const settings = await getUserSettings();
  const maxHr = maxHeartRateFor(settings.healthTargets?.maxHeartRate, await getAgeFromHealthKit());
  const zoneRows: WorkoutHrZonesRow[] = [];
  if (maxHr !== null) {
    const zonesStart = new Date(now.getTime() - (backfilled ? RECENT_DAYS : ZONES_BACKFILL_DAYS) * DAY_MS);
    const [hkWorkouts, appWorkouts] = await Promise.all([getWorkoutsFromHealthKit(zonesStart, now), getWorkouts()]);
    for (const hk of hkWorkouts) {
      if (!hk.start || !hk.end || hk.id.startsWith('hk-')) continue; // no real HealthKit id
      const samples = await fetchHeartRateSamples(new Date(hk.start), new Date(hk.end));
      if (samples === null) continue; // could not read: try again next run
      zoneRows.push(buildZonesRow(hk, samples, maxHr, appWorkouts, syncedAt));
    }
    if (zoneRows.length > 0) await syncWorkoutHrZones(zoneRows);
  }

  await Promise.all([
    AsyncStorage.setItem(BACKFILL_DONE_KEY, backfilled ?? syncedAt.slice(0, 10)),
    AsyncStorage.setItem(LAST_SYNC_KEY, String(now.getTime())),
  ]).catch(() => {});
  console.log(`[HealthMetrics] Synced ${rows.length} day(s), ${zoneRows.length} workout zone row(s)${maxHr === null ? ' (no max HR: zones skipped)' : ''}`);
  return { days: rows.length, workouts: zoneRows.length, skipped: null, ...(maxHr === null ? { zonesSkipped: 'no_max_hr' as const } : {}) };
}
