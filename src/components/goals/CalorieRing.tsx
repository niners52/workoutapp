import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, typography, spacing } from '../../theme';
import { NutritionMode } from '../../types';
import { LetterGrade, GRADE_COLORS, gradeIsHit } from '../../services/streaks';

interface CalorieRingProps {
  consumed: number;
  goal: number;
  mode: NutritionMode;
  tolerancePercent: number;
  size?: number;
  strokeWidth?: number;
  grade?: LetterGrade;
}

const MODE_LABELS: Record<NutritionMode, string> = {
  bulk: 'Bulk',
  cut: 'Cut',
  recomp: 'Recomp',
};

// Orange color for calories (distinct from yellow protein/sleep)
const CALORIE_COLOR = '#FF9500';

export function CalorieRing({
  consumed,
  goal,
  mode,
  tolerancePercent,
  size = 70,
  strokeWidth = 6,
  grade,
}: CalorieRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  // Calculate progress and status based on mode
  let progress: number;
  let isComplete: boolean;
  let isOver: boolean;
  let ringColor: string;

  const tolerance = goal * (tolerancePercent / 100);

  switch (mode) {
    case 'bulk':
      // Fill up as you eat toward goal
      progress = goal > 0 ? (consumed / goal) * 100 : 0;
      isComplete = consumed >= goal;
      isOver = false; // Can't be "over" in bulk mode
      ringColor = isComplete ? colors.success : CALORIE_COLOR;
      break;

    case 'cut':
      // Remaining budget depletes as you eat
      // 100% = haven't eaten anything, 0% = at limit
      progress = goal > 0 ? Math.max(0, ((goal - consumed) / goal) * 100) : 0;
      isComplete = consumed <= goal && consumed > 0;
      isOver = consumed > goal;
      ringColor = isOver ? colors.error : (isComplete ? colors.success : CALORIE_COLOR);
      break;

    case 'recomp':
      // 100% when within tolerance window
      const lowerBound = goal - tolerance;
      const upperBound = goal + tolerance;
      const inWindow = consumed >= lowerBound && consumed <= upperBound;

      if (inWindow) {
        progress = 100;
        isComplete = true;
        isOver = false;
        ringColor = colors.success;
      } else if (consumed < lowerBound) {
        // Under target - show how close to lower bound
        progress = goal > 0 ? (consumed / lowerBound) * 100 : 0;
        isComplete = false;
        isOver = false;
        ringColor = CALORIE_COLOR;
      } else {
        // Over target
        progress = 100; // Show full ring but in warning color
        isComplete = false;
        isOver = true;
        ringColor = colors.warning;
      }
      break;

    default:
      progress = 0;
      isComplete = false;
      isOver = false;
      ringColor = CALORIE_COLOR;
  }

  // Override ring color when grade is provided
  if (grade) {
    ringColor = GRADE_COLORS[grade];
  }

  const showGlow = grade ? gradeIsHit(grade) : (isComplete && !isOver);
  const glowColor = grade ? GRADE_COLORS[grade] : colors.success;

  const cappedProgress = Math.min(progress, 100);
  const strokeDashoffset = circumference - (cappedProgress / 100) * circumference;

  // Format the display value
  const formatNumber = (n: number) => n.toLocaleString();
  let displayValue: string;
  let valueColor = colors.text;

  if (isOver && mode === 'cut') {
    const overAmount = consumed - goal;
    displayValue = `+${formatNumber(overAmount)}`;
    valueColor = colors.error;
  } else {
    displayValue = `${formatNumber(consumed)}/${formatNumber(goal)}`;
    if (isComplete) {
      valueColor = colors.success;
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.ringContainer, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            {/* Background track */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={colors.backgroundTertiary}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Progress arc */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={ringColor}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </G>
        </Svg>
        {/* Center content */}
        <View style={[styles.centerContent, { width: size, height: size }]}>
          <Text style={[styles.valueText, { color: valueColor }]} numberOfLines={1}>
            {displayValue}
          </Text>
          {grade && (
            <Text style={[styles.gradeText, { color: GRADE_COLORS[grade] }]}>{grade}</Text>
          )}
        </View>
        {/* Glow effect */}
        {showGlow && (
          <View
            style={[
              styles.glowEffect,
              {
                width: size + 8,
                height: size + 8,
                borderRadius: (size + 8) / 2,
                borderColor: glowColor,
              },
            ]}
          />
        )}
      </View>
      <Text style={styles.label}>Calories</Text>
      <Text style={styles.modeLabel}>{MODE_LABELS[mode]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  ringContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: typography.size.xs - 1, // Slightly smaller to fit numbers
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
  gradeText: {
    fontSize: typography.size.xs - 2,
    fontWeight: typography.weight.bold,
    marginTop: -1,
  },
  label: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  modeLabel: {
    fontSize: typography.size.xs - 2,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 1,
  },
  glowEffect: {
    position: 'absolute',
    borderWidth: 1,
    opacity: 0.3,
  },
});

export default CalorieRing;
