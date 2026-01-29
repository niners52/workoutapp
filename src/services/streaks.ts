import { format, subDays, startOfWeek, addDays, isSameDay, isAfter, isBefore, startOfDay } from 'date-fns';
import { getSleepData, getNutritionData } from './healthKit';
import { getWorkouts, getSupplementIntakesForDate, getUserSettings } from './storage';
import { DailyGoals, WeeklyGoals, UserSettings, Workout, SupplementIntake } from '../types';

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
  creatine: {
    taken: boolean;
  };
  training: {
    completed: boolean;
  };
  perfectDay: boolean; // All tracked goals met
}

// Current streaks for display
export interface StreakCounts {
  sleep: number;
  protein: number;
  creatine: number;
  training: number;
  perfect: number;
}

// Weekly summary for totals section
export interface WeeklySummary {
  sleepHours: number;
  proteinDays: number;
  creatineDays: number;
  trainingDays: number;
}

// Get status for a single day
export async function getDailyGoalStatus(
  date: Date,
  settings: UserSettings,
  workouts?: Workout[],
  supplementIntakes?: SupplementIntake[]
): Promise<DailyGoalStatus> {
  const dateStr = format(date, 'yyyy-MM-dd');
  const { dailyGoals } = settings;

  // Get sleep data (for the morning of this date - last night's sleep)
  const sleepData = await getSleepData(date);
  const sleepHours = sleepData?.totalHours || 0;
  const sleepMet = sleepHours >= dailyGoals.sleepHours;

  // Get protein data
  const nutritionData = await getNutritionData(date);
  const proteinGrams = nutritionData?.protein || 0;
  const proteinMet = proteinGrams >= dailyGoals.proteinGrams;

  // Get creatine status (check supplement intakes)
  let creatineTaken = false;
  if (dailyGoals.trackCreatine && settings.creatineSupplementId) {
    const intakes = supplementIntakes || await getSupplementIntakesForDate(dateStr);
    creatineTaken = intakes.some(i => i.supplementId === settings.creatineSupplementId);
  }

  // Get training status (check if any completed workout exists for this date)
  let trainingCompleted = false;
  if (dailyGoals.trackTraining) {
    const allWorkouts = workouts || await getWorkouts();
    trainingCompleted = allWorkouts.some(w => {
      if (!w.completedAt) return false;
      const workoutDate = format(new Date(w.startedAt), 'yyyy-MM-dd');
      return workoutDate === dateStr;
    });
  }

  // Perfect day = all tracked goals met
  const perfectDay =
    sleepMet &&
    proteinMet &&
    (!dailyGoals.trackCreatine || creatineTaken) &&
    (!dailyGoals.trackTraining || trainingCompleted);

  return {
    date: dateStr,
    sleep: { hours: sleepHours, met: sleepMet },
    protein: { grams: proteinGrams, met: proteinMet },
    creatine: { taken: creatineTaken },
    training: { completed: trainingCompleted },
    perfectDay,
  };
}

// Get status for multiple days
export async function getDailyGoalStatusRange(
  startDate: Date,
  endDate: Date,
  settings: UserSettings
): Promise<DailyGoalStatus[]> {
  const statuses: DailyGoalStatus[] = [];
  const current = new Date(startDate);

  // Pre-fetch workouts and supplement intakes for the range
  const workouts = await getWorkouts();

  while (current <= endDate) {
    // Get supplement intakes for this specific date
    const dateStr = format(current, 'yyyy-MM-dd');
    const supplementIntakes = await getSupplementIntakesForDate(dateStr);

    const status = await getDailyGoalStatus(current, settings, workouts, supplementIntakes);
    statuses.push(status);
    current.setDate(current.getDate() + 1);
  }

  return statuses;
}

