import { Platform } from 'react-native';
import { NutritionData, SleepData, SleepStages, BodyMeasurementHistory } from '../types';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

// Conditionally import react-native-health only on iOS
let AppleHealthKit: any = null;
if (Platform.OS === 'ios') {
  try {
    const healthModule = require('react-native-health');
    AppleHealthKit = healthModule.default || healthModule;
    console.log('HealthKit module loaded:', !!AppleHealthKit);
    console.log('HealthKit methods:', AppleHealthKit ? Object.keys(AppleHealthKit).slice(0, 10) : 'none');
  } catch (e) {
    console.log('react-native-health import error:', e);
  }
}

// Flag to easily switch between mock and real data
// Set to false to use real HealthKit data
const USE_MOCK_DATA = false;

// ============== WORKOUT TYPES ==============

export interface HealthKitWorkout {
  id: string;
  activityName: string;
  calories: number;
  distance: number;
  start: string;
  end: string;
  duration: number; // in minutes
  sourceName: string;
  sourceId: string;
}

// ============== HEALTHKIT INITIALIZATION ==============

const healthKitPermissions = {
  permissions: {
    read: [
      'Workout',
      'ActiveEnergyBurned',
      'SleepAnalysis',
      'Protein',
      'Carbohydrates',
      'FatTotal',
      'EnergyConsumed',
      'Weight',
      'BodyFatPercentage',
      'Height',
      'LeanBodyMass',
      'BodyMassIndex',
      // Recovery/health metrics
      'HeartRateVariability',
      'RestingHeartRate',
      'RespiratoryRate',
      'OxygenSaturation',
      'AppleSleepingWristTemperature',
      'HeartRate',
    ],
    write: [
      'Workout',
      'ActiveEnergyBurned',
    ],
  },
};

let healthKitInitialized = false;

export async function initializeHealthKit(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    console.log('HealthKit not available - not iOS');
    return false;
  }

  if (!AppleHealthKit) {
    console.log('HealthKit not available - react-native-health not loaded');
    return false;
  }

  if (healthKitInitialized) {
    return true;
  }

  return new Promise((resolve) => {
    console.log('Requesting HealthKit permissions:', JSON.stringify(healthKitPermissions));
    AppleHealthKit.initHealthKit(healthKitPermissions, (error: string) => {
      if (error) {
        console.log('HealthKit initialization error:', error);
        resolve(false);
      } else {
        console.log('HealthKit initialized successfully with permissions');
        healthKitInitialized = true;
        resolve(true);
      }
    });
  });
}

// ============== WORKOUT FUNCTIONS ==============

export async function getWorkoutsFromHealthKit(
  startDate: Date,
  endDate: Date = new Date()
): Promise<HealthKitWorkout[]> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return getMockWorkouts(startDate, endDate);
  }

  await initializeHealthKit();

  const options = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };

  return new Promise((resolve) => {
    // Use getAnchoredWorkouts — getSamples does NOT support Workout type
    // getAnchoredWorkouts returns { data: HKWorkoutQueriedSampleType[], anchor: string }
    if (typeof AppleHealthKit.getAnchoredWorkouts !== 'function') {
      console.log('[HealthKit] getAnchoredWorkouts not available');
      resolve([]);
      return;
    }

    AppleHealthKit.getAnchoredWorkouts(options, (error: any, results: any) => {
      if (error) {
        console.log('[HealthKit] Error getting workouts:', error);
        resolve([]);
        return;
      }

      // Results is { data: [...], anchor: "..." }
      const samples = results?.data || results || [];
      const workoutArray = Array.isArray(samples) ? samples : [];

      const workouts: HealthKitWorkout[] = workoutArray.map((sample: any) => ({
        id: sample.id || `hk-${sample.start || sample.startDate}`,
        activityName: sample.activityName || 'Workout',
        calories: sample.calories || 0,
        distance: sample.distance || 0,
        start: sample.start || sample.startDate || '',
        end: sample.end || sample.endDate || '',
        duration: sample.duration ? sample.duration / 60 : 0, // convert seconds to minutes
        sourceName: sample.sourceName || 'Unknown',
        sourceId: sample.sourceId || '',
      }));

      console.log(`[HealthKit] Fetched ${workouts.length} workouts for ${format(startDate, 'yyyy-MM-dd')}`);
      resolve(workouts);
    });
  });
}

export async function getWeeklyWorkouts(): Promise<HealthKitWorkout[]> {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  return getWorkoutsFromHealthKit(startOfWeek, now);
}

