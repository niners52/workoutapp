import { format, subDays, startOfWeek, addDays, isSameDay, isAfter, startOfDay } from 'date-fns';
import { batchFetchHealthData } from './healthKitCache';
import {
  getWorkouts as fetchWorkouts,
  getSupplementIntakesForDate,
  getSupplements as fetchSupplements,
} from './storage';
import {
  UserSettings,
  Workout,
  SupplementIntake,
  Supplement,
  Routine,
  NutritionMode,
  DEFAULT_DAILY_GOALS,
} from '../types';

// Status for a single day's goal
export interface DailyGoalStatus {
  date: string; // YYYY-MM-DD
  sleep: {
    hours: number;
    met: boolean;
  };
  protein: {
    grams: number;
    met: boolean;
  };
  calories: {
    consumed: number;
    goal: number;
    met: boolean;
    mode: NutritionMode;
  };
  supplements: {
    taken: number;
    total: number;
    allTaken: boolean;
  };
  training: {
    completed: boolean;
  };
  perfectDay: boolean;
}

// Current streaks for display
export interface StreakCounts {
  sleep: number;
  protein: number;
  calories: number;
  creatine: number; // actually supplements - kept for backward compat
  training: number;
  perfect: number;
}

// Weekly summary for totals section
export interface WeeklySummary {
  sleepHours: number;
  proteinDays: number;
  creatineDays: number; // actually supplement days - kept for backward compat
  trainingDays: number;
}

// ============================================================
// SYNCHRONOUS HELPERS (no async, no HealthKit calls)
// ============================================================

/**
 * Check if calorie goal is met based on nutrition mode.
 * - Bulk: must eat at or above goal
 * - Cut: must stay at or below goal
 * - Recomp: must stay within tolerance window
 */
export function checkCalorieGoalMet(
  consumed: number,
  goal: number,
  mode: NutritionMode,
  tolerancePercent: number
): boolean {
  if (!goal || goal <= 0) return true; // No goal = always met

  switch (mode) {
    case 'bulk':
      return consumed >= goal;
    case 'cut':
      return consumed <= goal;
    case 'recomp':
      const tolerance = goal * (tolerancePercent / 100);
      return consumed >= (goal - tolerance) && consumed <= (goal + tolerance);
    default:
      return false;
  }
}

/**
 * Calculate daily goal status using pre-fetched data.
 * This is synchronous - all data must be provided.
 */
function calculateDailyStatus(
  date: Date,
  settings: UserSettings,
  sleepHours: number,
  proteinGrams: number,
  calories: number,
  workouts: Workout[],
  supplementIntakes: SupplementIntake[],
  activeSupplements: Supplement[]
): DailyGoalStatus {
  const dateStr = format(date, 'yyyy-MM-dd');
  const dailyGoals = settings.dailyGoals || DEFAULT_DAILY_GOALS;

  const sleepMet = sleepHours >= dailyGoals.sleepHours;
  const proteinMet = proteinGrams >= dailyGoals.proteinGrams;

  // Calorie goal based on nutrition mode
  const calorieGoal = settings.calorieGoal || 0;
  const nutritionMode = settings.nutritionMode || 'recomp';
  const tolerancePercent = settings.calorieTolerancePercent || 10;
  const caloriesMet = checkCalorieGoalMet(calories, calorieGoal, nutritionMode, tolerancePercent);

  // Filter intakes for this specific date
  const dayIntakes = supplementIntakes.filter(i => i.date === dateStr);
  const totalSupplements = activeSupplements.length;
  const takenSupplements = activeSupplements.filter(s =>
    dayIntakes.some(i => i.supplementId === s.id)
  ).length;
  const allSupplementsTaken = totalSupplements > 0 && takenSupplements === totalSupplements;

  let trainingCompleted = false;
  if (dailyGoals.trackTraining !== false) {
    trainingCompleted = workouts.some(w => {
      if (!w.completedAt) return false;
      return format(new Date(w.completedAt), 'yyyy-MM-dd') === dateStr;
    });
  }

  // Perfect day requires all goals met (calories only if goal is set)
  const perfectDay =
    sleepMet &&
    proteinMet &&
    (calorieGoal <= 0 || caloriesMet) &&
    (totalSupplements === 0 || allSupplementsTaken) &&
    (dailyGoals.trackTraining === false || trainingCompleted);

  return {
    date: dateStr,
    sleep: { hours: sleepHours, met: sleepMet },
    protein: { grams: proteinGrams, met: proteinMet },
    calories: { consumed: calories, goal: calorieGoal, met: caloriesMet, mode: nutritionMode },
    supplements: { taken: takenSupplements, total: totalSupplements, allTaken: allSupplementsTaken },
    training: { completed: trainingCompleted },
    perfectDay,
  };
}

function isScheduledTrainingDay(date: Date, activeRoutine: Routine | undefined): boolean {
  if (!activeRoutine) return true;
  const dayOfWeek = date.getDay();
  const daySchedule = activeRoutine.daySchedule.find(d => d.day === dayOfWeek);
  if (!daySchedule) return true;
  return daySchedule.templateIds.length > 0;
}

