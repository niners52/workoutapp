import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, typography, spacing } from '../theme';
import {
  CalorieRingStatus,
  CALORIE_RING_COLORS,
  getTargetRange,
  getModeDescription,
} from '../services/calorieGoal';
import { NutritionMode } from '../types';

interface CalorieRingProps {
  status: CalorieRingStatus;
  size?: number;
  strokeWidth?: number;
  animated?: boolean;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function CalorieRing({
  status,
  size = 150,
  strokeWidth = 12,
  animated = true,
}: CalorieRingProps) {
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  useEffect(() => {
    if (animated) {
      animatedProgress.setValue(0);
      Animated.timing(animatedProgress, {
        toValue: status.progress,
        duration: 800,
        useNativeDriver: true,
      }).start();
    } else {
      animatedProgress.setValue(status.progress);
    }
  }, [status.progress, animated]);

  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={styles.container}>
      <View style={[styles.ringContainer, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          {/* Background track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={CALORIE_RING_COLORS.track}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress ring */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={status.ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>

        {/* Center content */}
        <View style={[styles.centerContent, { width: size, height: size }]}>
          <Text style={styles.calorieValue}>
            {status.currentCalories.toLocaleString()}
          </Text>
          <Text style={styles.calorieLabel}>
            {getModeDescription(status.mode)}: {status.goal.toLocaleString()}
          </Text>
          {status.isGoalMet && (
            <Text style={[styles.checkmark, { color: status.ringColor }]}>
              {status.mode === 'cut' && status.currentCalories > status.goal ? '' : '✓'}
            </Text>
          )}
        </View>
      </View>

      {/* Status text below ring */}
      <Text style={[styles.statusDetail, { color: status.ringColor }]}>
        {status.statusDetail}
      </Text>

      {/* Target range for recomp mode */}
      {status.mode === 'recomp' && (
        <Text style={styles.targetRange}>
          Target: {getTargetRange(status.goal, status.tolerancePercent).lower.toLocaleString()} -{' '}
          {getTargetRange(status.goal, status.tolerancePercent).upper.toLocaleString()} kcal
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  ringContainer: {
    position: 'relative',
  },
  centerContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calorieValue: {
    fontSize: 28,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  calorieLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 18,
    fontWeight: typography.weight.bold,
    marginTop: 4,
  },
  statusDetail: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  targetRange: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
});

export default CalorieRing;