export async function saveWorkoutToHealthKit(
  startDate: Date,
  endDate: Date,
  calories: number = 0
): Promise<boolean> {
  if (Platform.OS !== 'ios' || !AppleHealthKit) {
    console.log('Cannot save workout - HealthKit not available');
    return false;
  }

  await initializeHealthKit();

  const options = {
    type: 'TraditionalStrengthTraining',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    energyBurned: calories,
    energyBurnedUnit: 'calorie',
  };

  return new Promise((resolve) => {
    AppleHealthKit.saveWorkout(options, (error: string, result: any) => {
      if (error) {
        console.log('Error saving workout to HealthKit:', error);
        resolve(false);
      } else {
        console.log('Workout saved to HealthKit:', result);
        resolve(true);
      }
    });
  });
}

export async function getWorkoutCount(
  startDate: Date,
  endDate: Date = new Date()
): Promise<number> {
  const workouts = await getWorkoutsFromHealthKit(startDate, endDate);
  return workouts.length;
}

// ============== YOGA & CARDIO FROM HEALTHKIT ==============

// HealthKit activity names as returned by react-native-health
const YOGA_ACTIVITIES = new Set([
  'Yoga',
]);

const CARDIO_ACTIVITIES = new Set([
  'Running',
  'Cycling',
  'Walking',
  'Elliptical',
  'Rowing',
  'StairClimbing',
  'Hiking',
  'Swimming',
  'Dance',
  'JumpRope',
  'Kickboxing',
  'StepTraining',
  'HighIntensityIntervalTraining',
  'CrossTraining',
]);

export interface YogaCardioMinutes {
  yogaMinutes: number;
  cardioMinutes: number;
}

/**
 * Get total yoga and cardio minutes from HealthKit workouts for a date range.
 */
export async function getYogaCardioMinutes(
  startDate: Date,
  endDate: Date = new Date()
): Promise<YogaCardioMinutes> {
  const workouts = await getWorkoutsFromHealthKit(startDate, endDate);

  let yogaMinutes = 0;
  let cardioMinutes = 0;

  for (const w of workouts) {
    const name = w.activityName;
    if (YOGA_ACTIVITIES.has(name)) {
      yogaMinutes += w.duration;
    } else if (CARDIO_ACTIVITIES.has(name)) {
      cardioMinutes += w.duration;
    }
  }

  return {
    yogaMinutes: Math.round(yogaMinutes),
    cardioMinutes: Math.round(cardioMinutes),
  };
}

/**
 * Get yoga/cardio minutes for a single day.
 */
export async function getDailyYogaCardioMinutes(date: Date): Promise<YogaCardioMinutes> {
  const start = startOfDay(date);
  const end = endOfDay(date);
  return getYogaCardioMinutes(start, end);
}

// Mock workouts for testing/non-iOS
function getMockWorkouts(startDate: Date, endDate: Date): HealthKitWorkout[] {
  // Return empty array - workouts will come from the app's own tracking
  return [];
}

// Generate realistic mock nutrition data
function generateMockNutritionData(date: Date): NutritionData {
  // Add some variation based on the day
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Base values with some randomness
  const baseCalories = isWeekend ? 2400 : 2200;
  const baseProtein = 140;
  const baseCarbs = isWeekend ? 280 : 250;
  const baseFat = isWeekend ? 90 : 80;

  // Add random variation (±15%)
  const variation = () => 0.85 + Math.random() * 0.3;

  return {
    date: format(date, 'yyyy-MM-dd'),
    calories: Math.round(baseCalories * variation()),
    protein: Math.round(baseProtein * variation()),
    carbs: Math.round(baseCarbs * variation()),
    fat: Math.round(baseFat * variation()),
  };
}

// Generate realistic mock sleep data
function generateMockSleepData(date: Date): SleepData {
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Base hours with variation
  const baseHours = isWeekend ? 8.5 : 7;
  const variation = -0.5 + Math.random() * 1.5; // -0.5 to +1 hours
  const totalHours = Math.round((baseHours + variation) * 10) / 10;

  // Generate sleep stages (roughly based on typical percentages)
  const stages: SleepStages = {
    deep: Math.round(totalHours * 0.15 * 10) / 10, // ~15% deep
    rem: Math.round(totalHours * 0.22 * 10) / 10, // ~22% REM
    core: Math.round(totalHours * 0.55 * 10) / 10, // ~55% light/core
    awake: Math.round(totalHours * 0.08 * 10) / 10, // ~8% awake
  };

  return {
    date: format(date, 'yyyy-MM-dd'),
    totalHours,
    stages,
  };
}

// Public API

