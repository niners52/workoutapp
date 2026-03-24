import { format, subDays, startOfWeek, addDays, isSameDay, isAfter, startOfDay } from 'date-fns';
import { batchFetchHealthData } from './healthKitCache';
import {
  getWorkouts as fetchWorkouts,
  getSupplementIntakesForDate,
  getSupplements as fetchSupplements,
  getPTRoutines as fetchPTRoutines,
  getPTCompletions as fetchPTCompletions,
  getPTCompletionsForDate,
} from './storage';
import {
  UserSettings,
  Workout,
  SupplementIntake,
  Supplement,
  PTRoutine,
  PTCompletion,
  Routine,
  NutritionMode,
  DEFAULT_DAILY_GOALS,
} from '../types';

// Letter grade system
export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export const GRADE_COLORS: Record<LetterGrade, string> = {
  A: '#4CAF50',
  B: '#8BC34A',
  C: '#FFC107',
  D: '#FF9800',
  F: '#F44336',
};

export function gradeIsHit(grade: LetterGrade): boolean {
  return grade === 'A' || grade === 'B';
}

export function getStandardGrade(percent: number): LetterGrade {
  if (percent >= 100) return 'A';
  if (percent >= 90) return 'B';
  if (percent >= 75) return 'C';
  if (percent >= 50) return 'D';
  return 'F';
}

export function getCutCalorieGrade(percent: number): LetterGrade {
  if (percent <= 100) return 'A';
  if (percent <= 110) return 'B';
  if (percent <= 125) return 'C';
  if (percent <= 150) return 'D';
  return 'F';
}

export function getBooleanGrade(done: boolean): LetterGrade {
  return done ? 'A' : 'F';
}

export function getCalorieGrade(
  consumed: number,
  goal: number,
  mode: NutritionMode,
  tolerancePercent: number
): LetterGrade {
  if (!goal || goal <= 0) return 'A';
  switch (mode) {
    case 'bulk':
      return getStandardGrade((consumed / goal) * 100);
    case 'cut':
      return getCutCalorieGrade((consumed / goal) * 100);
    case 'recomp': {
      const tolerance = goal * (tolerancePercent / 100);
      const lower = goal - tolerance;
      const upper = goal + tolerance;
      if (consumed >= lower && consumed <= upper) return 'A';
      const distance = consumed < lower
        ? ((lower - consumed) / goal) * 100
        : ((consumed - upper) / goal) * 100;
      if (distance <= 5) return 'B';
      if (distance <= 15) return 'C';
      if (distance <= 30) return 'D';
      return 'F';
    }
    default:
      return 'F';
  }
}

