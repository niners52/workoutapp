/**
 * Pull body weight (and body fat when present) out of Apple Health into the
 * app's body measurements, once a day, so the weight log has history instead
 * of only the entries typed by hand. Each imported day becomes one untyped
 * measurement with source 'healthkit' and syncs to the cloud like any other.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { BodyMeasurement } from '../types';
import { getBodyFatHistory, getWeightHistory } from './healthKit';
import { addBodyMeasurement, getBodyMeasurements } from './storage';
import { syncBodyMeasurement } from './syncService';

// Key is versioned: widening the window must re-run once on devices that already
// imported under the old window today.
const LAST_IMPORT_KEY = '@workout_tracker/healthkit_weight_import_date_v2';
/** Two years, so PRs on bodyweight exercises use the body weight of the day, not today's. */
export const DEFAULT_IMPORT_DAYS = 730;

export interface BodyWeightImportResult {
  imported: number;
  skipped: 'not_ios' | 'already_today' | null;
}

/** Deterministic id per day so re-running the import never duplicates a row. */
export function healthKitMeasurementId(date: string): string {
  return `hk-body-${date}`;
}

export async function importHealthKitBodyWeights(
  days: number = DEFAULT_IMPORT_DAYS,
  now: Date = new Date(),
): Promise<BodyWeightImportResult> {
  if (Platform.OS !== 'ios') return { imported: 0, skipped: 'not_ios' };

  const today = now.toISOString().slice(0, 10);
  const last = await AsyncStorage.getItem(LAST_IMPORT_KEY).catch(() => null);
  if (last === today) return { imported: 0, skipped: 'already_today' };

  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const [weights, bodyFats] = await Promise.all([
    getWeightHistory(start, now),
    getBodyFatHistory(start, now),
  ]);
  const bodyFatByDate = new Map(bodyFats.map(b => [b.date, b.value]));

  const existing = await getBodyMeasurements();
  const hasWeightOn = new Set(existing.filter(m => !m.type && m.weight != null).map(m => m.date));

  let imported = 0;
  for (const sample of weights) {
    if (hasWeightOn.has(sample.date)) continue; // manual or earlier import wins
    const measurement: BodyMeasurement = {
      id: healthKitMeasurementId(sample.date),
      date: sample.date,
      weight: sample.value,
      ...(bodyFatByDate.has(sample.date) ? { bodyFatPercentage: bodyFatByDate.get(sample.date) } : {}),
      source: 'healthkit',
      syncedAt: now.toISOString(),
    };
    await addBodyMeasurement(measurement);
    syncBodyMeasurement(measurement).catch(e => console.log('Body weight import sync error:', e));
    imported += 1;
  }

  await AsyncStorage.setItem(LAST_IMPORT_KEY, today).catch(() => {});
  if (imported > 0) console.log(`[HealthKit] Imported ${imported} body weight day(s)`);
  return { imported, skipped: null };
}