export async function getNutritionData(date: Date): Promise<NutritionData | null> {
  if (USE_MOCK_DATA) {
    return generateMockNutritionData(date);
  }

  if (Platform.OS !== 'ios') {
    // Return mock data on non-iOS platforms (web) for testing
    console.log('getNutritionData: Not iOS, returning mock data');
    return generateMockNutritionData(date);
  }

  if (!AppleHealthKit) {
    // react-native-health not available (e.g., Expo Go)
    console.log('getNutritionData: AppleHealthKit not available, returning null');
    return null;
  }

  const initialized = await initializeHealthKit();
  if (!initialized) {
    console.log('getNutritionData: HealthKit not initialized, returning null');
    return null;
  }

  const startOfDayDate = startOfDay(date);
  const endOfDayDate = endOfDay(date);

  const options = {
    startDate: startOfDayDate.toISOString(),
    endDate: endOfDayDate.toISOString(),
  };

  // Helper to fetch nutrition samples using specific getter methods
  const fetchNutritionSample = (methodName: string): Promise<number> => {
    return new Promise((resolve) => {
      // Check if the method exists
      if (typeof AppleHealthKit[methodName] !== 'function') {
        console.log(`${methodName} not available`);
        resolve(0);
        return;
      }

      // Use a timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        console.log(`${methodName} timed out`);
        resolve(0);
      }, 5000);

      try {
        AppleHealthKit[methodName](options, (err: string, results: any[]) => {
          clearTimeout(timeoutId);
          if (err) {
            console.log(`Error fetching ${methodName}:`, err);
            resolve(0);
            return;
          }
          if (!results || results.length === 0) {
            console.log(`No ${methodName} data found`);
            resolve(0);
            return;
          }
          const total = results.reduce((sum: number, sample: any) => sum + (Number(sample.value) || 0), 0);
          console.log(`${methodName} total:`, total);
          resolve(Math.round(total));
        });
      } catch (e) {
        clearTimeout(timeoutId);
        console.log(`${methodName} exception:`, e);
        resolve(0);
      }
    });
  };

  // Fetch all nutrition data in parallel using specific getter methods
  const [protein, carbs, fat, calories] = await Promise.all([
    fetchNutritionSample('getProteinSamples'),
    fetchNutritionSample('getCarbohydratesSamples'),
    fetchNutritionSample('getTotalFatSamples'),
    fetchNutritionSample('getEnergyConsumedSamples'),
  ]);

  // Only return data if we have at least some nutrition logged
  if (protein === 0 && carbs === 0 && fat === 0 && calories === 0) {
    return null;
  }

  return {
    date: format(date, 'yyyy-MM-dd'),
    calories,
    protein,
    carbs,
    fat,
  };
}

// Get today's total calories consumed (for calorie ring)
export async function getTodayCalories(): Promise<number | null> {
  if (Platform.OS !== 'ios') {
    return null;
  }

  if (!AppleHealthKit) {
    return null;
  }

  const initialized = await initializeHealthKit();
  if (!initialized) {
    return null;
  }

  const today = new Date();
  const startOfDayDate = startOfDay(today);
  const now = new Date();

  const options = {
    startDate: startOfDayDate.toISOString(),
    endDate: now.toISOString(),
  };

  return new Promise((resolve) => {
    if (typeof AppleHealthKit.getEnergyConsumedSamples !== 'function') {
      console.log('getEnergyConsumedSamples not available');
      resolve(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      console.log('getTodayCalories timed out');
      resolve(null);
    }, 5000);

    try {
      AppleHealthKit.getEnergyConsumedSamples(options, (err: string, results: any[]) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error fetching today calories:', err);
          resolve(null);
          return;
        }
        if (!results || results.length === 0) {
          resolve(0); // No data means 0 calories logged
          return;
        }
        const total = results.reduce((sum: number, sample: any) => sum + (Number(sample.value) || 0), 0);
        resolve(Math.round(total));
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getTodayCalories exception:', e);
      resolve(null);
    }
  });
}

export async function getNutritionDataRange(
  startDate: Date,
  endDate: Date
): Promise<NutritionData[]> {
  const data: NutritionData[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayData = await getNutritionData(current);
    if (dayData) {
      data.push(dayData);
    }
    current.setDate(current.getDate() + 1);
  }

  return data;
}

