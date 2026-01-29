import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProgressRing } from './ProgressRing';
import { Card } from '../common';
import { colors, typography, spacing } from '../../theme';
import { DailyGoalStatus } from '../../services/streaks';
import { DailyGoals } from '../../types';

interface TodayRingsProps {
  status: DailyGoalStatus;
  dailyGoals: DailyGoals;
}

export function TodayRings({ status, dailyGoals }: TodayRingsProps) {
  // Calculate progress percentages
  const sleepProgress = dailyGoals.sleepHours > 0
    ? (status.sleep.hours / dailyGoals.sleepHours) * 100
    : 0;

  const proteinProgress = dailyGoals.proteinGrams > 0
    ? (status.protein.grams / dailyGoals.proteinGrams) * 100
    : 0;

  const creatineProgress = status.creatine.taken ? 100 : 0;
  const trainingProgress = status.training.completed ? 100 : 0;

  // Format display values
  const sleepValue = `${status.sleep.hours.toFixed(1)}/${dailyGoals.sleepHours}`;
  const proteinValue = `${Math.round(status.protein.grams)}/${dailyGoals.proteinGrams}`;

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
        {dailyGoals.trackCreatine && (
          <ProgressRing
            progress={creatineProgress}
            label="Creatine"
            isBoolean
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
