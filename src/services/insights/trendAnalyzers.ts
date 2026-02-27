/**
 * Trend Analyzers
 *
 * 4. Phase Recommendations — when to switch bulk/cut/recomp
 * 5. Trend Predictions — linear extrapolation on key metrics
 * 6. Smart Alerts — anomaly detection
 */

import { subDays, subWeeks, differenceInWeeks, format, startOfWeek, endOfWeek } from 'date-fns';
import { PrimaryMuscleGroup, MUSCLE_GROUP_DISPLAY_NAMES } from '../../types';
import {
  calculateAllMuscleStrengthLevels,
  STRENGTH_LEVEL_LABELS,
  STRENGTH_LEVELS,
  StrengthLevel,
} from '../strengthStandards';
import { Insight, InsightsInput } from './types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function displayName(mg: string): string {
  return (MUSCLE_GROUP_DISPLAY_NAMES as Record<string, string>)[mg] || mg;
}

function levelIndex(level: StrengthLevel): number {
  return STRENGTH_LEVELS.indexOf(level);
}

function getWeightHistory(
  measurements: InsightsInput['bodyMeasurements']
): { date: string; value: number }[] {
  return measurements
    .filter(m => m.weight != null)
    .map(m => ({ date: m.date, value: m.weight! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function linearRegression(data: { x: number; y: number }[]): { slope: number; r2: number } {
  const n = data.length;
  if (n < 3) return { slope: 0, r2: 0 };

  const sumX = data.reduce((s, d) => s + d.x, 0);
  const sumY = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumX2 = data.reduce((s, d) => s + d.x * d.x, 0);
  const sumY2 = data.reduce((s, d) => s + d.y * d.y, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R²
  const ssRes = data.reduce((s, d) => s + Math.pow(d.y - (slope * d.x + intercept), 2), 0);
  const ssTot = data.reduce((s, d) => s + Math.pow(d.y - sumY / n, 2), 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, r2 };
}

// ─── 4. Phase Recommendations ──────────────────────────────────────────────

export function analyzePhaseRecommendation(input: InsightsInput): Insight[] {
  const { userSettings, bodyMeasurements, exercises, sets, workouts, bodyWeightLbs } = input;
  const insights: Insight[] = [];
  const mode = userSettings.nutritionMode;

  const weightHistory = getWeightHistory(bodyMeasurements);
  if (weightHistory.length < 4) return insights;

  const weeksOfData = differenceInWeeks(
    new Date(weightHistory[weightHistory.length - 1].date),
    new Date(weightHistory[0].date)
  );

  // Calculate weight change rate
  const recentWeight = weightHistory.slice(-4);
  const olderWeight = weightHistory.slice(0, Math.min(4, weightHistory.length - 4));
  if (olderWeight.length === 0) return insights;

  const avgRecent = recentWeight.reduce((s, w) => s + w.value, 0) / recentWeight.length;
  const avgOlder = olderWeight.reduce((s, w) => s + w.value, 0) / olderWeight.length;
  const totalChange = avgRecent - avgOlder;
  const weeklyChange = weeksOfData > 0 ? totalChange / weeksOfData : 0;

  // Check strength trends
  let strengthStalling = false;
  if (bodyWeightLbs && bodyWeightLbs > 0) {
    const currentLevels = calculateAllMuscleStrengthLevels(exercises, sets, workouts, bodyWeightLbs);
    const fourWeeksAgo = subWeeks(new Date(), 4);
    const olderLevels = calculateAllMuscleStrengthLevels(exercises, sets, workouts, bodyWeightLbs, {
      beforeDate: fourWeeksAgo,
    });

    let levelUps = 0;
    let levelDowns = 0;
    for (const [mg, current] of currentLevels) {
      const older = olderLevels.get(mg);
      if (!older) continue;
      const diff = levelIndex(current.level) - levelIndex(older.level);
      if (diff > 0) levelUps++;
      if (diff < 0) levelDowns++;
    }

    strengthStalling = levelUps === 0 && currentLevels.size > 0;
  }

  if (mode === 'cut') {
    if (weeksOfData >= 12 && weeklyChange >= -0.3) {
      // Been cutting a long time and weight loss has stalled
      insights.push({
        id: 'phase:cut_stall',
        category: 'phase_recommendation',
        priority: 'high',
        priorityScore: 75,
        icon: 'swap-horizontal-outline',
        title: 'Consider a diet break',
        detail: `You've been in a cut for ${weeksOfData}+ weeks with minimal recent weight loss. A 1-2 week maintenance phase can reset metabolism and improve adherence.`,
        generatedAt: '',
        minDataWeeks: 12,
      });
    } else if (strengthStalling && totalChange < -5) {
      insights.push({
        id: 'phase:cut_strength_loss',
        category: 'phase_recommendation',
        priority: 'medium',
        priorityScore: 60,
        icon: 'trending-down-outline',
        title: 'Strength stalling during cut',
        detail: `No strength improvements recently while losing weight. This is normal during a cut, but if strength drops continue, consider slowing your deficit or transitioning to maintenance.`,
        generatedAt: '',
        minDataWeeks: 8,
      });
    }
  } else if (mode === 'bulk') {
    if (weeklyChange > 1.5) {
      insights.push({
        id: 'phase:bulk_too_fast',
        category: 'phase_recommendation',
        priority: 'high',
        priorityScore: 70,
        icon: 'speedometer-outline',
        title: 'Gaining weight too quickly',
        detail: `Gaining ~${weeklyChange.toFixed(1)} lbs/week. For lean muscle gain, aim for 0.5–1 lb/week. Excess weight gain at this rate is likely fat.`,
        generatedAt: '',
        minDataWeeks: 6,
      });
    } else if (weeksOfData >= 16 && totalChange > 15) {
      insights.push({
        id: 'phase:consider_cut',
        category: 'phase_recommendation',
        priority: 'medium',
        priorityScore: 55,
        icon: 'cut-outline',
        title: 'Consider transitioning to a cut',
        detail: `You've gained ${Math.round(totalChange)} lbs over ${weeksOfData} weeks. A mini-cut can help reset insulin sensitivity and reveal your muscle gains.`,
        generatedAt: '',
        minDataWeeks: 16,
      });
    }
  } else if (mode === 'recomp') {
    if (weeksOfData >= 12 && !strengthStalling && Math.abs(totalChange) < 3) {
      insights.push({
        id: 'phase:recomp_working',
        category: 'phase_recommendation',
        priority: 'medium',
        priorityScore: 50,
        icon: 'checkmark-circle-outline',
        title: 'Recomp is on track',
        detail: `Weight is stable and strength is improving — exactly what a recomp should look like. Keep going or consider a dedicated bulk to accelerate gains.`,
        generatedAt: '',
        minDataWeeks: 12,
      });
    }
  }

  return insights;
}

// ─── 5. Trend Predictions ──────────────────────────────────────────────────

export function analyzeTrendPredictions(input: InsightsInput): Insight[] {
  const { exercises, sets, workouts, bodyWeightLbs, bodyMeasurements } = input;
  const insights: Insight[] = [];

  if (!bodyWeightLbs || bodyWeightLbs <= 0) return insights;

  // Strength prediction — look at percentToNext for the most advanced exercise
  const currentLevels = calculateAllMuscleStrengthLevels(exercises, sets, workouts, bodyWeightLbs);

  // Find muscles closest to leveling up
  for (const [mg, result] of currentLevels) {
    if (!result.bestExercise) continue;
    if (result.level === 'elite') continue;

    const pct = result.bestExercise.percentToNext;
    if (pct >= 70 && pct < 95) {
      const nextLevel = STRENGTH_LEVELS[levelIndex(result.level) + 1];
      if (!nextLevel) continue;

      // Estimate weeks to reach based on progress rate
      const remaining = 100 - pct;
      const estimatedWeeks = Math.ceil(remaining / 5); // ~5% per week is reasonable

      insights.push({
        id: `trend:strength_${mg}`,
        category: 'trend_prediction',
        priority: 'medium',
        priorityScore: 55 + Math.round(pct / 5),
        icon: 'rocket-outline',
        title: `${displayName(mg)}: ${STRENGTH_LEVEL_LABELS[nextLevel as StrengthLevel]} is close`,
        detail: `${result.bestExercise.exerciseName} is ${pct.toFixed(0)}% of the way to ${STRENGTH_LEVEL_LABELS[nextLevel as StrengthLevel]}. At your current pace, you could reach it in ~${estimatedWeeks} weeks.`,
        generatedAt: '',
        minDataWeeks: 4,
      });
    }
  }

  // Weight trend prediction
  const weightHistory = getWeightHistory(bodyMeasurements);
  if (weightHistory.length >= 6) {
    const baseDate = new Date(weightHistory[0].date).getTime();
    const regressionData = weightHistory.map(w => ({
      x: (new Date(w.date).getTime() - baseDate) / (7 * 24 * 60 * 60 * 1000), // weeks
      y: w.value,
    }));

    const { slope, r2 } = linearRegression(regressionData);

    // Only predict if trend is clear (r² > 0.5) and meaningful
    if (r2 > 0.5 && Math.abs(slope) > 0.3) {
      const direction = slope > 0 ? 'gain' : 'lose';
      const monthlyChange = Math.abs(slope * 4.33);

      insights.push({
        id: 'trend:weight_projection',
        category: 'trend_prediction',
        priority: 'low',
        priorityScore: 45,
        icon: slope > 0 ? 'trending-up-outline' : 'trending-down-outline',
        title: `Weight trend: ~${monthlyChange.toFixed(1)} lbs/month ${direction}`,
        detail: `Based on your ${weightHistory.length} weight entries, you're on track to ${direction} about ${monthlyChange.toFixed(1)} lbs per month if the current trend continues.`,
        generatedAt: '',
        minDataWeeks: 4,
      });
    }
  }

  // Limit to 3 trend predictions max
  insights.sort((a, b) => b.priorityScore - a.priorityScore);
  return insights.slice(0, 3);
}

// ─── 6. Smart Alerts ───────────────────────────────────────────────────────

export function analyzeSmartAlerts(input: InsightsInput): Insight[] {
  const { bodyMeasurements, nutritionHistory, sleepHistory, userSettings } = input;
  const insights: Insight[] = [];

  // Alert 1: Sudden weight change (> 3 lbs in a week)
  const recentWeights = bodyMeasurements
    .filter(m => m.weight != null && m.date >= format(subDays(new Date(), 10), 'yyyy-MM-dd'))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (recentWeights.length >= 2) {
    const latest = recentWeights[0].weight!;
    const weekAgo = recentWeights.find(
      m => m.date <= format(subDays(new Date(), 5), 'yyyy-MM-dd')
    );

    if (weekAgo) {
      const weekChange = Math.abs(latest - weekAgo.weight!);
      if (weekChange > 3) {
        const direction = latest > weekAgo.weight! ? 'gained' : 'lost';
        insights.push({
          id: 'alert:rapid_weight_change',
          category: 'smart_alert',
          priority: 'high',
          priorityScore: 80,
          icon: 'alert-circle-outline',
          title: `Rapid weight change: ${direction} ${weekChange.toFixed(1)} lbs`,
          detail: `${weekChange.toFixed(1)} lbs ${direction} in about a week. Sudden changes are often water weight from sodium, carbs, or stress. Monitor over the next few days.`,
          generatedAt: '',
          minDataWeeks: 2,
        });
      }
    }
  }

  // Alert 2: Sleep dropping below average for 3+ days
  const sleepEntries = Array.from(sleepHistory.entries())
    .sort((a, b) => b[0].localeCompare(a[0]));

  if (sleepEntries.length >= 7) {
    const recentSleep = sleepEntries.slice(0, 3).map(([, hours]) => hours);
    const allSleep = sleepEntries.map(([, hours]) => hours);
    const avgSleep = allSleep.reduce((s, h) => s + h, 0) / allSleep.length;
    const recentAvg = recentSleep.reduce((s, h) => s + h, 0) / recentSleep.length;

    if (recentAvg < avgSleep - 1 && recentAvg < userSettings.dailyGoals.sleepHours) {
      insights.push({
        id: 'alert:sleep_declining',
        category: 'smart_alert',
        priority: 'high',
        priorityScore: 75,
        icon: 'moon-outline',
        title: 'Sleep has dropped recently',
        detail: `Averaging ${recentAvg.toFixed(1)} hours over the last 3 days vs your typical ${avgSleep.toFixed(1)} hours. Poor sleep impairs recovery and strength gains.`,
        generatedAt: '',
        minDataWeeks: 2,
      });
    }
  }

  // Alert 3: Protein compliance falling while in bulk
  if (userSettings.nutritionMode === 'bulk') {
    const recentDates = Array.from({ length: 5 }, (_, i) =>
      format(subDays(new Date(), i + 1), 'yyyy-MM-dd')
    );

    let proteinMissed = 0;
    let daysWithData = 0;
    for (const date of recentDates) {
      const nutrition = nutritionHistory.get(date);
      if (!nutrition) continue;
      daysWithData++;
      if (nutrition.protein < userSettings.dailyGoals.proteinGrams * 0.8) {
        proteinMissed++;
      }
    }

    if (daysWithData >= 3 && proteinMissed >= 3) {
      insights.push({
        id: 'alert:bulk_low_protein',
        category: 'smart_alert',
        priority: 'high',
        priorityScore: 72,
        icon: 'restaurant-outline',
        title: 'Low protein during bulk',
        detail: `Missed your protein target ${proteinMissed} of the last ${daysWithData} days while bulking. Without adequate protein, excess calories are more likely stored as fat.`,
        generatedAt: '',
        minDataWeeks: 2,
      });
    }
  }

  // Alert 4: No training in 5+ days (when not on deload)
  if (!userSettings.isOnDeload) {
    const completedWorkouts = input.workouts
      .filter(w => w.completedAt)
      .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));

    if (completedWorkouts.length > 0) {
      const lastWorkoutDate = new Date(completedWorkouts[0].completedAt!);
      const daysSince = Math.floor(
        (new Date().getTime() - lastWorkoutDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince >= 5) {
        insights.push({
          id: 'alert:training_gap',
          category: 'smart_alert',
          priority: 'medium',
          priorityScore: 65,
          icon: 'fitness-outline',
          title: `No training in ${daysSince} days`,
          detail: `It's been ${daysSince} days since your last workout. Taking too many rest days can stall progress — get back in there!`,
          generatedAt: '',
          minDataWeeks: 2,
        });
      }
    }
  }

  return insights;
}