export async function getSleepData(date: Date): Promise<SleepData | null> {
  if (USE_MOCK_DATA) {
    return generateMockSleepData(date);
  }

  if (Platform.OS !== 'ios') {
    // Return mock data on non-iOS platforms (web) for testing
    console.log('getSleepData: Not iOS, returning mock data');
    return generateMockSleepData(date);
  }

  if (!AppleHealthKit) {
    // react-native-health not available (e.g., Expo Go)
    console.log('getSleepData: AppleHealthKit not available, returning null');
    return null;
  }

  const initialized = await initializeHealthKit();
  if (!initialized) {
    console.log('getSleepData: HealthKit not initialized, returning null');
    return null;
  }

  // For sleep, we want data from the night before the given date
  // e.g., for Jan 5, we want sleep that ended on Jan 5 morning (slept night of Jan 4-5)
  const sleepEndDate = endOfDay(date);
  const sleepStartDate = startOfDay(subDays(date, 1)); // Start looking from previous day

  const options = {
    startDate: sleepStartDate.toISOString(),
    endDate: sleepEndDate.toISOString(),
  };

  return new Promise((resolve) => {
    console.log('Fetching sleep samples with options:', JSON.stringify(options));
    AppleHealthKit.getSleepSamples(options, (err: string, results: any[]) => {
      console.log('Sleep samples response - error:', err, 'results count:', results?.length || 0);
      if (err) {
        console.log('Sleep fetch error:', err);
        resolve(null);
        return;
      }
      if (!results || results.length === 0) {
        console.log('No sleep results found');
        resolve(null);
        return;
      }
      console.log('Sleep samples found:', results.length, 'First sample:', JSON.stringify(results[0]));

      // Sleep for "today" means the overnight session: evening before through morning of target date
      // Include all samples from 6PM yesterday through 12PM (noon) today
      const eveningBefore = new Date(date);
      eveningBefore.setDate(eveningBefore.getDate() - 1);
      eveningBefore.setHours(18, 0, 0, 0); // 6 PM yesterday

      const morningOf = new Date(date);
      morningOf.setHours(12, 0, 0, 0); // 12 PM today

      const targetDateStr = format(date, 'yyyy-MM-dd');
      const sleepSamples = results.filter((sample: any) => {
        const sampleStart = new Date(sample.startDate);
        const sampleEnd = new Date(sample.endDate);
        // Include if the sample overlaps with the overnight window
        return sampleStart >= eveningBefore && sampleEnd <= morningOf;
      });

      if (sleepSamples.length === 0) {
        resolve(null);
        return;
      }

      // Calculate total sleep time and stages
      let totalMinutes = 0;
      let deepMinutes = 0;
      let remMinutes = 0;
      let coreMinutes = 0;
      let awakeMinutes = 0;

      sleepSamples.forEach((sample: any) => {
        const start = new Date(sample.startDate);
        const end = new Date(sample.endDate);
        const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

        // Map sleep values to stages
        // HealthKit sleep values: INBED, ASLEEP, AWAKE, CORE, DEEP, REM
        const value = sample.value?.toLowerCase() || 'asleep';

        if (value === 'inbed') {
          // Don't count time in bed as sleep
        } else if (value === 'awake') {
          awakeMinutes += durationMinutes;
          totalMinutes += durationMinutes;
        } else if (value === 'deep') {
          deepMinutes += durationMinutes;
          totalMinutes += durationMinutes;
        } else if (value === 'rem') {
          remMinutes += durationMinutes;
          totalMinutes += durationMinutes;
        } else if (value === 'core' || value === 'asleep') {
          coreMinutes += durationMinutes;
          totalMinutes += durationMinutes;
        }
      });

      // Convert to hours
      const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

      if (totalHours === 0) {
        resolve(null);
        return;
      }

      const stages: SleepStages = {
        deep: Math.round((deepMinutes / 60) * 10) / 10,
        rem: Math.round((remMinutes / 60) * 10) / 10,
        core: Math.round((coreMinutes / 60) * 10) / 10,
        awake: Math.round((awakeMinutes / 60) * 10) / 10,
      };

      resolve({
        date: targetDateStr,
        totalHours,
        stages: (deepMinutes > 0 || remMinutes > 0) ? stages : null,
      });
    });
  });
}

export async function getSleepDataRange(
  startDate: Date,
  endDate: Date
): Promise<SleepData[]> {
  const data: SleepData[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayData = await getSleepData(current);
    if (dayData) {
      data.push(dayData);
    }
    current.setDate(current.getDate() + 1);
  }

  return data;
}

