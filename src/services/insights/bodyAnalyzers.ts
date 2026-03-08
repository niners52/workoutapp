/**
 * Body Analyzers
 *
 * 1. Body Composition Status — weight vs body fat trends
 * 2. Strength-to-Size Correlations — strength level changes vs circumference growth
 */

import { subDays, format, differenceInDays } from 'date-fns';
import { PrimaryMuscleGroup, BodyMeasurementTypeKey, MUSCLE_GROUP_DISPLAY_NAMES } from '../../types';
import {
  calculateAllMuscleStrengthLevels,
  getStartSnapshotCutoff,
  STRENGTH_LEVEL_LABELS,
  STRENGTH_LEVELS,
  StrengthLevel,
} from '../strengthStandards';
import { Insight, InsightsInput, getDeloadWorkoutIds, getNonDeloadSets, getNonDeloadWorkouts } from './types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function getWeightTrend(
  measurements: InsightsInput['bodyMeasurements'],
  days: number = 28
): { avgRecent: number; avgOlder: number; change: number } | null {
  const cutoff = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const midpoint = format(subDays(new Date(), days * 2), 'yyyy-MM-dd');

  const recent = measurements
    .filter(m => m.weight && m.date >= cutoff)
    .map(m => m.weight!);
  const older = measurements
    .filter(m => m.weight && m.date >= midpoint && m.date < cutoff)
    .map(m => m.weight!);

  if (recent.length < 2 || older.length < 2) return null;

  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;

  return { avgRecent, avgOlder, change: avgRecent - avgOlder };
}

function getBodyFatTrend(
  measurements: InsightsInput['bodyMeasurements'],
  days: number = 28
): { avgRecent: number; avgOlder: number; change: number } | null {
  const cutoff = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const midpoint = format(subDays(new Date(), days * 2), 'yyyy-MM-dd');

  const recent = measurements
    .filter(m => m.bodyFatPercentage && m.date >= cutoff)
    .map(m => m.bodyFatPercentage!);
  const older = measurements
    .filter(m => m.bodyFatPercentage && m.date >= midpoint && m.date < cutoff)
    .map(m => m.bodyFatPercentage!);

  if (recent.length < 1 || older.length < 1) return null;

  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;

  return { avgRecent, avgOlder, change: avgRecent - avgOlder };
}

function displayName(mg: string): string {
  return (MUSCLE_GROUP_DISPLAY_NAMES as Record<string, string>)[mg] || mg;
}

function levelIndex(level: StrengthLevel): number {
  return STRENGTH_LEVELS.indexOf(level);
}

// ─── 1. Body Composition Status ────────────────────────────────────────────

