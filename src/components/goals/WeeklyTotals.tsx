import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card, ProgressBar } from '../common';
import { colors, typography, spacing } from '../../theme';
import { WeeklySummary } from '../../services/streaks';
import { WeeklyGoals, DailyGoals, UserSettings } from '../../types';

interface WeeklyTotalsProps {
  summary: WeeklySummary;
  weeklyGoals: WeeklyGoals;
  dailyGoals: DailyGoals;
  userSettings?: UserSettings;
  // False when the user has zero ACTIVE supplements — hides Creatine Days
  // regardless of trackCreatine (which defaults true).
  hasActiveSupplements?: boolean;
}

interface TotalRowProps {
  label: string;
  current: number;
  target: number;
  unit?: string;
  color?: string;
}

function TotalRow({ label, current, target, unit = '', color = colors.primary }: TotalRowProps) {
  const progress = target > 0 ? (current / target) * 100 : 0;
  const displayCurrent = Number.isInteger(current) ? current : current.toFixed(1);

  return (
    <View style={styles.totalRow}>
      <View style={styles.totalHeader}>
        <Text style={styles.totalLabel}>{label}</Text>
        <Text style={styles.totalValue}>
          {displayCurrent}/{target}{unit}
        </Text>
      </View>
      <ProgressBar
        progress={progress}
        color={color}
        height={6}
      />
    </View>
  );
}

export function WeeklyTotals({ summary, weeklyGoals, dailyGoals, userSettings, hasActiveSupplements = true }: WeeklyTotalsProps) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Weekly Totals</Text>

      <TotalRow
        label="Sleep"
        current={summary.sleepHours}
        target={weeklyGoals.sleepHours}
        unit=" hrs"
        color={colors.chartSleep}
      />

      <TotalRow
        label="Protein Days"
        current={summary.proteinDays}
        target={weeklyGoals.proteinDays}
        color={colors.chartProtein}
      />

      {dailyGoals.trackCreatine && hasActiveSupplements && (
        <TotalRow
          label="Creatine Days"
          current={summary.creatineDays}
          target={weeklyGoals.creatineDays}
          color={colors.primary}
        />
      )}

      {dailyGoals.trackTraining && (
        <TotalRow
          label="Training Days"
          current={summary.trainingDays}
          target={weeklyGoals.trainingDays}
          color={colors.chartTraining}
        />
      )}

      {userSettings?.dailyGoals?.trackPT && (
        <TotalRow
          label="PT Days"
          current={summary.ptDays}
          target={weeklyGoals.ptDays ?? 7}
          color={colors.success}
        />
      )}

      {userSettings?.trackYoga && (
        <TotalRow
          label="Yoga"
          current={summary.yogaMinutes}
          target={weeklyGoals.yogaMinutes ?? 60}
          unit=" min"
          color={colors.chartYoga}
        />
      )}

      {userSettings?.trackCardio && (
        <TotalRow
          label="Cardio"
          current={summary.cardioMinutes}
          target={weeklyGoals.cardioMinutes ?? 60}
          unit=" min"
          color={colors.chartCardio}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  totalRow: {
    marginBottom: spacing.md,
  },
  totalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  totalLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
});

export default WeeklyTotals;
