/**
 * Nutrition sync: Cronometer -> Apple Health -> nutrition_days in Supabase.
 *
 * Same shape as the body-weight import (bodyWeightImport.ts): read HealthKit,
 * bucket by the device's local calendar day, upsert to the cloud. Differences
 * that matter:
 *   - The trailing NUTRITION_WINDOW_DAYS are re-upserted on every sync because
 *     Cronometer entries get edited after the fact.
 *   - A day with no samples is never written (so a row means "logged"), and a
 *     nutrient this build cannot read is stored as null rather than 0.
 *   - Runs on launch after HealthKit initializes, at most every MIN_INTERVAL_MS.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { format, startOfDay, subDays } from 'date-fns';
import { fetchNutritionSamples } from './healthKit';
import { syncNutritionDays, type NutritionDayRow } from './syncService';

const LAST_SYNC_KEY = '@workout_tracker/nutrition_sync_at';
export const NUTRITION_WINDOW_DAYS = 30;
const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000;

type NutrientColumn = Exclude<keyof NutritionDayRow, 'id' | 'date' | 'sample_count' | 'source' | 'synced_at'>;

/** HealthKit getter per column. Default units in the native library: kcal, g, mg, mcg, IU. */
export const NUTRIENT_GETTERS: ReadonlyArray<{ column: NutrientColumn; method: string }> = [
  { column: 'calories', method: 'getEnergyConsumedSamples' },
  { column: 'protein_g', method: 'getProteinSamples' },
  { column: 'carbs_g', method: 'getCarbohydratesSamples' },
  { column: 'fat_g', method: 'getTotalFatSamples' },
  { column: 'fiber_g', method: 'getFiberSamples' },
  { column: 'iron_mg', method: 'getIronSamples' },
  { column: 'vitamin_b12_mcg', method: 'getVitaminB12Samples' },
  { column: 'vitamin_d_iu', method: 'getVitaminDSamples' },
  { column: 'calcium_mg', method: 'getCalciumSamples' },
  { column: 'zinc_mg', method: 'getZincSamples' },
  { column: 'sodium_mg', method: 'getSodiumSamples' },
];

export function nutritionDayId(date: string): string {
  return `hk-nutrition-${date}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface NutritionBuildResult {
  rows: NutritionDayRow[];
  /** Columns this build cannot read (getter missing in the native library). */
  unavailable: NutrientColumn[];
}

/**
 * Pure bucketing step, given the samples per column (null = getter unavailable).
 * Exported for tests; the HealthKit reads happen in buildNutritionDays.
 */
export function bucketNutritionSamples(
  samplesByColumn: Partial<Record<NutrientColumn, Array<{ value: number; startDate: string }> | null>>,
  syncedAt: string,
): NutritionBuildResult {
  const days = new Map<string, { sums: Partial<Record<NutrientColumn, number>>; count: number }>();
  const unavailable: NutrientColumn[] = [];

  for (const { column } of NUTRIENT_GETTERS) {
    const samples = samplesByColumn[column];
    if (samples === null || samples === undefined) {
      unavailable.push(column);
      continue;
    }
    for (const s of samples) {
      // Device-local day, so it lines up with Cronometer's own day boundaries.
      const date = format(new Date(s.startDate), 'yyyy-MM-dd');
      const day = days.get(date) ?? { sums: {}, count: 0 };
      day.sums[column] = (day.sums[column] ?? 0) + s.value;
      day.count += 1;
      days.set(date, day);
    }
  }

  const rows: NutritionDayRow[] = [];
  for (const [date, day] of days) {
    if (day.count === 0) continue;
    const row: NutritionDayRow = {
      id: nutritionDayId(date),
      date,
      calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null,
      iron_mg: null, vitamin_b12_mcg: null, vitamin_d_iu: null, calcium_mg: null, zinc_mg: null, sodium_mg: null,
      sample_count: day.count,
      source: 'healthkit',
      synced_at: syncedAt,
    };
    for (const { column } of NUTRIENT_GETTERS) {
      if (unavailable.includes(column)) continue; // stays null: unreadable, not zero
      row[column] = round1(day.sums[column] ?? 0);
    }
    rows.push(row);
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return { rows, unavailable };
}

export async function buildNutritionDays(days: number = NUTRITION_WINDOW_DAYS, now: Date = new Date()): Promise<NutritionBuildResult> {
  const start = startOfDay(subDays(now, days - 1));
  const samplesByColumn: Partial<Record<NutrientColumn, Array<{ value: number; startDate: string }> | null>> = {};
  await Promise.all(
    NUTRIENT_GETTERS.map(async ({ column, method }) => {
      samplesByColumn[column] = await fetchNutritionSamples(method, start, now);
    }),
  );
  return bucketNutritionSamples(samplesByColumn, now.toISOString());
}

export interface NutritionSyncResult {
  days: number;
  unavailable: NutrientColumn[];
  skipped: 'not_ios' | 'throttled' | null;
}

export async function syncNutritionFromHealthKit(force: boolean = false, now: Date = new Date()): Promise<NutritionSyncResult> {
  if (Platform.OS !== 'ios') return { days: 0, unavailable: [], skipped: 'not_ios' };

  const last = Number(await AsyncStorage.getItem(LAST_SYNC_KEY).catch(() => null)) || 0;
  if (!force && now.getTime() - last < MIN_INTERVAL_MS) return { days: 0, unavailable: [], skipped: 'throttled' };

  const { rows, unavailable } = await buildNutritionDays(NUTRITION_WINDOW_DAYS, now);
  if (rows.length > 0) await syncNutritionDays(rows);
  await AsyncStorage.setItem(LAST_SYNC_KEY, String(now.getTime())).catch(() => {});
  console.log(
    `[Nutrition] Synced ${rows.length} day(s) from HealthKit` +
      (unavailable.length ? ` (unreadable in this build: ${unavailable.join(', ')})` : ''),
  );
  return { days: rows.length, unavailable, skipped: null };
}