export function analyzeBodyComposition(input: InsightsInput): Insight[] {
  const insights: Insight[] = [];
  const weightTrend = getWeightTrend(input.bodyMeasurements);

  if (!weightTrend) return insights;

  const bfTrend = getBodyFatTrend(input.bodyMeasurements);
  const changePerWeek = weightTrend.change / 4; // over 4 weeks
  const absChange = Math.abs(weightTrend.change);

  // Threshold: at least 1 lb change over 4 weeks to be meaningful
  if (absChange < 1) {
    // Weight stable
    if (bfTrend && bfTrend.change > 0.5) {
      insights.push({
        id: 'body_comp:stable_weight_rising_bf',
        category: 'body_composition',
        priority: 'medium',
        priorityScore: 60,
        icon: 'alert-circle-outline',
        title: 'Weight stable but body fat rising',
        detail: `Weight steady around ${Math.round(weightTrend.avgRecent)} lbs but body fat increased ${bfTrend.change.toFixed(1)}%. Consider adjusting nutrition or increasing training intensity.`,
        generatedAt: '',
        minDataWeeks: 8,
      });
    } else if (bfTrend && bfTrend.change < -0.5) {
      insights.push({
        id: 'body_comp:recomp_progress',
        category: 'body_composition',
        priority: 'medium',
        priorityScore: 65,
        icon: 'checkmark-circle-outline',
        title: 'Successful recomposition',
        detail: `Weight stable while body fat dropped ${Math.abs(bfTrend.change).toFixed(1)}% — you're gaining muscle and losing fat simultaneously.`,
        generatedAt: '',
        minDataWeeks: 8,
      });
    }
    return insights;
  }

  const gaining = weightTrend.change > 0;

  if (gaining) {
    if (bfTrend) {
      if (bfTrend.change < 0.3) {
        // Gaining weight, body fat stable/decreasing = lean bulk
        insights.push({
          id: 'body_comp:lean_gain',
          category: 'body_composition',
          priority: 'high',
          priorityScore: 75,
          icon: 'trending-up-outline',
          title: 'Clean muscle gain detected',
          detail: `Gained ${absChange.toFixed(1)} lbs over 4 weeks while body fat stayed stable — likely quality muscle growth.`,
          generatedAt: '',
          minDataWeeks: 8,
        });
      } else if (bfTrend.change > 1) {
        // Gaining weight + body fat rising = potentially too aggressive
        insights.push({
          id: 'body_comp:aggressive_bulk',
          category: 'body_composition',
          priority: 'medium',
          priorityScore: 60,
          icon: 'warning-outline',
          title: 'Bulk may be too aggressive',
          detail: `Gained ${absChange.toFixed(1)} lbs with body fat up ${bfTrend.change.toFixed(1)}%. Consider a smaller calorie surplus (${changePerWeek > 1 ? 'aim for 0.5–1 lb/week' : 'current rate is reasonable'}).`,
          generatedAt: '',
          minDataWeeks: 8,
        });
      }
    } else {
      // No BF data — just report weight gain
      if (absChange > 2) {
        insights.push({
          id: 'body_comp:weight_gain',
          category: 'body_composition',
          priority: 'low',
          priorityScore: 40,
          icon: 'trending-up-outline',
          title: `Weight trending up`,
          detail: `Up ${absChange.toFixed(1)} lbs over the past 4 weeks (${changePerWeek.toFixed(1)} lbs/week). Track body fat to distinguish muscle vs fat gain.`,
          generatedAt: '',
          minDataWeeks: 6,
        });
      }
    }
  } else {
    // Losing weight
    if (bfTrend && bfTrend.change < -0.3) {
      insights.push({
        id: 'body_comp:effective_cut',
        category: 'body_composition',
        priority: 'high',
        priorityScore: 70,
        icon: 'flame-outline',
        title: 'Cut is working',
        detail: `Lost ${absChange.toFixed(1)} lbs with body fat down ${Math.abs(bfTrend.change).toFixed(1)}% — fat loss is on track.`,
        generatedAt: '',
        minDataWeeks: 8,
      });
    } else if (absChange > 3) {
      insights.push({
        id: 'body_comp:rapid_loss',
        category: 'body_composition',
        priority: 'high',
        priorityScore: 70,
        icon: 'warning-outline',
        title: 'Rapid weight loss',
        detail: `Lost ${absChange.toFixed(1)} lbs in 4 weeks (${Math.abs(changePerWeek).toFixed(1)} lbs/week). Losing faster than 1% body weight/week risks muscle loss.`,
        generatedAt: '',
        minDataWeeks: 6,
      });
    }
  }

  return insights;
}

// ─── 2. Strength-to-Size Correlations ──────────────────────────────────────

// Map circumference measurements to muscle groups
const MEASUREMENT_TO_MUSCLE: Partial<Record<BodyMeasurementTypeKey, {
  muscles: PrimaryMuscleGroup[];
  label: string;
}>> = {
  chest: { muscles: ['chest', 'front_delts'], label: 'Chest' },
  left_arm: { muscles: ['biceps', 'triceps'], label: 'Arms' },
  right_arm: { muscles: ['biceps', 'triceps'], label: 'Arms' },
  left_thigh: { muscles: ['quads', 'hamstrings'], label: 'Thighs' },
  right_thigh: { muscles: ['quads', 'hamstrings'], label: 'Thighs' },
  shoulders: { muscles: ['front_delts', 'side_delts', 'rear_delts'], label: 'Shoulders' },
};

