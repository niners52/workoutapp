import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, startOfDay, endOfDay } from 'date-fns';
import { getSleepData as getHealthKitSleep, getNutritionData as getHealthKitNutrition, getLatestWeight as getHealthKitLatestWeight, getDailyYogaCardioMinutes, YogaCardioMinutes, getWorkoutsFromHealthKit, HealthKitWorkout } from './healthKit';
import { SleepData, NutritionData } from '../types';
import { getManualSleepEntry } from './storage';

/**
 * Get cache duration based on how old the date is:
 * - Today: 5 minutes (data still coming in)
 * - Yesterday: 1 hour (MFP might still sync)
 * - 2+ days ago: 7 days (data is final)
 */
function getCacheDuration(date: Date): number {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 5 * 60 * 1000;       // 5 min
  if (diffDays === 1) return 60 * 60 * 1000;       // 1 hour
  return 7 * 24 * 60 * 60 * 1000;                  // 7 days
}

interface CachedData<T> {
  data: T | null;
  timestamp: number;
}

const CACHE_KEYS = {
  SLEEP: (date: string) => `healthkit_sleep_${date}`,
  NUTRITION: (date: string) => `healthkit_nutrition_${date}`,
  YOGA_CARDIO: (date: string) => `healthkit_yoga_cardio_${date}`,
  WORKOUTS: (date: string) => `healthkit_workouts_${date}`,
  BODY_WEIGHT: 'healthkit_body_weight',
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function getSleepData(date: Date): Promise<SleepData | null> {
  const dateStr = format(date, 'yyyy-MM-dd');
  const cacheKey = CACHE_KEYS.SLEEP(dateStr);
  const cacheDuration = getCacheDuration(date);

  try {
    // Check HealthKit cache
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedData<SleepData>;
      if (Date.now() - parsed.timestamp < cacheDuration) {
        if (parsed.data) return parsed.data;
        // HealthKit returned null — fall through to manual entry check
      }
    }

    // Fetch from HealthKit
    const fresh = await withTimeout(getHealthKitSleep(date), 3000);

    // Cache the HealthKit result regardless (even null)
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ data: fresh, timestamp: Date.now() })
    ).catch(() => {});

    if (fresh) return fresh;

    // HealthKit returned null — check for manual entry
    const manualEntry = await getManualSleepEntry(dateStr);
    if (manualEntry) {
      return {
        date: dateStr,
        totalHours: manualEntry.totalHours,
        stages: null,
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting cached sleep data:', error);
    return null;
  }
}

export async function getNutritionData(date: Date): Promise<NutritionData | null> {
  const dateStr = format(date, 'yyyy-MM-dd');
  const cacheKey = CACHE_KEYS.NUTRITION(dateStr);
  const cacheDuration = getCacheDuration(date);

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedData<NutritionData>;
      if (Date.now() - parsed.timestamp < cacheDuration) {
        return parsed.data;
      }
    }

    const fresh = await withTimeout(getHealthKitNutrition(date), 3000);

    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ data: fresh, timestamp: Date.now() })
    ).catch(() => {});

    return fresh;
  } catch (error) {
    console.error('Error getting cached nutrition data:', error);
    return null;
  }
}

export async function getYogaCardioData(date: Date): Promise<YogaCardioMinutes | null> {
  const dateStr = format(date, 'yyyy-MM-dd');
  const cacheKey = CACHE_KEYS.YOGA_CARDIO(dateStr);
  const cacheDuration = getCacheDuration(date);

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedData<YogaCardioMinutes>;
      if (Date.now() - parsed.timestamp < cacheDuration) {
        return parsed.data;
      }
    }

    const fresh = await withTimeout(getDailyYogaCardioMinutes(date), 3000);

    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ data: fresh, timestamp: Date.now() })
    ).catch(() => {});

    return fresh;
  } catch (error) {
    console.error('Error getting cached yoga/cardio data:', error);
    return null;
  }
}

const BODY_WEIGHT_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function getCachedBodyWeight(): Promise<{ value: number; date: string } | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEYS.BODY_WEIGHT);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedData<{ value: number; date: string }>;
      if (parsed.data && Date.now() - parsed.timestamp < BODY_WEIGHT_CACHE_DURATION) {
        return parsed.data;
      }
    }

    const fresh = await withTimeout(getHealthKitLatestWeight(), 3000);

    await AsyncStorage.setItem(
      CACHE_KEYS.BODY_WEIGHT,
      JSON.stringify({ data: fresh, timestamp: Date.now() })
    ).catch(() => {});

    return fresh;
  } catch (error) {
    console.error('Error getting cached body weight:', error);
    return null;
  }
}

