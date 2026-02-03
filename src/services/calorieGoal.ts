/**
 * Calorie Goal Service
 *
 * Calculates calorie ring status based on user's nutrition mode (bulk/cut/recomp)
 */

import { NutritionMode } from '../types';

export interface CalorieRingStatus {
  currentCalories: number;
  goal: number;
  mode: NutritionMode;
  tolerancePercent: number;
  progress: number;           // 0 to 1 for ring fill
  isGoalMet: boolean;         // did they "close the ring"?
  ringColor: string;          // color for the ring
  statusText: string;         // e.g. "2,340 / 2,500 kcal"
  statusDetail: string;       // e.g. "160 kcal remaining" or "Within target range"
}

// Ring colors
const COLORS = {
  green: '#4CAF50',   // Goal met
  gold: '#FFC52F',    // In progress
  red: '#F44336',     // Over limit
  track: '#2A2A3E',   // Background track
};

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function calculateCalorieRingStatus(
  currentCalories: number,
  goal: number,
  mode: NutritionMode,
  tolerancePercent: number = 10
): CalorieRingStatus {
  switch (mode) {
    case 'bulk': {
      // Ring fills from 0 to goal. Goal met when calories >= goal.
      const progress = Math.min(1, currentCalories / goal);
      const isGoalMet = currentCalories >= goal;
      const remaining = goal - currentCalories;

      return {
        currentCalories,
        goal,
        mode,
        tolerancePercent,
        progress,
        isGoalMet,
        ringColor: isGoalMet ? COLORS.green : COLORS.gold,
        statusText: `${formatNumber(currentCalories)} / ${formatNumber(goal)} kcal`,
        statusDetail: isGoalMet
          ? `Goal met! ${formatNumber(currentCalories - goal)} kcal over minimum`
          : `${formatNumber(remaining)} kcal remaining`,
      };
    }

    case 'cut': {
      // Ring fills from 0 to goal. Goal met when calories <= goal. Turns red if exceeded.
      const progress = Math.min(1, currentCalories / goal);
      const isGoalMet = currentCalories <= goal;
      const exceeded = currentCalories > goal;
      const remaining = goal - currentCalories;

      return {
        currentCalories,
        goal,
        mode,
        tolerancePercent,
        progress: exceeded ? 1 : progress,
        isGoalMet,
        ringColor: exceeded ? COLORS.red : (progress >= 0.85 ? COLORS.gold : COLORS.green),
        statusText: `${formatNumber(currentCalories)} / ${formatNumber(goal)} kcal`,
        statusDetail: exceeded
          ? `${formatNumber(currentCalories - goal)} kcal over limit!`
          : `${formatNumber(remaining)} kcal remaining`,
      };
    }

    case 'recomp':
    default: {
      // Target window: goal ± tolerance%
      const toleranceAmount = goal * (tolerancePercent / 100);
      const lowerBound = goal - toleranceAmount;
      const upperBound = goal + toleranceAmount;
      const isGoalMet = currentCalories >= lowerBound && currentCalories <= upperBound;

      let progress: number;
      let ringColor: string;
      let statusDetail: string;

      if (currentCalories < lowerBound) {
        // Below target range - ring fills toward lower bound
        progress = Math.min(1, currentCalories / lowerBound);
        ringColor = COLORS.gold;
        statusDetail = `${formatNumber(Math.round(lowerBound - currentCalories))} kcal below target range`;
      } else if (currentCalories > upperBound) {
        // Above target range
        progress = 1;
        ringColor = COLORS.red;
        statusDetail = `${formatNumber(Math.round(currentCalories - upperBound))} kcal above target range`;
      } else {
        // In the zone!
        progress = 1;
        ringColor = COLORS.green;
        const diff = currentCalories - goal;
        if (Math.abs(diff) < goal * 0.02) {
          statusDetail = 'Right on target!';
        } else {
          statusDetail = `Within target range (${formatNumber(Math.round(lowerBound))} - ${formatNumber(Math.round(upperBound))})`;
        }
      }

      return {
        currentCalories,
        goal,
        mode,
        tolerancePercent,
        progress,
        isGoalMet,
        ringColor,
        statusText: `${formatNumber(currentCalories)} / ${formatNumber(goal)} kcal`,
        statusDetail,
      };
    }
  }
}

// Get the target range for recomp mode display
export function getTargetRange(goal: number, tolerancePercent: number): { lower: number; upper: number } {
  const toleranceAmount = goal * (tolerancePercent / 100);
  return {
    lower: Math.round(goal - toleranceAmount),
    upper: Math.round(goal + toleranceAmount),
  };
}

// Get mode description for display
export function getModeDescription(mode: NutritionMode): string {
  switch (mode) {
    case 'bulk':
      return 'Minimum';
    case 'cut':
      return 'Maximum';
    case 'recomp':
    default:
      return 'Target';
  }
}

export { COLORS as CALORIE_RING_COLORS };
