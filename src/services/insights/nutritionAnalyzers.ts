/**
 * Nutrition Impact Analyzer
 *
 * Analyzes protein/calorie compliance vs training performance.
 * Compares high-compliance weeks against low-compliance weeks
 * to find correlations with PRs and volume.
 */

import { startOfWeek, endOfWeek, subWeeks, format, addDays } from 'date-fns';
import { Insight, InsightsInput } from './types';

// ─── Helpers ───────────────────────────────────────────────────────────────

interface WeekSummary {
  weekStart: string;
  proteinDaysMet: number;  // out of 7
  calorieDaysMet: number;
  totalSets: number;
  totalVolume: number;     // weight * reps
  prsCount: number;
}

function buildWeekSummaries(input: InsightsInput, numWeeks: number): WeekSummary[] {
  const { workouts, sets, userSettings, nutritionHistory } = input;
  const summaries: WeekSummary[] = [];
  const weekStartsOn = userSettings.weekStartDay === 'monday' ? 1 : 0;

  const completedWorkouts = new Map<string, string>();
  for (const w of workouts) {
    if (w.completedAt) {
      completedWorkouts.set(w.id, format(new Date(w.completedAt), 'yyyy-MM-dd'));
    }
  }

  for (let i = 0; i < numWeeks; i++) {
    const weekStart = startOfWeek(subWeeks(new Date(), i), { weekStartsOn });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn });
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

    // Count nutrition compliance
    let proteinDaysMet = 0;
    let calorieDaysMet = 0;
    for (let d = 0; d < 7; d++) {
      const dateStr = format(addDays(weekStart, d), 'yyyy-MM-dd');
      const nutrition = nutritionHistory.get(dateStr);
      if (!nutrition) continue;

      if (nutrition.protein >= userSettings.dailyGoals.proteinGrams) {
        proteinDaysMet++;
      }
      if (userSettings.calorieGoal && nutrition.calories >= userSettings.calorieGoal * 0.9) {
        calorieDaysMet++;
      }
    }

    // Count sets and volume for this week
    let totalSets = 0;
    let totalVolume = 0;
    const weekWorkoutIds = new Set<string>();
    for (const [wId, dateStr] of completedWorkouts) {
      if (dateStr >= weekStartStr && dateStr <= weekEndStr) {
        weekWorkoutIds.add(wId);
      }
    }

    for (const set of sets) {
      if (!weekWorkoutIds.has(set.workoutId)) continue;
      totalSets++;
      totalVolume += (set.weight || 0) * (set.reps || 0);
    }

    summaries.push({
      weekStart: weekStartStr,
      proteinDaysMet,
      calorieDaysMet,
      totalSets,
      totalVolume,
      prsCount: 0, // PR counting is expensive; we compare volume instead
    });
  }

  return summaries;
}

// ─── Nutrition Impact Analyzer ─────────────────────────────────────────────

export function analyzeNutritionImpact(input: InsightsInput): Insight[] {
  const insights: Insight[] = [];
  const summaries = buildWeekSummaries(input, 8);

  // Need at least 4 weeks with nutrition data
  const weeksWithNutrition = summaries.filter(s => s.proteinDaysMet > 0 || s.calorieDaysMet > 0);
  if (weeksWithNutrition.length < 4) return insights;

  // Separate high vs low protein compliance weeks
  const highProtein = summaries.filter(s => s.proteinDaysMet >= 5); // 5+ out of 7 days
  const lowProtein = summaries.filter(s => s.proteinDaysMet > 0 && s.proteinDaysMet <= 3);

  if (highProtein.length >= 2 && lowProtein.length >= 2) {
    const avgVolumeHigh = highProtein.reduce((sum, w) => sum + w.totalVolume, 0) / highProtein.length;
    const avgVolumeLow = lowProtein.reduce((sum, w) => sum + w.totalVolume, 0) / lowProtein.length;

    if (avgVolumeLow > 0) {
      const volumeDiff = ((avgVolumeHigh - avgVolumeLow) / avgVolumeLow) * 100;

      if (volumeDiff > 10) {
        insights.push({
          id: 'nutrition:protein_volume_correlation',
          category: 'nutrition_impact',
          priority: 'high',
          priorityScore: 70,
          icon: 'nutrition-outline',
          title: 'Protein fuels your training volume',
          detail: `Weeks with consistent protein (5+ days) had ${Math.round(volumeDiff)}% more training volume than weeks with poor compliance. Keep hitting your protein goals.`,
          generatedAt: '',
          minDataWeeks: 4,
        });
      }
    }
  }

  // Check current week protein compliance
  const currentWeek = summaries[0];
  const today = new Date().getDay();
  const dayOfWeek = input.userSettings.weekStartDay === 'monday'
    ? (today === 0 ? 6 : today - 1)
    : today;

  if (dayOfWeek >= 4 && currentWeek) {
    // It's Thursday or later — we have enough data to assess this week
    const compliance = currentWeek.proteinDaysMet / (dayOfWeek + 1);

    if (compliance < 0.5) {
      insights.push({
        id: 'nutrition:low_protein_this_week',
        category: 'nutrition_impact',
        priority: 'high',
        priorityScore: 65,
        icon: 'warning-outline',
        title: 'Protein compliance low this week',
        detail: `Only hit your protein goal ${currentWeek.proteinDaysMet} out of ${dayOfWeek + 1} days so far. Low protein during training weeks can impair recovery and muscle growth.`,
        generatedAt: '',
        minDataWeeks: 2,
      });
    }
  }

  // Calorie surplus correlation with training volume (for bulking)
  if (input.userSettings.nutritionMode === 'bulk' && input.userSettings.calorieGoal) {
    const highCalorie = summaries.filter(s => s.calorieDaysMet >= 5);
    const lowCalorie = summaries.filter(s => s.calorieDaysMet > 0 && s.calorieDaysMet <= 3);

    if (highCalorie.length >= 2 && lowCalorie.length >= 1) {
      const avgSetsHigh = highCalorie.reduce((sum, w) => sum + w.totalSets, 0) / highCalorie.length;
      const avgSetsLow = lowCalorie.reduce((sum, w) => sum + w.totalSets, 0) / lowCalorie.length;

      if (avgSetsHigh > avgSetsLow * 1.15) {
        insights.push({
          id: 'nutrition:calorie_training_correlation',
          category: 'nutrition_impact',
          priority: 'medium',
          priorityScore: 55,
          icon: 'flame-outline',
          title: 'Calorie surplus supports training output',
          detail: `You complete more sets in weeks when you consistently hit your calorie goal. Keep fueling your bulk adequately.`,
          generatedAt: '',
          minDataWeeks: 4,
        });
      }
    }
  }

  return insights;
}
