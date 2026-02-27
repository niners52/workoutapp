/**
 * Monthly Report Generator
 *
 * Aggregates a full month of data into a comprehensive report card
 * with grades, highlights, and areas to improve.
 */

import {
  startOfMonth,
  endOfMonth,
  format,
  eachDayOfInterval,
  parse,
  addDays,
} from 'date-fns';
import { PrimaryMuscleGroup, MUSCLE_GROUP_DISPLAY_NAMES } from '../../types';
import {
  calculateAllMuscleStrengthLevels,
  STRENGTH_LEVEL_LABELS,
  STRENGTH_LEVELS,
  StrengthLevel,
} from '../strengthStandards';
import { MonthlyReport, InsightsInput } from './types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function displayName(mg: string): string {
  return (MUSCLE_GROUP_DISPLAY_NAMES as Record<string, string>)[mg] || mg;
}

function levelIndex(level: StrengthLevel): number {
  return STRENGTH_LEVELS.indexOf(level);
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ─── Generate Report ───────────────────────────────────────────────────────

export async function generateMonthlyReportData(
  input: InsightsInput,
  month: string // 'YYYY-MM'
): Promise<MonthlyReport> {
  const monthStart = startOfMonth(parse(month, 'yyyy-MM', new Date()));
  const monthEnd = endOfMonth(monthStart);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

  const { workouts, sets, exercises, bodyMeasurements, userSettings, bodyWeightLbs, nutritionHistory } = input;

  // ── Training Score ──────────────────────────────────────────────────────

  const monthWorkouts = workouts.filter(w => {
    if (!w.completedAt) return false;
    const d = format(new Date(w.completedAt), 'yyyy-MM-dd');
    return d >= monthStartStr && d <= monthEndStr;
  });

  const workoutsCompleted = monthWorkouts.length;

  // Simple training score: workouts / expected training days
  const expectedTraining = userSettings.weeklyGoals.trainingDays * 4.33; // ~4.33 weeks/month
  const trainingScore = Math.min(100, Math.round((workoutsCompleted / expectedTraining) * 100));

  // Count total sets this month
  const monthWorkoutIds = new Set(monthWorkouts.map(w => w.id));
  const monthSets = sets.filter(s => monthWorkoutIds.has(s.workoutId));
  const totalSets = monthSets.length;
  const totalVolume = monthSets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);

  // ── Nutrition Score ─────────────────────────────────────────────────────

  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  let proteinDaysMet = 0;
  let calorieDaysMet = 0;
  let daysWithNutrition = 0;

  for (const day of daysInMonth) {
    const dateStr = format(day, 'yyyy-MM-dd');
    const nutrition = nutritionHistory.get(dateStr);
    if (!nutrition) continue;
    daysWithNutrition++;

    if (nutrition.protein >= userSettings.dailyGoals.proteinGrams) {
      proteinDaysMet++;
    }
    if (userSettings.calorieGoal && nutrition.calories >= userSettings.calorieGoal * 0.9) {
      calorieDaysMet++;
    }
  }

  const nutritionScore = daysWithNutrition > 0
    ? Math.round((proteinDaysMet / daysWithNutrition) * 100)
    : 0;

  // ── Consistency Score ───────────────────────────────────────────────────

  // Based on how evenly spaced workouts are (not just count)
  const workoutDates = monthWorkouts
    .map(w => new Date(w.completedAt!).getTime())
    .sort((a, b) => a - b);

  let consistencyScore = 0;
  if (workoutDates.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < workoutDates.length; i++) {
      gaps.push((workoutDates[i] - workoutDates[i - 1]) / (1000 * 60 * 60 * 24));
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const expectedGap = 7 / userSettings.weeklyGoals.trainingDays;
    // Score based on how close average gap is to expected
    const gapRatio = Math.min(avgGap, expectedGap) / Math.max(avgGap, expectedGap);
    consistencyScore = Math.round(gapRatio * 100);
  } else if (workoutDates.length === 1) {
    consistencyScore = 25;
  }

  // ── Perfect Days ────────────────────────────────────────────────────────

  let perfectDays = 0;
  for (const day of daysInMonth) {
    const dateStr = format(day, 'yyyy-MM-dd');
    const nutrition = nutritionHistory.get(dateStr);
    const proteinMet = nutrition && nutrition.protein >= userSettings.dailyGoals.proteinGrams;
    const hadWorkout = monthWorkouts.some(w => {
      const wd = format(new Date(w.completedAt!), 'yyyy-MM-dd');
      return wd === dateStr;
    });
    // Perfect day = protein met + trained (on training days)
    if (proteinMet && hadWorkout) {
      perfectDays++;
    }
  }

  // ── PRs Count ───────────────────────────────────────────────────────────

  // Count sets that were workout-best e1RM in the month (simplified PR detection)
  let prsCount = 0;
  const exerciseBests = new Map<string, number>(); // exerciseId -> best e1RM before this month
  const priorSets = sets.filter(s => {
    const w = workouts.find(wk => wk.id === s.workoutId);
    if (!w?.completedAt) return false;
    return format(new Date(w.completedAt), 'yyyy-MM-dd') < monthStartStr;
  });

  for (const s of priorSets) {
    if (!s.weight || !s.reps || s.reps === 0) continue;
    const e1rm = s.weight * (1 + s.reps / 30); // Epley formula
    const prev = exerciseBests.get(s.exerciseId) || 0;
    if (e1rm > prev) exerciseBests.set(s.exerciseId, e1rm);
  }

  for (const s of monthSets) {
    if (!s.weight || !s.reps || s.reps === 0) continue;
    const e1rm = s.weight * (1 + s.reps / 30);
    const prevBest = exerciseBests.get(s.exerciseId) || 0;
    if (e1rm > prevBest) {
      prsCount++;
      exerciseBests.set(s.exerciseId, e1rm); // Update for subsequent sets
    }
  }

  // ── Strength Changes ────────────────────────────────────────────────────

  const strengthChanges: MonthlyReport['strengthChanges'] = [];
  if (bodyWeightLbs && bodyWeightLbs > 0) {
    const currentLevels = calculateAllMuscleStrengthLevels(exercises, sets, workouts, bodyWeightLbs);
    const atMonthStart = calculateAllMuscleStrengthLevels(exercises, sets, workouts, bodyWeightLbs, {
      beforeDate: monthStart,
    });

    for (const [mg, current] of currentLevels) {
      const start = atMonthStart.get(mg);
      if (!start) continue;
      if (current.level !== start.level) {
        strengthChanges.push({
          muscle: displayName(mg),
          from: STRENGTH_LEVEL_LABELS[start.level],
          to: STRENGTH_LEVEL_LABELS[current.level],
        });
      }
    }
  }

  // ── Body Changes ────────────────────────────────────────────────────────

  const bodyChanges: MonthlyReport['bodyChanges'] = [];

  // Weight change
  const weightStart = bodyMeasurements
    .filter(m => m.weight && m.date >= monthStartStr && m.date <= format(addDays(monthStart, 7), 'yyyy-MM-dd'))
    .map(m => m.weight!);
  const weightEnd = bodyMeasurements
    .filter(m => m.weight && m.date >= format(addDays(monthEnd, -7), 'yyyy-MM-dd') && m.date <= monthEndStr)
    .map(m => m.weight!);

  if (weightStart.length > 0 && weightEnd.length > 0) {
    const avgStart = weightStart.reduce((s, w) => s + w, 0) / weightStart.length;
    const avgEnd = weightEnd.reduce((s, w) => s + w, 0) / weightEnd.length;
    const change = avgEnd - avgStart;
    if (Math.abs(change) >= 0.5) {
      bodyChanges.push({
        metric: 'Body Weight',
        change: `${change > 0 ? '+' : ''}${change.toFixed(1)} lbs`,
        direction: change > 0 ? 'up' : 'down',
      });
    }
  }

  // Body fat change
  const bfStart = bodyMeasurements
    .filter(m => m.bodyFatPercentage && m.date >= monthStartStr && m.date <= format(addDays(monthStart, 10), 'yyyy-MM-dd'));
  const bfEnd = bodyMeasurements
    .filter(m => m.bodyFatPercentage && m.date >= format(addDays(monthEnd, -10), 'yyyy-MM-dd') && m.date <= monthEndStr);

  if (bfStart.length > 0 && bfEnd.length > 0) {
    const avgBfStart = bfStart.reduce((s, m) => s + m.bodyFatPercentage!, 0) / bfStart.length;
    const avgBfEnd = bfEnd.reduce((s, m) => s + m.bodyFatPercentage!, 0) / bfEnd.length;
    const change = avgBfEnd - avgBfStart;
    if (Math.abs(change) >= 0.3) {
      bodyChanges.push({
        metric: 'Body Fat',
        change: `${change > 0 ? '+' : ''}${change.toFixed(1)}%`,
        direction: change > 0 ? 'up' : 'down',
      });
    }
  }

  // ── Highlights & Areas to Improve ───────────────────────────────────────

  const highlights: string[] = [];
  const areasToImprove: string[] = [];

  if (prsCount > 0) highlights.push(`Set ${prsCount} personal record${prsCount > 1 ? 's' : ''}`);
  if (strengthChanges.length > 0) {
    const ups = strengthChanges.filter(c => levelIndex(STRENGTH_LEVELS.indexOf(c.to as any) as any) > -1);
    if (ups.length > 0) highlights.push(`Strength level up in ${ups.map(c => c.muscle).join(', ')}`);
  }
  if (trainingScore >= 90) highlights.push('Exceptional training consistency');
  else if (trainingScore >= 75) highlights.push('Strong training consistency');
  if (nutritionScore >= 80) highlights.push('Great protein compliance');
  if (perfectDays >= 10) highlights.push(`${perfectDays} perfect days this month`);
  if (totalVolume > 0) highlights.push(`${totalSets} total sets completed`);

  if (trainingScore < 60) areasToImprove.push('Training frequency below target');
  if (nutritionScore > 0 && nutritionScore < 60) areasToImprove.push('Protein goal consistency needs work');
  if (consistencyScore < 50) areasToImprove.push('Training schedule is inconsistent — try to space workouts evenly');
  if (prsCount === 0 && workoutsCompleted >= 8) areasToImprove.push('No PRs this month — consider progressive overload');
  if (perfectDays <= 2 && daysWithNutrition > 10) areasToImprove.push('Few perfect days — align training and nutrition');

  // ── Overall Grade ───────────────────────────────────────────────────────

  const overallScore = Math.round(
    trainingScore * 0.4 +
    nutritionScore * 0.3 +
    consistencyScore * 0.3
  );

  return {
    month,
    generatedAt: new Date().toISOString(),
    trainingScore,
    nutritionScore,
    consistencyScore,
    overallGrade: scoreToGrade(overallScore),
    highlights: highlights.slice(0, 3),
    areasToImprove: areasToImprove.slice(0, 3),
    strengthChanges,
    bodyChanges,
    prsCount,
    workoutsCompleted,
    perfectDays,
  };
}
