/**
 * Pull body weight (and body fat when present) out of Apple Health into the
 * app's body measurements, so the weight log has history instead of only the
 * entries typed by hand. Each imported day becomes one untyped measurement with
 * source 'healthkit' and syncs to the cloud like any other.
 *
 * The first run on a phone backfills DEFAULT_IMPORT_DAYS. After that each run
 * re-reads only the last RECENT_DAYS, at most every MIN_INTERVAL_MS unless
 * forced, so a weigh-in shows up the same day instead of the next one.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { BodyMeasurement } from '../types';
import { getBodyFatHistory, getWeightHistory } from './healthKit';
import { addBodyMeasurement, getBodyMeasurements } from './storage';
import { syncBodyMeasurement } from './syncService';

// Set once the full backfill has run. Versioned: widening the backfill window
// must re-run it once on devices that already backfilled.
const BACKFILL_DONE_KEY = '@workout_tracker/healthkit_weight_import_date_v2';
const LAST_IMPORT_AT_KEY = '@workout_tracker/healthkit_weight_import_at';
/** Two years, so PRs on bodyweight exercises use the body weight of the day, not today's. */
export const DEFAULT_IMPORT_DAYS = 730;
const RECENT_DAYS = 14;
const MIN_INTERVAL_MS = 15 * 60 * 1000;

export interface BodyWeightImportResult {
  imported: number;
  skipped: 'not_ios' | 'throttled' | null;
}

/** Deterministic id per day so re-running the import never duplicates a row. */
export function healthKitMeasurementId(date: string): string {
  return `hk-body-${date}`;
}

export async function importHealthKitBodyWeights(
  { force = false, now = new Date() }: { force?: boolean; now?: Date } = {},
): Promise<BodyWeightImportResult> {
  if (Platform.OS !== 'ios') return { imported: 0, skipped: 'not_ios' };

  const [backfilled, lastAt] = await Promise.all([
    AsyncStorage.getItem(BACKFILL_DONE_KEY).catch(() => null),
    AsyncStorage.getItem(LAST_IMPORT_AT_KEY).catch(() => null),
  ]);
  if (backfilled && !force && now.getTime() - (Number(lastAt) || 0) < MIN_INTERVAL_MS) {
    return { imported: 0, skipped: 'throttled' };
  }

  const days = backfilled ? RECENT_DAYS : DEFAULT_IMPORT_DAYS;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const [weights, bodyFats] = await Promise.all([
    getWeightHistory(start, now),
    getBodyFatHistory(start, now),
  ]);
  const bodyFatByDate = new Map(bodyFats.map(b => [b.date, b.value]));

  const existing = await getBodyMeasurements();
  const weightRows = new Map(existing.filter(m => !m.type && m.weight != null).map(m => [m.date, m]));

  let imported = 0;
  for (const sample of weights) {
    const row = weightRows.get(sample.date);
    const bodyFat = bodyFatByDate.get(sample.date);
    if (row && row.source !== 'healthkit') continue; // a manual entry wins
    // Unchanged day: skip. A re-weigh later the same day replaces the value.
    if (row && row.weight === sample.value && (bodyFat === undefined || row.bodyFatPercentage === bodyFat)) continue;
    const measurement: BodyMeasurement = {
      id: row?.id ?? healthKitMeasurementId(sample.date),
      date: sample.date,
      weight: sample.value,
      ...(bodyFat !== undefined ? { bodyFatPercentage: bodyFat } : {}),
      source: 'healthkit',
      syncedAt: now.toISOString(),
    };
    await addBodyMeasurement(measurement);
    syncBodyMeasurement(measurement).catch(e => console.log('Body weight import sync error:', e));
    imported += 1;
  }

  await Promise.all([
    AsyncStorage.setItem(BACKFILL_DONE_KEY, backfilled ?? now.toISOString().slice(0, 10)),
    AsyncStorage.setItem(LAST_IMPORT_AT_KEY, String(now.getTime())),
  ]).catch(() => {});
  if (imported > 0) console.log(`[HealthKit] Imported ${imported} body weight day(s)`);
  return { imported, skipped: null };
}
