import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProgressRing } from './ProgressRing';
import { CalorieRing } from './CalorieRing';
import { Card } from '../common';
import { colors, typography, spacing } from '../../theme';
import { DailyGoalStatus } from '../../services/streaks';
import { DailyGoals } from '../../types';

interface TodayRingsProps {
  status: DailyGoalStatus;
  dailyGoals: DailyGoals;
  calorieTolerancePercent?: number;
}

export function TodayRings({ status, dailyGoals, calorieTolerancePercent = 10 }: TodayRingsProps) {
  // Calculate progress percentages
  const sleepProgress = dailyGoals.sleepHours > 0
    ? (status.sleep.hours / dailyGoals.sleepHours) * 100
    : 0;

  const proteinProgress = dailyGoals.proteinGrams > 0
    ? (status.protein.grams / dailyGoals.proteinGrams) * 100
    : 0;

  const supplementsProgress = status.supplements.total > 0
    ? (status.supplements.taken / status.supplements.total) * 100
    : 0;

  const trainingProgress = status.training.completed ? 100 : 0;

  // Format display values
  const sleepValue = `${status.sleep.hours.toFixed(1)}/${dailyGoals.sleepHours}`;
  const proteinValue = `${Math.round(status.protein.grams)}/${dailyGoals.proteinGrams}`;
  const supplementsValue = `${status.supplements.taken}/${status.supplements.total}`;

  // Only show supplements ring if there are active supplements
  const showSupplementsRing = status.supplements.total > 0;

  // Only show calorie ring if a goal is set
  const showCalorieRing = status.calories.goal > 0;

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Today's Rings</Text>
      <View style={styles.ringsRow}>
        <ProgressRing
          progress={sleepProgress}
          label="Sleep"
          value={sleepValue}
          color={colors.chartSleep}
        />
        <ProgressRing
          progress={proteinProgress}
          label="Protein"
          value={proteinValue}
          color={colors.chartProtein}
        />
        {showCalorieRing && (
          <CalorieRing
            consumed={status.calories.consumed}
            goal={status.calories.goal}
            mode={status.calories.mode}
            tolerancePercent={calorieTolerancePercent}
          />
        )}
        {showSupplementsRing && (
          <ProgressRing
            progress={supplementsProgress}
            label="Supps"
            value={supplementsValue}
            color={colors.primary}
          />
        )}
        {dailyGoals.trackTraining && (
          <ProgressRing
            progress={trainingProgress}
            label="Training"
            isBoolean
            color={colors.chartTraining}
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.base,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
});

export default TodayRings;