function getCircumferenceChange(
  measurements: InsightsInput['bodyMeasurements'],
  type: BodyMeasurementTypeKey
): { earliest: number; latest: number; change: number; days: number } | null {
  const typed = measurements
    .filter(m => m.type === type && m.value != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (typed.length < 2) return null;

  const earliest = typed[0];
  const latest = typed[typed.length - 1];
  const days = differenceInDays(new Date(latest.date), new Date(earliest.date));
  if (days < 14) return null;

  return {
    earliest: earliest.value!,
    latest: latest.value!,
    change: latest.value! - earliest.value!,
    days,
  };
}

export function analyzeStrengthToSize(input: InsightsInput): Insight[] {
  const { exercises, sets, workouts, bodyMeasurements, bodyWeightLbs } = input;
  const insights: Insight[] = [];

  if (!bodyWeightLbs || bodyWeightLbs <= 0) return insights;

  // Exclude deload data — deload weights would artificially lower strength levels
  const deloadIds = getDeloadWorkoutIds(workouts);
  const nonDeloadSets = getNonDeloadSets(sets, deloadIds);
  const nonDeloadWorkouts = getNonDeloadWorkouts(workouts);

  // Current and start strength levels (non-deload only)
  const currentLevels = calculateAllMuscleStrengthLevels(exercises, nonDeloadSets, nonDeloadWorkouts, bodyWeightLbs);
  const startCutoff = getStartSnapshotCutoff(nonDeloadWorkouts);
  const startLevels = startCutoff
    ? calculateAllMuscleStrengthLevels(exercises, nonDeloadSets, nonDeloadWorkouts, bodyWeightLbs, { beforeDate: startCutoff })
    : null;

  // Check each measurement type for correlations
  const seen = new Set<string>();

  for (const [measurementType, mapping] of Object.entries(MEASUREMENT_TO_MUSCLE)) {
    const sizeChange = getCircumferenceChange(
      bodyMeasurements,
      measurementType as BodyMeasurementTypeKey
    );
    if (!sizeChange || Math.abs(sizeChange.change) < 0.1) continue;

    // Find strength level changes for related muscles
    for (const muscle of mapping.muscles) {
      const current = currentLevels.get(muscle);
      const start = startLevels?.get(muscle);

      if (!current || !start) continue;
      if (seen.has(mapping.label)) continue;

      const currentIdx = levelIndex(current.level);
      const startIdx = levelIndex(start.level);
      const levelChange = currentIdx - startIdx;

      if (levelChange > 0 && sizeChange.change > 0) {
        seen.add(mapping.label);
        insights.push({
          id: `strength_size:${mapping.label.toLowerCase()}`,
          category: 'strength_size',
          priority: 'high',
          priorityScore: 75,
          icon: 'resize-outline',
          title: `${mapping.label}: stronger and bigger`,
          detail: `${mapping.label} strength went from ${STRENGTH_LEVEL_LABELS[start.level]} to ${STRENGTH_LEVEL_LABELS[current.level]} while measurements grew ${sizeChange.change.toFixed(1)} inches.`,
          generatedAt: '',
          minDataWeeks: 6,
        });
      } else if (levelChange > 0 && sizeChange.change <= 0) {
        seen.add(mapping.label);
        insights.push({
          id: `strength_size:${mapping.label.toLowerCase()}_strength_only`,
          category: 'strength_size',
          priority: 'medium',
          priorityScore: 55,
          icon: 'barbell-outline',
          title: `${mapping.label}: strength up, size flat`,
          detail: `${mapping.label} strength improved (${STRENGTH_LEVEL_LABELS[start.level]} → ${STRENGTH_LEVEL_LABELS[current.level]}) but measurements haven't grown. This often means neural adaptation — hypertrophy may follow.`,
          generatedAt: '',
          minDataWeeks: 8,
        });
      } else if (levelChange === 0 && sizeChange.change > 0.3) {
        seen.add(mapping.label);
        insights.push({
          id: `strength_size:${mapping.label.toLowerCase()}_size_only`,
          category: 'strength_size',
          priority: 'low',
          priorityScore: 45,
          icon: 'body-outline',
          title: `${mapping.label}: growing without strength gains`,
          detail: `${mapping.label} measurements up ${sizeChange.change.toFixed(1)} inches but strength level unchanged. Could be swelling, fat gain, or pump effect — ensure progressive overload.`,
          generatedAt: '',
          minDataWeeks: 8,
        });
      }
    }
  }

  return insights;
}