// ============================================================
// MAIN FUNCTIONS - accept pre-fetched data from caller
// Only HealthKit data is fetched internally (via batch)
// ============================================================

/**
 * Get today's goal status.
 * Pass workouts, supplementIntakes, and activeSupplements from DataContext or storage.
 */
export async function getTodayGoalStatus(
  settings: UserSettings,
  workouts: Workout[],
  supplementIntakes: SupplementIntake[],
  activeSupplements: Supplement[]
): Promise<DailyGoalStatus> {
  const today = new Date();
  const healthData = await batchFetchHealthData([today]);
  const dateStr = format(today, 'yyyy-MM-dd');
  const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0 };

  return calculateDailyStatus(
    today, settings, health.sleepHours, health.proteinGrams, health.calories,
    workouts, supplementIntakes, activeSupplements
  );
}

/**
 * Calculate streak counts.
 * Looks backward up to 30 days from today.
 * Batch fetches all HealthKit data upfront, then loops synchronously.
 */
export async function calculateStreaks(
  settings: UserSettings,
  workouts: Workout[],
  supplementIntakes: SupplementIntake[],
  activeSupplements: Supplement[],
  activeRoutine: Routine | undefined
): Promise<StreakCounts> {
  const today = startOfDay(new Date());
  const maxLookback = 30;

  // Build array of dates we need
  const dates: Date[] = [];
  for (let i = 0; i <= maxLookback; i++) {
    dates.push(subDays(today, i));
  }

  // Batch fetch ALL health data upfront (parallel, chunked, with timeouts)
  const healthData = await batchFetchHealthData(dates);

  // Now calculate streaks synchronously using pre-fetched data
  let sleepStreak = 0, sleepBroken = false;
  let proteinStreak = 0, proteinBroken = false;
  let calorieStreak = 0, calorieBroken = false;
  let supplementStreak = 0, supplementBroken = false;
  let trainingStreak = 0, trainingBroken = false;
  let perfectStreak = 0, perfectBroken = false;

  // Only track calorie streak if goal is set
  const hasCalorieGoal = (settings.calorieGoal || 0) > 0;

  for (let i = 0; i <= maxLookback; i++) {
    const date = subDays(today, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const isCurrentDay = i === 0;
    const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0 };

    const status = calculateDailyStatus(
      date, settings, health.sleepHours, health.proteinGrams, health.calories,
      workouts, supplementIntakes, activeSupplements
    );

    // Sleep - last night's data is final, so today counts as met or broken
    if (!sleepBroken) {
      if (status.sleep.met) {
        sleepStreak++;
      } else {
        sleepBroken = true;
      }
    }

    // Protein - today might not be complete yet, don't break on today
    if (!proteinBroken) {
      if (status.protein.met) {
        proteinStreak++;
      } else if (!isCurrentDay) {
        proteinBroken = true;
      }
    }

    // Calories - today might not be complete yet, don't break on today
    if (hasCalorieGoal && !calorieBroken) {
      if (status.calories.met) {
        calorieStreak++;
      } else if (!isCurrentDay) {
        calorieBroken = true;
      }
    }

    // Supplements - today might not be complete yet
    if (!supplementBroken) {
      if (status.supplements.allTaken) {
        supplementStreak++;
      } else if (!isCurrentDay) {
        supplementBroken = true;
      }
    }

    // Training - respects rest days from routine
    if (!trainingBroken) {
      const isTrainingDay = isScheduledTrainingDay(date, activeRoutine);
      if (isTrainingDay) {
        if (status.training.completed) {
          trainingStreak++;
        } else if (!isCurrentDay) {
          trainingBroken = true;
        }
        // Today + training day + not completed = don't break (day not over)
      }
      // Rest day = skip (don't increment, don't break)
    }

    // Perfect day
    if (!perfectBroken) {
      if (status.perfectDay) {
        perfectStreak++;
      } else if (!isCurrentDay) {
        perfectBroken = true;
      }
    }

    // All broken = stop early
    const allBroken = sleepBroken && proteinBroken && supplementBroken && trainingBroken && perfectBroken
      && (!hasCalorieGoal || calorieBroken);
    if (allBroken) {
      break;
    }
  }

  return {
    sleep: sleepStreak,
    protein: proteinStreak,
    calories: calorieStreak,
    creatine: supplementStreak,
    training: trainingStreak,
    perfect: perfectStreak,
  };
}

/**
 * Get weekly grid data (7 days based on weekStartDay).
 */