// Status for a single day's goal
export interface DailyGoalStatus {
  date: string; // YYYY-MM-DD
  sleep: {
    hours: number;
    met: boolean;
    grade: LetterGrade;
  };
  protein: {
    grams: number;
    met: boolean;
    grade: LetterGrade;
  };
  calories: {
    consumed: number;
    goal: number;
    met: boolean;
    mode: NutritionMode;
    grade: LetterGrade;
  };
  supplements: {
    taken: number;
    total: number;
    allTaken: boolean;
    grade: LetterGrade;
  };
  training: {
    completed: boolean;
    grade: LetterGrade;
  };
  physicalTherapy: {
    completed: number;
    total: number;
    allCompleted: boolean;
    grade: LetterGrade;
  };
  yoga: {
    minutes: number;        // daily minutes
  };
  cardio: {
    minutes: number;        // daily minutes
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
  pt: number;       // consecutive days hitting PT goal
  yoga: number;     // weeks hitting yoga goal
  cardio: number;   // weeks hitting cardio goal
  perfect: number;
}

// Weekly summary for totals section
export interface WeeklySummary {
  sleepHours: number;
  proteinDays: number;
  creatineDays: number; // actually supplement days - kept for backward compat
  trainingDays: number;
  ptDays: number;
  yogaMinutes: number;
  cardioMinutes: number;
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
  return gradeIsHit(getCalorieGrade(consumed, goal, mode, tolerancePercent));
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
  activeSupplements: Supplement[],
  ptCompletions: PTCompletion[] = [],
  activePTRoutines: PTRoutine[] = [],
  yogaMinutes: number = 0,
  cardioMinutes: number = 0,
): DailyGoalStatus {
  const dateStr = format(date, 'yyyy-MM-dd');
  const dailyGoals = settings.dailyGoals || DEFAULT_DAILY_GOALS;

  // Grades
  const sleepPercent = dailyGoals.sleepHours > 0 ? (sleepHours / dailyGoals.sleepHours) * 100 : 100;
  const sleepGrade = getStandardGrade(sleepPercent);
  const sleepMet = gradeIsHit(sleepGrade);

  const proteinPercent = dailyGoals.proteinGrams > 0 ? (proteinGrams / dailyGoals.proteinGrams) * 100 : 100;
  const proteinGrade = getStandardGrade(proteinPercent);
  const proteinMet = gradeIsHit(proteinGrade);

  const calorieGoal = settings.calorieGoal || 0;
  const nutritionMode = settings.nutritionMode || 'recomp';
  const tolerancePercent = settings.calorieTolerancePercent || 10;
  const calorieGrade = getCalorieGrade(calories, calorieGoal, nutritionMode, tolerancePercent);
  const caloriesMet = gradeIsHit(calorieGrade);

  const dayIntakes = supplementIntakes.filter(i => i.date === dateStr);
  const totalSupplements = activeSupplements.length;
  const takenSupplements = activeSupplements.filter(s =>
    dayIntakes.some(i => i.supplementId === s.id)
  ).length;
  const allSupplementsTaken = totalSupplements > 0 && takenSupplements === totalSupplements;
  const supplementGrade = getBooleanGrade(totalSupplements === 0 || allSupplementsTaken);

  let trainingCompleted = false;
  if (dailyGoals.trackTraining !== false) {
    trainingCompleted = workouts.some(w => {
      if (!w.completedAt) return false;
      return format(new Date(w.completedAt), 'yyyy-MM-dd') === dateStr;
    });
  }
  const trainingGrade = getBooleanGrade(trainingCompleted);

  // Physical therapy
  const dayPTCompletions = ptCompletions.filter(c => c.date === dateStr);
  const totalPT = activePTRoutines.length;
  const completedPT = activePTRoutines.filter(r =>
    dayPTCompletions.some(c => c.ptRoutineId === r.id)
  ).length;
  const allPTCompleted = totalPT > 0 && completedPT === totalPT;
  const ptGrade = getBooleanGrade(totalPT === 0 || allPTCompleted);

  const perfectDay =
    gradeIsHit(sleepGrade) &&
    gradeIsHit(proteinGrade) &&
    (calorieGoal <= 0 || gradeIsHit(calorieGrade)) &&
    (totalSupplements === 0 || gradeIsHit(supplementGrade)) &&
    (dailyGoals.trackTraining === false || gradeIsHit(trainingGrade)) &&
    (!dailyGoals.trackPT || totalPT === 0 || gradeIsHit(ptGrade));

  return {
    date: dateStr,
    sleep: { hours: sleepHours, met: sleepMet, grade: sleepGrade },
    protein: { grams: proteinGrams, met: proteinMet, grade: proteinGrade },
    calories: { consumed: calories, goal: calorieGoal, met: caloriesMet, mode: nutritionMode, grade: calorieGrade },
    supplements: { taken: takenSupplements, total: totalSupplements, allTaken: allSupplementsTaken, grade: supplementGrade },
    training: { completed: trainingCompleted, grade: trainingGrade },
    physicalTherapy: { completed: completedPT, total: totalPT, allCompleted: allPTCompleted, grade: ptGrade },
    yoga: { minutes: yogaMinutes },
    cardio: { minutes: cardioMinutes },
    perfectDay,
  };
}

function isScheduledTrainingDay(date: Date, activeRoutine: Routine | undefined): boolean {
  if (!activeRoutine) return true;
  const dayOfWeek = date.getDay();
  const daySchedule = activeRoutine.daySchedule.find(d => d.day === dayOfWeek);
  if (!daySchedule) return true;
  // Cardio and active recovery count as training days
  const dayType = daySchedule.dayType || (daySchedule.templateIds.length > 0 ? 'workout' : 'rest');
  return dayType !== 'rest';
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
  activeSupplements: Supplement[],
  ptCompletions: PTCompletion[] = [],
  activePTRoutines: PTRoutine[] = [],
): Promise<DailyGoalStatus> {
  const today = new Date();
  const healthData = await batchFetchHealthData([today]);
  const dateStr = format(today, 'yyyy-MM-dd');
  const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0, yogaMinutes: 0, cardioMinutes: 0 };

