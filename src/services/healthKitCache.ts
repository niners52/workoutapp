import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { getSleepData as getHealthKitSleep, getNutritionData as getHealthKitNutrition } from './healthKit';
import { SleepData, NutritionData } from '../types';

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
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedData<SleepData>;
      if (Date.now() - parsed.timestamp < cacheDuration) {
        return parsed.data;
      }
    }

    const fresh = await withTimeout(getHealthKitSleep(date), 3000);

    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ data: fresh, timestamp: Date.now() })
    ).catch(() => {});

    return fresh;
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

/**
 * Batch fetch health data for multiple dates.
 * Processes in chunks of 5 to avoid overwhelming HealthKit.
 * Each individual call has a 3-second timeout and caching.
 */
export async function batchFetchHealthData(
  dates: Date[]
): Promise<Map<string, { sleepHours: number; proteinGrams: number; calories: number }>> {
  const result = new Map<string, { sleepHours: number; proteinGrams: number; calories: number }>();

  const chunkSize = 5;
  for (let i = 0; i < dates.length; i += chunkSize) {
    const chunk = dates.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        try {
          const [sleep, nutrition] = await Promise.all([
            getSleepData(date),
            getNutritionData(date),
          ]);
          result.set(dateStr, {
            sleepHours: sleep?.totalHours || 0,
            proteinGrams: nutrition?.protein || 0,
            calories: nutrition?.calories || 0,
          });
        } catch {
          result.set(dateStr, { sleepHours: 0, proteinGrams: 0, calories: 0 });
        }
      })
    );
  }

  return result;
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
    ]);
    console.log(`Cleared cache for ${dateStr}`);
  } catch (error) {
    console.error('Error clearing cache for date:', error);
  }
}
