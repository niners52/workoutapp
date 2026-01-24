import { Platform } from 'react-native';
import { NutritionData, SleepData, SleepStages } from '../types';
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
      'DietaryProtein',
      'DietaryCarbohydrates',
      'DietaryFatTotal',
      'DietaryEnergyConsumed',
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
    type: 'Workout',
  };

  return new Promise((resolve) => {
    AppleHealthKit.getSamples(options, (error: string, results: any[]) => {
      if (error) {
        console.log('Error getting workouts from HealthKit:', error);
        resolve([]);
        return;
      }

      const workouts: HealthKitWorkout[] = (results || []).map((sample: any) => ({
        id: sample.id || `hk-${sample.startDate}`,
        activityName: sample.activityName || 'Workout',
        calories: sample.calories || 0,
        distance: sample.distance || 0,
        start: sample.startDate,
        end: sample.endDate,
        duration: sample.duration ? sample.duration / 60 : 0,
        sourceName: sample.sourceName || 'Unknown',
        sourceId: sample.sourceId || '',
      }));

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

  // Helper to fetch nutrition samples
  const fetchNutritionSample = (type: string): Promise<number> => {
    return new Promise((resolve) => {
      const sampleOptions = {
        ...options,
        type,
      };
      AppleHealthKit.getSamples(sampleOptions, (err: string, results: any[]) => {
        if (err) {
          console.log(`Error fetching ${type}:`, err);
          resolve(0);
          return;
        }
        if (!results || results.length === 0) {
          console.log(`No ${type} data found`);
          resolve(0);
          return;
        }
        const total = results.reduce((sum: number, sample: any) => sum + (sample.value || 0), 0);
        console.log(`${type} total:`, total);
        resolve(Math.round(total));
      });
    });
  };

  // Fetch all nutrition data in parallel
  // Using full HKQuantityTypeIdentifier format
  const [protein, carbs, fat, calories] = await Promise.all([
    fetchNutritionSample('HKQuantityTypeIdentifierDietaryProtein'),
    fetchNutritionSample('HKQuantityTypeIdentifierDietaryCarbohydrates'),
    fetchNutritionSample('HKQuantityTypeIdentifierDietaryFatTotal'),
    fetchNutritionSample('HKQuantityTypeIdentifierDietaryEnergyConsumed'),
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

      // Filter for sleep samples that ended on the target date (the morning of)
      const targetDateStr = format(date, 'yyyy-MM-dd');
      const sleepSamples = results.filter((sample: any) => {
        const sampleEndDate = new Date(sample.endDate);
        return format(sampleEndDate, 'yyyy-MM-dd') === targetDateStr;
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