// Calculate streak counts (looking backward from yesterday)
export async function calculateStreaks(settings: UserSettings): Promise<StreakCounts> {
  const today = startOfDay(new Date());
  const yesterday = subDays(today, 1);

  // Pre-fetch data
  const workouts = await getWorkouts();

  // Track streaks going backward
  let sleepStreak = 0;
  let proteinStreak = 0;
  let creatineStreak = 0;
  let trainingStreak = 0;
  let perfectStreak = 0;

  // Also check if today's goals are already met
  const todayDateStr = format(today, 'yyyy-MM-dd');
  const todayIntakes = await getSupplementIntakesForDate(todayDateStr);
  const todayStatus = await getDailyGoalStatus(today, settings, workouts, todayIntakes);

  // Count today if goals are met
  if (todayStatus.sleep.met) sleepStreak++;
  if (todayStatus.protein.met) proteinStreak++;
  if (todayStatus.creatine.taken) creatineStreak++;
  if (todayStatus.training.completed) trainingStreak++;
  if (todayStatus.perfectDay) perfectStreak++;

  // Look backward from yesterday (max 365 days)
  let currentDate = yesterday;
  const maxLookback = 365;

  for (let i = 0; i < maxLookback; i++) {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const intakes = await getSupplementIntakesForDate(dateStr);
    const status = await getDailyGoalStatus(currentDate, settings, workouts, intakes);

    // Check each streak
    let anyContinued = false;

    if (sleepStreak === i + (todayStatus.sleep.met ? 1 : 0) && status.sleep.met) {
      sleepStreak++;
      anyContinued = true;
    }

    if (proteinStreak === i + (todayStatus.protein.met ? 1 : 0) && status.protein.met) {
      proteinStreak++;
      anyContinued = true;
    }

    if (settings.dailyGoals.trackCreatine) {
      if (creatineStreak === i + (todayStatus.creatine.taken ? 1 : 0) && status.creatine.taken) {
        creatineStreak++;
        anyContinued = true;
      }
    }

    if (settings.dailyGoals.trackTraining) {
      if (trainingStreak === i + (todayStatus.training.completed ? 1 : 0) && status.training.completed) {
        trainingStreak++;
        anyContinued = true;
      }
    }

    if (perfectStreak === i + (todayStatus.perfectDay ? 1 : 0) && status.perfectDay) {
      perfectStreak++;
      anyContinued = true;
    }

    // If no streaks continued, we can stop early
    if (!anyContinued) break;

    currentDate = subDays(currentDate, 1);
  }

  return {
    sleep: sleepStreak,
    protein: proteinStreak,
    creatine: creatineStreak,
    training: trainingStreak,
    perfect: perfectStreak,
  };
}

// Get weekly data for the grid (7 days based on weekStartDay)
export async function getWeeklyGridData(
  settings: UserSettings
): Promise<{
  days: DailyGoalStatus[];
  todayIndex: number;
  dayLabels: string[];
}> {
  const today = startOfDay(new Date());
  const weekStartsOn = settings.weekStartDay === 'sunday' ? 0 : 1;
  const weekStart = startOfWeek(today, { weekStartsOn });

  // Get status for all 7 days
  const days: DailyGoalStatus[] = [];
  const dayLabels: string[] = [];
  let todayIndex = -1;

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const intakes = await getSupplementIntakesForDate(dateStr);
    const workouts = await getWorkouts();

    // Only get data for past days and today
    if (isAfter(date, today)) {
      // Future day - empty status
      days.push({
        date: dateStr,
        sleep: { hours: 0, met: false },
        protein: { grams: 0, met: false },
        creatine: { taken: false },
        training: { completed: false },
        perfectDay: false,
      });
    } else {
      const status = await getDailyGoalStatus(date, settings, workouts, intakes);
      days.push(status);
    }

    // Track today's index
    if (isSameDay(date, today)) {
      todayIndex = i;
    }

    // Day label (first letter)
    const dayName = format(date, 'EEEEE'); // Single letter day
    dayLabels.push(dayName);
  }

  return { days, todayIndex, dayLabels };
}

// Calculate weekly summary totals
export async function getWeeklySummary(settings: UserSettings): Promise<WeeklySummary> {
  const today = startOfDay(new Date());
  const weekStartsOn = settings.weekStartDay === 'sunday' ? 0 : 1;
  const weekStart = startOfWeek(today, { weekStartsOn });

  let sleepHours = 0;
  let proteinDays = 0;
  let creatineDays = 0;
  let trainingDays = 0;

  const workouts = await getWorkouts();

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);

    // Skip future days
    if (isAfter(date, today)) continue;

    const dateStr = format(date, 'yyyy-MM-dd');
    const intakes = await getSupplementIntakesForDate(dateStr);
    const status = await getDailyGoalStatus(date, settings, workouts, intakes);

    sleepHours += status.sleep.hours;
    if (status.protein.met) proteinDays++;
    if (status.creatine.taken) creatineDays++;
    if (status.training.completed) trainingDays++;
  }

  return {
    sleepHours: Math.round(sleepHours * 10) / 10,
    proteinDays,
    creatineDays,
    trainingDays,
  };
}

// Get today's goal status (convenience function)
export async function getTodayGoalStatus(settings: UserSettings): Promise<DailyGoalStatus> {
  const today = new Date();
  const workouts = await getWorkouts();
  const dateStr = format(today, 'yyyy-MM-dd');
  const intakes = await getSupplementIntakesForDate(dateStr);
  return getDailyGoalStatus(today, settings, workouts, intakes);
}