// Get weekly averages for nutrition
export async function getWeeklyNutritionAverage(weekEndDate: Date): Promise<{
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  days: number;
}> {
  const startDate = subDays(weekEndDate, 6);
  const data = await getNutritionDataRange(startDate, weekEndDate);

  if (data.length === 0) {
    return { avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0, days: 0 };
  }

  const totals = data.reduce(
    (acc, day) => ({
      calories: acc.calories + day.calories,
      protein: acc.protein + day.protein,
      carbs: acc.carbs + day.carbs,
      fat: acc.fat + day.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return {
    avgCalories: Math.round(totals.calories / data.length),
    avgProtein: Math.round(totals.protein / data.length),
    avgCarbs: Math.round(totals.carbs / data.length),
    avgFat: Math.round(totals.fat / data.length),
    days: data.length,
  };
}

// Get weekly average sleep
export async function getWeeklySleepAverage(weekEndDate: Date): Promise<{
  avgHours: number;
  avgDeep: number;
  avgRem: number;
  avgCore: number;
  days: number;
}> {
  const startDate = subDays(weekEndDate, 6);
  const data = await getSleepDataRange(startDate, weekEndDate);

  if (data.length === 0) {
    return { avgHours: 0, avgDeep: 0, avgRem: 0, avgCore: 0, days: 0 };
  }

  const totals = data.reduce(
    (acc, day) => ({
      hours: acc.hours + day.totalHours,
      deep: acc.deep + (day.stages?.deep || 0),
      rem: acc.rem + (day.stages?.rem || 0),
      core: acc.core + (day.stages?.core || 0),
    }),
    { hours: 0, deep: 0, rem: 0, core: 0 }
  );

  return {
    avgHours: Math.round((totals.hours / data.length) * 10) / 10,
    avgDeep: Math.round((totals.deep / data.length) * 10) / 10,
    avgRem: Math.round((totals.rem / data.length) * 10) / 10,
    avgCore: Math.round((totals.core / data.length) * 10) / 10,
    days: data.length,
  };
}

// ============== BODY MEASUREMENTS ==============

export interface BodyMeasurementData {
  weight: number | null; // in lbs
  bodyFatPercentage: number | null;
  heightInches: number | null;
  lastUpdated: string | null; // ISO date string
}

// Get the latest weight from HealthKit
export async function getLatestWeight(): Promise<{ value: number; date: string } | null> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return null;
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return null;

  const options = {
    unit: 'pound',
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getLatestWeight timed out');
      resolve(null);
    }, 5000);

    try {
      AppleHealthKit.getLatestWeight(options, (err: string, result: any) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error getting latest weight:', err);
          resolve(null);
          return;
        }
        if (!result || !result.value) {
          resolve(null);
          return;
        }
        resolve({
          value: Math.round(result.value * 10) / 10,
          date: result.startDate || new Date().toISOString(),
        });
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getLatestWeight exception:', e);
      resolve(null);
    }
  });
}

// Get the latest body fat percentage from HealthKit
export async function getLatestBodyFat(): Promise<{ value: number; date: string } | null> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return null;
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return null;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getLatestBodyFat timed out');
      resolve(null);
    }, 5000);

    try {
      AppleHealthKit.getLatestBodyFatPercentage({}, (err: string, result: any) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error getting latest body fat:', err);
          resolve(null);
          return;
        }
        if (!result || result.value === undefined) {
          resolve(null);
          return;
        }
        // Body fat may come as a decimal (0.15 = 15%) or already as percentage (15.0)
        resolve({
          value: result.value > 1 ? Math.round(result.value * 10) / 10 : Math.round(result.value * 1000) / 10,
          date: result.startDate || new Date().toISOString(),
        });
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getLatestBodyFat exception:', e);
      resolve(null);
    }
  });
}

// Get the latest height from HealthKit
export async function getLatestHeight(): Promise<{ value: number; date: string } | null> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return null;
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return null;

  const options = {
    unit: 'inch',
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getLatestHeight timed out');
      resolve(null);
    }, 5000);

    try {
      AppleHealthKit.getLatestHeight(options, (err: string, result: any) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error getting latest height:', err);
          resolve(null);
          return;
        }
        if (!result || !result.value) {
          resolve(null);
          return;
        }
        resolve({
          value: Math.round(result.value * 10) / 10,
          date: result.startDate || new Date().toISOString(),
        });
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getLatestHeight exception:', e);
      resolve(null);
    }
  });
}

// Get weight history for a date range
export async function getWeightHistory(
  startDate: Date,
  endDate: Date = new Date()
): Promise<BodyMeasurementHistory[]> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return [];
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return [];

  const options = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    unit: 'pound',
    ascending: true,
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getWeightHistory timed out');
      resolve([]);
    }, 10000);

    try {
      AppleHealthKit.getWeightSamples(options, (err: string, results: any[]) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error getting weight history:', err);
          resolve([]);
          return;
        }
        if (!results || results.length === 0) {
          resolve([]);
          return;
        }

        // Group by date and take the latest value for each day
        const byDate = new Map<string, { value: number; timestamp: number }>();
        results.forEach((sample: any) => {
          const date = format(new Date(sample.startDate), 'yyyy-MM-dd');
          const timestamp = new Date(sample.startDate).getTime();
          const existing = byDate.get(date);
          if (!existing || timestamp > existing.timestamp) {
            byDate.set(date, { value: sample.value, timestamp });
          }
        });

        const history: BodyMeasurementHistory[] = Array.from(byDate.entries())
          .map(([date, data]) => ({
            date,
            value: Math.round(data.value * 10) / 10,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        resolve(history);
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getWeightHistory exception:', e);
      resolve([]);
    }
  });
}

