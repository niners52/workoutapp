import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { getSleepData as getHealthKitSleep, getNutritionData as getHealthKitNutrition } from './healthKit';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Timeout helper to prevent hanging HealthKit calls
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
  ]);
}

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface SleepData {
  totalHours: number;
  date: string;
}

interface NutritionData {
  protein: number;
  date: string;
}

const CACHE_KEYS = {
  SLEEP: (date: string) => `healthkit_sleep_${date}`,
  NUTRITION: (date: string) => `healthkit_nutrition_${date}`,
};

/**
 * Get sleep data with caching
 * Cache duration: 5 minutes
 */
export async function getSleepData(date: Date): Promise<SleepData | null> {
  const dateStr = format(date, 'yyyy-MM-dd');
  const cacheKey = CACHE_KEYS.SLEEP(dateStr);

  try {
    // Check cache first
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as CachedData<SleepData>;
      if (Date.now() - timestamp < CACHE_DURATION) {
        console.log(`[Cache HIT] Sleep data for ${dateStr}`);
        return data;
      }
    }

    // Cache miss - fetch from HealthKit with timeout
    console.log(`[Cache MISS] Fetching sleep data for ${dateStr}`);
    const fresh = await withTimeout(getHealthKitSleep(date), 3000);

    // Store in cache
    if (fresh) {
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          data: fresh,
          timestamp: Date.now(),
        } as CachedData<SleepData>)
      );
    }

    return fresh;
  } catch (error) {
    console.error('Error getting cached sleep data:', error);
    // DO NOT call HealthKit again - just return null
    return null;
  }
}

/**
 * Get nutrition data with caching
 * Cache duration: 5 minutes
 */
export async function getNutritionData(date: Date): Promise<NutritionData | null> {
  const dateStr = format(date, 'yyyy-MM-dd');
  const cacheKey = CACHE_KEYS.NUTRITION(dateStr);

  try {
    // Check cache first
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as CachedData<NutritionData>;
      if (Date.now() - timestamp < CACHE_DURATION) {
        console.log(`[Cache HIT] Nutrition data for ${dateStr}`);
        return data;
      }
    }

    // Cache miss - fetch from HealthKit with timeout
    console.log(`[Cache MISS] Fetching nutrition data for ${dateStr}`);
    const fresh = await withTimeout(getHealthKitNutrition(date), 3000);

    // Store in cache
    if (fresh) {
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          data: fresh,
          timestamp: Date.now(),
        } as CachedData<NutritionData>)
      );
    }

    return fresh;
  } catch (error) {
    console.error('Error getting cached nutrition data:', error);
    // DO NOT call HealthKit again - just return null
    return null;
  }
}

/**
 * Clear all HealthKit cache
 */
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

/**
 * Clear cache for a specific date
 */
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