/**
 * Batch fetch health data for multiple dates.
 * Processes in chunks of 5 to avoid overwhelming HealthKit.
 * Each individual call has a 3-second timeout and caching.
 */
export interface BatchHealthData {
  sleepHours: number;
  proteinGrams: number;
  calories: number;
  yogaMinutes: number;
  cardioMinutes: number;
}

export async function batchFetchHealthData(
  dates: Date[]
): Promise<Map<string, BatchHealthData>> {
  const result = new Map<string, BatchHealthData>();

  const chunkSize = 5;
  for (let i = 0; i < dates.length; i += chunkSize) {
    const chunk = dates.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        try {
          const [sleep, nutrition, yogaCardio] = await Promise.all([
            getSleepData(date),
            getNutritionData(date),
            getYogaCardioData(date),
          ]);
          result.set(dateStr, {
            sleepHours: sleep?.totalHours || 0,
            proteinGrams: nutrition?.protein || 0,
            calories: nutrition?.calories || 0,
            yogaMinutes: yogaCardio?.yogaMinutes || 0,
            cardioMinutes: yogaCardio?.cardioMinutes || 0,
          });
        } catch {
          result.set(dateStr, { sleepHours: 0, proteinGrams: 0, calories: 0, yogaMinutes: 0, cardioMinutes: 0 });
        }
      })
    );
  }

  return result;
}

/**
 * Get HealthKit workouts (cardio, yoga, etc.) for a single date. Cached.
 */
export async function getHealthKitWorkoutsForDate(date: Date): Promise<HealthKitWorkout[]> {
  const dateStr = format(date, 'yyyy-MM-dd');
  const cacheKey = CACHE_KEYS.WORKOUTS(dateStr);
  const cacheDuration = getCacheDuration(date);

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedData<HealthKitWorkout[]>;
      if (Date.now() - parsed.timestamp < cacheDuration) {
        return parsed.data || [];
      }
    }

    const fresh = await withTimeout(
      getWorkoutsFromHealthKit(startOfDay(date), endOfDay(date)),
      5000
    );

    const data = fresh || [];
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ data, timestamp: Date.now() })
    ).catch(() => {});

    return data;
  } catch (error) {
    console.error('Error getting cached HealthKit workouts:', error);
    return [];
  }
}

/**
 * Get HealthKit workouts for a date range (e.g., a week). Uses per-day cache.
 */
export async function getHealthKitWorkoutsForRange(
  startDate: Date,
  endDate: Date
): Promise<HealthKitWorkout[]> {
  const allWorkouts: HealthKitWorkout[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayWorkouts = await getHealthKitWorkoutsForDate(new Date(current));
    allWorkouts.push(...dayWorkouts);
    current.setDate(current.getDate() + 1);
  }

  return allWorkouts;
}

export async function clearHealthKitCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const healthKitKeys = keys.filter(k => k.startsWith('healthkit_'));
    await AsyncStorage.multiRemove(healthKitKeys);
    console.log(`Cleared ${healthKitKeys.length} HealthKit cache entries`);
  } catch (error) {
    console.error('Error clearing HealthKit cache:', error);
  }
}

export async function clearCacheForDate(date: Date): Promise<void> {
  const dateStr = format(date, 'yyyy-MM-dd');
  try {
    await AsyncStorage.multiRemove([
      CACHE_KEYS.SLEEP(dateStr),
      CACHE_KEYS.NUTRITION(dateStr),
      CACHE_KEYS.YOGA_CARDIO(dateStr),
      CACHE_KEYS.WORKOUTS(dateStr),
    ]);
    console.log(`Cleared cache for ${dateStr}`);
  } catch (error) {
    console.error('Error clearing cache for date:', error);
  }
}

/**
 * Calculate the average sleep hours over the last N days from HealthKit data.
 * Only includes days with non-zero sleep. Returns null if no data.
 */
export async function getSleepAverage(days: number = 30): Promise<number | null> {
  const dates: Date[] = [];
  const today = new Date();
  for (let i = 1; i <= days; i++) {
    dates.push(new Date(today.getTime() - i * 24 * 60 * 60 * 1000));
  }

  const healthData = await batchFetchHealthData(dates);
  let total = 0;
  let count = 0;
  for (const [, data] of healthData) {
    if (data.sleepHours > 0) {
      total += data.sleepHours;
      count++;
    }
  }

  if (count === 0) return null;
  return Math.round((total / count) * 10) / 10;
}