// Get body fat percentage history for a date range
export async function getBodyFatHistory(
  startDate: Date,
  endDate: Date = new Date()
): Promise<BodyMeasurementHistory[]> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return [];
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return [];

  const options = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    ascending: true,
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getBodyFatHistory timed out');
      resolve([]);
    }, 10000);

    try {
      AppleHealthKit.getBodyFatPercentageSamples(options, (err: string, results: any[]) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error getting body fat history:', err);
          resolve([]);
          return;
        }
        if (!results || results.length === 0) {
          resolve([]);
          return;
        }

        // Group by date and take the latest value for each day
        const byDate = new Map<string, { value: number; timestamp: number }>();
        results.forEach((sample: any) => {
          const date = format(new Date(sample.startDate), 'yyyy-MM-dd');
          const timestamp = new Date(sample.startDate).getTime();
          const existing = byDate.get(date);
          if (!existing || timestamp > existing.timestamp) {
            // Body fat may come as a decimal (0.15 = 15%) or already as percentage (15.0)
            byDate.set(date, { value: sample.value > 1 ? sample.value : sample.value * 100, timestamp });
          }
        });

        const history: BodyMeasurementHistory[] = Array.from(byDate.entries())
          .map(([date, data]) => ({
            date,
            value: Math.round(data.value * 10) / 10,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        resolve(history);
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getBodyFatHistory exception:', e);
      resolve([]);
    }
  });
}

// Get all body measurements at once
export async function getAllBodyMeasurements(): Promise<BodyMeasurementData> {
  const [weight, bodyFat, height] = await Promise.all([
    getLatestWeight(),
    getLatestBodyFat(),
    getLatestHeight(),
  ]);

  // Find the most recent date from any measurement
  const dates = [weight?.date, bodyFat?.date, height?.date].filter(Boolean) as string[];
  const lastUpdated = dates.length > 0
    ? dates.reduce((latest, date) => date > latest ? date : latest)
    : null;

  return {
    weight: weight?.value ?? null,
    bodyFatPercentage: bodyFat?.value ?? null,
    heightInches: height?.value ?? null,
    lastUpdated,
  };
}

// ============== HEALTH METRICS FOR RECOVERY ==============

export interface HealthMetricSample {
  value: number;
  date: string;
}

// Get the latest HRV (Heart Rate Variability SDNN) from HealthKit
export async function getLatestHRV(): Promise<HealthMetricSample | null> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return null;
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return null;

  const options = {
    startDate: subDays(new Date(), 7).toISOString(), // Look back 7 days
    endDate: new Date().toISOString(),
    ascending: false,
    limit: 1,
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getLatestHRV timed out');
      resolve(null);
    }, 5000);

    try {
      AppleHealthKit.getHeartRateVariabilitySamples(options, (err: string, results: any[]) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error getting HRV:', err);
          resolve(null);
          return;
        }
        if (!results || results.length === 0) {
          resolve(null);
          return;
        }
        const sample = results[0];
        resolve({
          value: Math.round(sample.value * 1000 * 10) / 10, // Convert to ms with 1 decimal
          date: sample.startDate || new Date().toISOString(),
        });
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getLatestHRV exception:', e);
      resolve(null);
    }
  });
}

// Get HRV history for the past N days
export async function getHRVHistory(days: number): Promise<HealthMetricSample[]> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return [];
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return [];

  const options = {
    startDate: subDays(new Date(), days).toISOString(),
    endDate: new Date().toISOString(),
    ascending: true,
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getHRVHistory timed out');
      resolve([]);
    }, 10000);

    try {
      AppleHealthKit.getHeartRateVariabilitySamples(options, (err: string, results: any[]) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error getting HRV history:', err);
          resolve([]);
          return;
        }
        if (!results || results.length === 0) {
          resolve([]);
          return;
        }

        // Group by date and take the average for each day
        const byDate = new Map<string, { total: number; count: number }>();
        results.forEach((sample: any) => {
          const date = format(new Date(sample.startDate), 'yyyy-MM-dd');
          const existing = byDate.get(date) || { total: 0, count: 0 };
          existing.total += sample.value * 1000; // Convert to ms
          existing.count += 1;
          byDate.set(date, existing);
        });

        const history: HealthMetricSample[] = Array.from(byDate.entries())
          .map(([date, data]) => ({
            date,
            value: Math.round((data.total / data.count) * 10) / 10,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        resolve(history);
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getHRVHistory exception:', e);
      resolve([]);
    }
  });
}

// Get the latest Resting Heart Rate from HealthKit
export async function getLatestRestingHeartRate(): Promise<HealthMetricSample | null> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return null;
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return null;

  const options = {
    startDate: subDays(new Date(), 7).toISOString(),
    endDate: new Date().toISOString(),
    ascending: false,
    limit: 1,
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getLatestRestingHeartRate timed out');
      resolve(null);
    }, 5000);

    try {
      AppleHealthKit.getRestingHeartRateSamples(options, (err: string, results: any[]) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error getting resting heart rate:', err);
          resolve(null);
          return;
        }
        if (!results || results.length === 0) {
          resolve(null);
          return;
        }
        const sample = results[0];
        resolve({
          value: Math.round(sample.value),
          date: sample.startDate || new Date().toISOString(),
        });
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getLatestRestingHeartRate exception:', e);
      resolve(null);
    }
  });
}

