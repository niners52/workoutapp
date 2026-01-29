import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { StreakCounts } from '../../services/streaks';
import { DailyGoals } from '../../types';

interface StreakCountersProps {
  streaks: StreakCounts;
  dailyGoals: DailyGoals;
}

interface StreakItemProps {
  emoji: string;
  label: string;
  count: number;
  highlight?: boolean;
}

function StreakItem({ emoji, label, count, highlight }: StreakItemProps) {
  return (
    <View style={[styles.streakItem, highlight && styles.streakItemHighlight]}>
      <Text style={styles.streakEmoji}>{emoji}</Text>
      <Text style={styles.streakLabel}>{label}</Text>
      <Text style={[styles.streakCount, highlight && styles.streakCountHighlight]}>
        {count} {count === 1 ? 'day' : 'days'}
      </Text>
    </View>
  );
}

export function StreakCounters({ streaks, dailyGoals }: StreakCountersProps) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Streaks</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <StreakItem emoji="😴" label="Sleep" count={streaks.sleep} />
        <StreakItem emoji="🥩" label="Protein" count={streaks.protein} />
        {dailyGoals.trackCreatine && (
          <StreakItem emoji="💊" label="Creatine" count={streaks.creatine} />
        )}
        {dailyGoals.trackTraining && (
          <StreakItem emoji="💪" label="Training" count={streaks.training} />
        )}
        <StreakItem
          emoji="⭐"
          label="Perfect"
          count={streaks.perfect}
          highlight={streaks.perfect > 0}
        />
      </ScrollView>
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
  scrollContent: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  streakItem: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minWidth: 70,
  },
  streakItemHighlight: {
    backgroundColor: colors.primary + '20', // 20% opacity gold
    borderWidth: 1,
    borderColor: colors.primary,
  },
  streakEmoji: {
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  streakLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  streakCount: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  streakCountHighlight: {
    color: colors.primary,
  },
});

export default StreakCounters;
