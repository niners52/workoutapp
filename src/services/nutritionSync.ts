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
 *     The home dashboard asks with a shorter interval and forces on pull-to-refresh.
 *   - The rows from the latest sync are also kept on the phone, so the dashboard
 *     reads exactly what was synced even when the cloud is unreachable.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { format, startOfDay, subDays } from 'date-fns';
import { fetchNutritionSamples } from './healthKit';
import { syncNutritionDays, type NutritionDayRow } from './syncService';

const LAST_SYNC_KEY = '@workout_tracker/nutrition_sync_at';
const CACHE_KEY = '@workout_tracker/nutrition_days_cache';
export const NUTRITION_WINDOW_DAYS = 30;
export const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000;

type NutrientColumn = Exclude<keyof NutritionDayRow, 'id' | 'date' | 'sample_count' | 'source' | 'synced_at' | 'last_sample_at'>;

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
  const days = new Map<string, { sums: Partial<Record<NutrientColumn, number>>; count: number; lastMs: number }>();
  const unavailable: NutrientColumn[] = [];

  for (const { column } of NUTRIENT_GETTERS) {
    const samples = samplesByColumn[column];
    if (samples === null || samples === undefined) {
      unavailable.push(column);
      continue;
    }
    for (const s of samples) {
      const start = new Date(s.startDate);
      // Device-local day, so it lines up with Cronometer's own day boundaries.
      const date = format(start, 'yyyy-MM-dd');
      const day = days.get(date) ?? { sums: {}, count: 0, lastMs: 0 };
      day.sums[column] = (day.sums[column] ?? 0) + s.value;
      day.count += 1;
      day.lastMs = Math.max(day.lastMs, start.getTime());
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
      last_sample_at: day.lastMs > 0 ? new Date(day.lastMs).toISOString() : null,
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

export interface CachedNutritionDays extends NutritionBuildResult {
  syncedAt: string;
}

/** Rows from the most recent sync on this phone, newest first; null before the first sync. */
export async function getCachedNutritionDays(): Promise<CachedNutritionDays | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedNutritionDays) : null;
  } catch {
    return null;
  }
}

export interface NutritionSyncResult {
  days: number;
  unavailable: NutrientColumn[];
  skipped: 'not_ios' | 'throttled' | null;
}

export async function syncNutritionFromHealthKit(
  force: boolean = false,
  now: Date = new Date(),
  minIntervalMs: number = MIN_INTERVAL_MS,
): Promise<NutritionSyncResult> {
  if (Platform.OS !== 'ios') return { days: 0, unavailable: [], skipped: 'not_ios' };

  const last = Number(await AsyncStorage.getItem(LAST_SYNC_KEY).catch(() => null)) || 0;
  if (!force && now.getTime() - last < minIntervalMs) return { days: 0, unavailable: [], skipped: 'throttled' };

  const { rows, unavailable } = await buildNutritionDays(NUTRITION_WINDOW_DAYS, now);
  const cache: CachedNutritionDays = { rows, unavailable, syncedAt: now.toISOString() };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)).catch(() => {});
  if (rows.length > 0) await syncNutritionDays(rows);
  await AsyncStorage.setItem(LAST_SYNC_KEY, String(now.getTime())).catch(() => {});
  console.log(
    `[Nutrition] Synced ${rows.length} day(s) from HealthKit` +
      (unavailable.length ? ` (unreadable in this build: ${unavailable.join(', ')})` : ''),
  );
  return { days: rows.length, unavailable, skipped: null };
}
