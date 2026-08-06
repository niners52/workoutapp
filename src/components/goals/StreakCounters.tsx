import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { StreakCounts } from '../../services/streaks';
import { DailyGoals, UserSettings } from '../../types';

interface StreakCountersProps {
  streaks: StreakCounts;
  dailyGoals: DailyGoals;
  calorieGoal?: number | null;
  userSettings?: UserSettings;
  // False when the user has zero ACTIVE supplements — hides the Creatine
  // streak regardless of the trackCreatine setting (which defaults true).
  hasActiveSupplements?: boolean;
}

type IconType = 'ionicons' | 'material';

interface StreakItemProps {
  iconType: IconType;
  iconName: string;
  label: string;
  count: number;
  highlight?: boolean;
}

const STREAK_ACTIVE_COLOR = '#FFC52F';
const STREAK_INACTIVE_COLOR = '#8E8E93';

function StreakItem({ iconType, iconName, label, count, highlight }: StreakItemProps) {
  const iconColor = count > 0 ? STREAK_ACTIVE_COLOR : STREAK_INACTIVE_COLOR;
  const iconSize = 22;

  return (
    <View style={[styles.streakItem, highlight && styles.streakItemHighlight]}>
      <View style={styles.iconContainer}>
        {iconType === 'material' ? (
          <MaterialCommunityIcons
            name={iconName as keyof typeof MaterialCommunityIcons.glyphMap}
            size={iconSize}
            color={iconColor}
          />
        ) : (
          <Ionicons
            name={iconName as keyof typeof Ionicons.glyphMap}
            size={iconSize}
            color={iconColor}
          />
        )}
      </View>
      <Text style={styles.streakLabel}>{label}</Text>
      <Text style={[styles.streakCount, highlight && styles.streakCountHighlight]}>
        {count} {count === 1 ? 'day' : 'days'}
      </Text>
    </View>
  );
}

export function StreakCounters({ streaks, dailyGoals, calorieGoal, userSettings, hasActiveSupplements = true }: StreakCountersProps) {
  const showCalorieStreak = calorieGoal && calorieGoal > 0;

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Streaks</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <StreakItem
          iconType="ionicons"
          iconName="moon"
          label="Sleep"
          count={streaks.sleep}
        />
        <StreakItem
          iconType="material"
          iconName="food-steak"
          label="Protein"
          count={streaks.protein}
        />
        {showCalorieStreak && (
          <StreakItem
            iconType="material"
            iconName="silverware-fork-knife"
            label="Calories"
            count={streaks.calories}
          />
        )}
        {dailyGoals.trackCreatine && hasActiveSupplements && (
          <StreakItem
            iconType="material"
            iconName="pill"
            label="Creatine"
            count={streaks.creatine}
          />
        )}
        {dailyGoals.trackTraining && (
          <StreakItem
            iconType="material"
            iconName="arm-flex"
            label="Training"
            count={streaks.training}
          />
        )}
        {dailyGoals.trackPT && (
          <StreakItem
            iconType="material"
            iconName="medical-bag"
            label="PT"
            count={streaks.pt}
          />
        )}
        {userSettings?.trackYoga && (
          <StreakItem
            iconType="material"
            iconName="yoga"
            label="Yoga"
            count={streaks.yoga}
          />
        )}
        {userSettings?.trackCardio && (
          <StreakItem
            iconType="material"
            iconName="run"
            label="Cardio"
            count={streaks.cardio}
          />
        )}
        <StreakItem
          iconType="material"
          iconName="fire"
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
  iconContainer: {
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