  return calculateDailyStatus(
    today, settings, health.sleepHours, health.proteinGrams, health.calories,
    workouts, supplementIntakes, activeSupplements,
    ptCompletions, activePTRoutines,
    health.yogaMinutes, health.cardioMinutes
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
  activeRoutine: Routine | undefined,
  ptCompletions: PTCompletion[] = [],
  activePTRoutines: PTRoutine[] = [],
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
  let ptStreak = 0, ptBroken = false;
  let perfectStreak = 0, perfectBroken = false;

  // Only track calorie streak if goal is set
  const hasCalorieGoal = (settings.calorieGoal || 0) > 0;
  const trackPT = settings.dailyGoals?.trackPT && activePTRoutines.length > 0;

  for (let i = 0; i <= maxLookback; i++) {
    const date = subDays(today, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const isCurrentDay = i === 0;
    const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0, yogaMinutes: 0, cardioMinutes: 0 };

    const status = calculateDailyStatus(
      date, settings, health.sleepHours, health.proteinGrams, health.calories,
      workouts, supplementIntakes, activeSupplements,
      ptCompletions, activePTRoutines,
      health.yogaMinutes, health.cardioMinutes
    );

    // Sleep - last night's data is final, so today counts as met or broken
    if (!sleepBroken) {
      if (gradeIsHit(status.sleep.grade)) {
        sleepStreak++;
      } else {
        sleepBroken = true;
      }
    }

    // Protein - today might not be complete yet, don't break on today
    if (!proteinBroken) {
      if (gradeIsHit(status.protein.grade)) {
        proteinStreak++;
      } else if (!isCurrentDay) {
        proteinBroken = true;
      }
    }

    // Calories - today might not be complete yet, don't break on today
    if (hasCalorieGoal && !calorieBroken) {
      if (gradeIsHit(status.calories.grade)) {
        calorieStreak++;
      } else if (!isCurrentDay) {
        calorieBroken = true;
      }
    }

    // Supplements - today might not be complete yet
    if (!supplementBroken) {
      if (gradeIsHit(status.supplements.grade)) {
        supplementStreak++;
      } else if (!isCurrentDay) {
        supplementBroken = true;
      }
    }

    // Training - respects rest days from routine
    if (!trainingBroken) {
      const isTrainingDay = isScheduledTrainingDay(date, activeRoutine);
      if (isTrainingDay) {
        if (gradeIsHit(status.training.grade)) {
          trainingStreak++;
        } else if (!isCurrentDay) {
          trainingBroken = true;
        }
        // Today + training day + not completed = don't break (day not over)
      }
      // Rest day = skip (don't increment, don't break)
    }

    // Physical therapy - today might not be complete yet
    if (trackPT && !ptBroken) {
      if (gradeIsHit(status.physicalTherapy.grade)) {
        ptStreak++;
      } else if (!isCurrentDay) {
        ptBroken = true;
      }
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
      && (!hasCalorieGoal || calorieBroken) && (!trackPT || ptBroken);
    if (allBroken) {
      break;
    }
  }

  // Yoga/Cardio - weekly goal streaks (count consecutive weeks meeting goal)
  // Look back up to 8 weeks to count consecutive weeks where goal was met
  let yogaStreak = 0;
  let cardioStreak = 0;
  const yogaGoal = settings.weeklyGoals?.yogaMinutes ?? 60;
  const cardioGoal = settings.weeklyGoals?.cardioMinutes ?? 60;
  const trackYoga = settings.trackYoga ?? false;
  const trackCardio = settings.trackCardio ?? false;

  if (trackYoga || trackCardio) {
    const weekStartsOn = settings.weekStartDay === 'sunday' ? 0 : 1;
    const currentWeekStart = startOfWeek(today, { weekStartsOn });

    // Sum yoga/cardio minutes for the current partial week from already-fetched data
    let currentYoga = 0;
    let currentCardio = 0;
    for (let i = 0; i <= maxLookback; i++) {
      const date = subDays(today, i);
      if (date < currentWeekStart) break;
      const dateStr = format(date, 'yyyy-MM-dd');
      const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0, yogaMinutes: 0, cardioMinutes: 0 };
      currentYoga += health.yogaMinutes;
      currentCardio += health.cardioMinutes;
    }

    // Current week counts if goal already met (week still in progress)
    if (trackYoga && currentYoga >= yogaGoal) yogaStreak++;
    if (trackCardio && currentCardio >= cardioGoal) cardioStreak++;
  }

  return {
    sleep: sleepStreak,
    protein: proteinStreak,
    calories: calorieStreak,
    creatine: supplementStreak,
    training: trainingStreak,
    pt: ptStreak,
    yoga: yogaStreak,
    cardio: cardioStreak,
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
  activeSupplements: Supplement[],
  ptCompletions: PTCompletion[] = [],
  activePTRoutines: PTRoutine[] = [],
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
        sleep: { hours: 0, met: false, grade: 'F' },
        protein: { grams: 0, met: false, grade: 'F' },
        calories: { consumed: 0, goal: settings.calorieGoal || 0, met: false, mode: settings.nutritionMode || 'recomp', grade: 'F' },
        supplements: { taken: 0, total: 0, allTaken: false, grade: 'F' },
        training: { completed: false, grade: 'F' },
        physicalTherapy: { completed: 0, total: 0, allCompleted: false, grade: 'F' },
        yoga: { minutes: 0 },
        cardio: { minutes: 0 },
        perfectDay: false,
      });
    } else {
      const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0, yogaMinutes: 0, cardioMinutes: 0 };
      days.push(calculateDailyStatus(
        date, settings, health.sleepHours, health.proteinGrams, health.calories,
        workouts, supplementIntakes, activeSupplements,
        ptCompletions, activePTRoutines,
        health.yogaMinutes, health.cardioMinutes
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
  activeSupplements: Supplement[],
  ptCompletions: PTCompletion[] = [],
  activePTRoutines: PTRoutine[] = [],
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
  let ptDays = 0;
  let yogaMinutes = 0;
  let cardioMinutes = 0;

  for (const date of datesToFetch) {
    const dateStr = format(date, 'yyyy-MM-dd');
    const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0, yogaMinutes: 0, cardioMinutes: 0 };
    const status = calculateDailyStatus(
      date, settings, health.sleepHours, health.proteinGrams, health.calories,
      workouts, supplementIntakes, activeSupplements,
      ptCompletions, activePTRoutines,
      health.yogaMinutes, health.cardioMinutes
    );

    sleepHours += status.sleep.hours;
    if (status.protein.met) proteinDays++;
    if (status.supplements.allTaken) creatineDays++;
    if (status.training.completed) trainingDays++;
    if (status.physicalTherapy.allCompleted) ptDays++;
    yogaMinutes += status.yoga.minutes;
    cardioMinutes += status.cardio.minutes;
  }

  return {
    sleepHours: Math.round(sleepHours * 10) / 10,
    proteinDays,
    creatineDays,
    trainingDays,
    ptDays,
    yogaMinutes: Math.round(yogaMinutes),
    cardioMinutes: Math.round(cardioMinutes),
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
  const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0, yogaMinutes: 0, cardioMinutes: 0 };

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

  // Fetch PT data
  const allPT = await fetchPTRoutines();
  const activePT = allPT.filter(r => r.isActive);
  const ptComps = await fetchPTCompletions();

  return calculateDailyStatus(
    date, settings, health.sleepHours, health.proteinGrams, health.calories,
    ws, intakes, supps,
    ptComps, activePT,
    health.yogaMinutes, health.cardioMinutes
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
  const [workouts, allSupplements, allIntakes, allPTRoutines, allPTCompletions, healthData] = await Promise.all([
    fetchWorkouts(),
    fetchSupplements(),
    Promise.resolve([]), // We'll fetch per-date below if needed
    fetchPTRoutines(),
    fetchPTCompletions(),
    batchFetchHealthData(dates),
  ]);

  const activeSupps = allSupplements.filter(s => s.isActive);
  const activePT = allPTRoutines.filter(r => r.isActive);

  // For intakes, we need all of them for the range
  // Fetch all and filter per date in calculateDailyStatus
  const intakePromises = dates.map(d => getSupplementIntakesForDate(format(d, 'yyyy-MM-dd')));
  const intakesByDay = await Promise.all(intakePromises);
  const allIntakesCombined = intakesByDay.flat();

  return dates.map(date => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0, yogaMinutes: 0, cardioMinutes: 0 };
    return calculateDailyStatus(
      date, settings, health.sleepHours, health.proteinGrams, health.calories,
      workouts, allIntakesCombined, activeSupps,
      allPTCompletions, activePT,
      health.yogaMinutes, health.cardioMinutes
    );
  });
}