// Get Resting Heart Rate history for the past N days
export async function getRestingHeartRateHistory(days: number): Promise<HealthMetricSample[]> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return [];
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return [];

  const options = {
    startDate: subDays(new Date(), days).toISOString(),
    endDate: new Date().toISOString(),
    ascending: true,
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getRestingHeartRateHistory timed out');
      resolve([]);
    }, 10000);

    try {
      AppleHealthKit.getRestingHeartRateSamples(options, (err: string, results: any[]) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error getting resting heart rate history:', err);
          resolve([]);
          return;
        }
        if (!results || results.length === 0) {
          resolve([]);
          return;
        }

        // Group by date and take the latest value for each day
        const byDate = new Map<string, { value: number; timestamp: number }>();
        results.forEach((sample: any) => {
          const date = format(new Date(sample.startDate), 'yyyy-MM-dd');
          const timestamp = new Date(sample.startDate).getTime();
          const existing = byDate.get(date);
          if (!existing || timestamp > existing.timestamp) {
            byDate.set(date, { value: sample.value, timestamp });
          }
        });

        const history: HealthMetricSample[] = Array.from(byDate.entries())
          .map(([date, data]) => ({
            date,
            value: Math.round(data.value),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        resolve(history);
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getRestingHeartRateHistory exception:', e);
      resolve([]);
    }
  });
}

// Get the latest Respiratory Rate from HealthKit
export async function getLatestRespiratoryRate(): Promise<HealthMetricSample | null> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return null;
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return null;

  const options = {
    startDate: subDays(new Date(), 7).toISOString(),
    endDate: new Date().toISOString(),
    ascending: false,
    limit: 1,
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getLatestRespiratoryRate timed out');
      resolve(null);
    }, 5000);

    try {
      AppleHealthKit.getRespiratoryRateSamples(options, (err: string, results: any[]) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error getting respiratory rate:', err);
          resolve(null);
          return;
        }
        if (!results || results.length === 0) {
          resolve(null);
          return;
        }
        const sample = results[0];
        resolve({
          value: Math.round(sample.value * 10) / 10, // breaths/min with 1 decimal
          date: sample.startDate || new Date().toISOString(),
        });
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getLatestRespiratoryRate exception:', e);
      resolve(null);
    }
  });
}

// Get the latest SpO2 (Oxygen Saturation) from HealthKit
export async function getLatestSpO2(): Promise<HealthMetricSample | null> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return null;
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return null;

  const options = {
    startDate: subDays(new Date(), 7).toISOString(),
    endDate: new Date().toISOString(),
    ascending: false,
    limit: 1,
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getLatestSpO2 timed out');
      resolve(null);
    }, 5000);

    try {
      AppleHealthKit.getOxygenSaturationSamples(options, (err: string, results: any[]) => {
        clearTimeout(timeoutId);
        if (err) {
          console.log('Error getting SpO2:', err);
          resolve(null);
          return;
        }
        if (!results || results.length === 0) {
          resolve(null);
          return;
        }
        const sample = results[0];
        // SpO2 comes as a decimal (0.98 = 98%)
        resolve({
          value: Math.round(sample.value * 100),
          date: sample.startDate || new Date().toISOString(),
        });
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getLatestSpO2 exception:', e);
      resolve(null);
    }
  });
}

// Get the latest Skin Temperature (sleeping wrist temperature) from HealthKit
export async function getLatestSkinTemp(): Promise<HealthMetricSample | null> {
  if (Platform.OS !== 'ios' || !AppleHealthKit || USE_MOCK_DATA) {
    return null;
  }

  const initialized = await initializeHealthKit();
  if (!initialized) return null;

  // This is Apple's sleeping wrist temperature - requires Apple Watch
  const options = {
    startDate: subDays(new Date(), 7).toISOString(),
    endDate: new Date().toISOString(),
    ascending: false,
    limit: 1,
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.log('getLatestSkinTemp timed out');
      resolve(null);
    }, 5000);

    try {
      // Note: This requires iOS 16+ and Apple Watch Series 8+
      // Method name may vary - trying getSamples with type
      AppleHealthKit.getSamples(
        {
          ...options,
          type: 'AppleSleepingWristTemperature',
          unit: 'celsius',
        },
        (err: string, results: any[]) => {
          clearTimeout(timeoutId);
          if (err) {
            console.log('Error getting skin temp:', err);
            resolve(null);
            return;
          }
          if (!results || results.length === 0) {
            resolve(null);
            return;
          }
          const sample = results[0];
          resolve({
            value: Math.round(sample.value * 10) / 10,
            date: sample.startDate || new Date().toISOString(),
          });
        }
      );
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('getLatestSkinTemp exception:', e);
      resolve(null);
    }
  });
}