export async function getWeeklyGridData(
  settings: UserSettings,
  workouts: Workout[],
  supplementIntakes: SupplementIntake[],
  activeSupplements: Supplement[]
): Promise<{
  days: DailyGoalStatus[];
  todayIndex: number;
  dayLabels: string[];
}> {
  const today = startOfDay(new Date());
  const weekStartsOn = settings.weekStartDay === 'sunday' ? 0 : 1;
  const weekStart = startOfWeek(today, { weekStartsOn });

  // Only need health data for today and past days
  const datesToFetch: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    if (!isAfter(startOfDay(date), today)) {
      datesToFetch.push(date);
    }
  }

  // Batch fetch health data
  const healthData = await batchFetchHealthData(datesToFetch);

  // Build grid synchronously
  const days: DailyGoalStatus[] = [];
  const dayLabels: string[] = [];
  let todayIndex = -1;

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dateStr = format(date, 'yyyy-MM-dd');

    if (isAfter(startOfDay(date), today)) {
      // Future day - empty status
      days.push({
        date: dateStr,
        sleep: { hours: 0, met: false },
        protein: { grams: 0, met: false },
        calories: { consumed: 0, goal: settings.calorieGoal || 0, met: false, mode: settings.nutritionMode || 'recomp' },
        supplements: { taken: 0, total: 0, allTaken: false },
        training: { completed: false },
        perfectDay: false,
      });
    } else {
      const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0 };
      days.push(calculateDailyStatus(
        date, settings, health.sleepHours, health.proteinGrams, health.calories,
        workouts, supplementIntakes, activeSupplements
      ));
    }

    if (isSameDay(date, today)) todayIndex = i;
    dayLabels.push(format(date, 'EEEEE'));
  }

  return { days, todayIndex, dayLabels };
}

/**
 * Calculate weekly summary totals.
 */
export async function getWeeklySummary(
  settings: UserSettings,
  workouts: Workout[],
  supplementIntakes: SupplementIntake[],
  activeSupplements: Supplement[]
): Promise<WeeklySummary> {
  const today = startOfDay(new Date());
  const weekStartsOn = settings.weekStartDay === 'sunday' ? 0 : 1;
  const weekStart = startOfWeek(today, { weekStartsOn });

  const datesToFetch: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    if (!isAfter(startOfDay(date), today)) {
      datesToFetch.push(date);
    }
  }

  const healthData = await batchFetchHealthData(datesToFetch);

  let sleepHours = 0;
  let proteinDays = 0;
  let creatineDays = 0;
  let trainingDays = 0;

  for (const date of datesToFetch) {
    const dateStr = format(date, 'yyyy-MM-dd');
    const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0 };
    const status = calculateDailyStatus(
      date, settings, health.sleepHours, health.proteinGrams, health.calories,
      workouts, supplementIntakes, activeSupplements
    );

    sleepHours += status.sleep.hours;
    if (status.protein.met) proteinDays++;
    if (status.supplements.allTaken) creatineDays++;
    if (status.training.completed) trainingDays++;
  }

  return {
    sleepHours: Math.round(sleepHours * 10) / 10,
    proteinDays,
    creatineDays,
    trainingDays,
  };
}

// ============================================================
// BACKWARD COMPATIBILITY
// These functions fetch their own data if not provided.
// Prefer the versions above that accept pre-fetched data.
// ============================================================

export async function getDailyGoalStatus(
  date: Date,
  settings: UserSettings,
  workouts?: Workout[],
  supplementIntakes?: SupplementIntake[],
  activeSupplements?: Supplement[]
): Promise<DailyGoalStatus> {
  const healthData = await batchFetchHealthData([date]);
  const dateStr = format(date, 'yyyy-MM-dd');
  const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0 };

  // Fetch from storage if not provided
  let ws = workouts;
  let intakes = supplementIntakes;
  let supps = activeSupplements;

  if (!ws) {
    ws = await fetchWorkouts();
  }
  if (!intakes) {
    intakes = await getSupplementIntakesForDate(dateStr);
  }
  if (!supps) {
    const allSupps = await fetchSupplements();
    supps = allSupps.filter((s: Supplement) => s.isActive);
  }

  return calculateDailyStatus(
    date, settings, health.sleepHours, health.proteinGrams, health.calories,
    ws, intakes, supps
  );
}

export async function getDailyGoalStatusRange(
  startDate: Date,
  endDate: Date,
  settings: UserSettings
): Promise<DailyGoalStatus[]> {
  const dates: Date[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  // Pre-fetch all data
  const [workouts, allSupplements, allIntakes, healthData] = await Promise.all([
    fetchWorkouts(),
    fetchSupplements(),
    Promise.resolve([]), // We'll fetch per-date below if needed
    batchFetchHealthData(dates),
  ]);

  const activeSupps = allSupplements.filter(s => s.isActive);

  // For intakes, we need all of them for the range
  // Fetch all and filter per date in calculateDailyStatus
  const intakePromises = dates.map(d => getSupplementIntakesForDate(format(d, 'yyyy-MM-dd')));
  const intakesByDay = await Promise.all(intakePromises);
  const allIntakesCombined = intakesByDay.flat();

  return dates.map(date => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0 };
    return calculateDailyStatus(
      date, settings, health.sleepHours, health.proteinGrams, health.calories,
      workouts, allIntakesCombined, activeSupps
    );
  });
}