// Get sleep data for last night specifically (convenience method)
export async function getSleepDataLastNight(): Promise<{
  totalHours: number;
  deepSleepHours: number;
  remHours: number;
} | null> {
  const today = new Date();
  const sleepData = await getSleepData(today);

  if (!sleepData) {
    return null;
  }

  return {
    totalHours: sleepData.totalHours,
    deepSleepHours: sleepData.stages?.deep || 0,
    remHours: sleepData.stages?.rem || 0,
  };
}

// Get all health metrics at once for recovery score
export interface HealthMetricsData {
  hrv: HealthMetricSample | null;
  restingHeartRate: HealthMetricSample | null;
  respiratoryRate: HealthMetricSample | null;
  spO2: HealthMetricSample | null;
  skinTemp: HealthMetricSample | null;
  sleepLastNight: { totalHours: number; deepSleepHours: number; remHours: number } | null;
}

export async function getAllHealthMetrics(): Promise<HealthMetricsData> {
  const [hrv, restingHeartRate, respiratoryRate, spO2, skinTemp, sleepLastNight] = await Promise.all([
    getLatestHRV(),
    getLatestRestingHeartRate(),
    getLatestRespiratoryRate(),
    getLatestSpO2(),
    getLatestSkinTemp(),
    getSleepDataLastNight(),
  ]);

  return {
    hrv,
    restingHeartRate,
    respiratoryRate,
    spO2,
    skinTemp,
    sleepLastNight,
  };
}

// Check if HealthKit is available (for future use)
export async function isHealthKitAvailable(): Promise<boolean> {
  if (USE_MOCK_DATA) {
    return true; // Mock data is always available
  }

  // TODO: Check actual HealthKit availability
  return false;
}

// Request HealthKit permissions (for future use)
export async function requestHealthKitPermissions(): Promise<boolean> {
  if (USE_MOCK_DATA) {
    return true; // Mock permissions always granted
  }

  // TODO: Implement real permission request
  return false;
}

// ============== HEART RATE SAMPLES (for aerobic session auto-fill) ==============

export interface HeartRateAggregate {
  avg: number;
  max: number;
  count: number;
}

/**
 * Aggregate heart-rate samples over a time window. Used after an aerobic
 * session to enrich the logged entry with avg + max HR from Apple Watch.
 * Returns null when HealthKit is unavailable or no samples exist.
 */
export async function getHeartRateAggregateInRange(
  startDate: Date,
  endDate: Date,
): Promise<HeartRateAggregate | null> {
  if (Platform.OS !== 'ios' || !AppleHealthKit) return null;
  await initializeHealthKit();
  if (typeof AppleHealthKit.getHeartRateSamples !== 'function') {
    console.log('[HealthKit] getHeartRateSamples not available');
    return null;
  }

  const options = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    ascending: true,
  };

  return new Promise<HeartRateAggregate | null>((resolve) => {
    const timeout = setTimeout(() => {
      console.log('[HealthKit] getHeartRateSamples timed out');
      resolve(null);
    }, 8000);

    try {
      AppleHealthKit.getHeartRateSamples(options, (err: any, samples: any[]) => {
        clearTimeout(timeout);
        if (err) {
          console.log('[HealthKit] Heart rate samples error:', err);
          resolve(null);
          return;
        }
        const arr = Array.isArray(samples) ? samples : [];
        if (arr.length === 0) {
          resolve(null);
          return;
        }
        let sum = 0;
        let max = 0;
        for (const s of arr) {
          const v = typeof s.value === 'number' ? s.value : 0;
          if (v > 0) {
            sum += v;
            if (v > max) max = v;
          }
        }
        resolve({ avg: Math.round(sum / arr.length), max: Math.round(max), count: arr.length });
      });
    } catch (e) {
      clearTimeout(timeout);
      console.log('[HealthKit] Heart rate samples exception:', e);
      resolve(null);
    }
  });
}

/**
 * Find the most recent HealthKit workout that ENDED within the lookback window.
 * The aerobic logger calls this on focus + on demand to suggest auto-fill.
 * Defaults to the last 3 hours, which covers "just finished my session" without
 * accidentally pulling in this morning's run when logging an evening session.
 */
export async function getMostRecentHKWorkout(
  lookbackMinutes: number = 180,
): Promise<HealthKitWorkout | null> {
  const end = new Date();
  const start = new Date(end.getTime() - lookbackMinutes * 60 * 1000);
  const workouts = await getWorkoutsFromHealthKit(start, end);
  if (workouts.length === 0) return null;
  // Sort by end time descending — most recent first
  return [...workouts].sort((a, b) => {
    const ae = a.end ? new Date(a.end).getTime() : 0;
    const be = b.end ? new Date(b.end).getTime() : 0;
    return be - ae;
  })[0] ?? null;
}
