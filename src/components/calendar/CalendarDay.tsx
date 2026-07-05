import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';

interface CalendarDayProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  goalsMet: number;
  goalsTotal: number; // count of ENABLED categories for this day
  hasIncompleteWorkout?: boolean;
  hasYoga?: boolean;
  hasCardio?: boolean;
  hasTravel?: boolean; // workout logged at the Travel/Other pseudo-location
  onPress: () => void;
}

// Color the day by ratio (met / total) so disabling a category doesn't make
// "perfect" unreachable — e.g. with supplements off, met=4/total=4 is still gold.
const getGoalBackgroundColor = (
  met: number,
  total: number,
  isFuture: boolean,
): string | undefined => {
  if (isFuture || total <= 0) return undefined;
  const ratio = met / total;
  if (ratio >= 0.999) return colors.primary;                  // All enabled goals met
  if (ratio >= 0.75) return 'rgba(255, 197, 47, 0.5)';         // Most met (3/4, 4/5)
  if (ratio >= 0.5) return colors.backgroundTertiary;          // Half-ish (2/4, 3/5)
  if (ratio > 0) return colors.backgroundSecondary;            // Some met (1/4, 1/5)
  return undefined;                                            // Nothing met
};

const getGoalTextColor = (
  met: number,
  total: number,
  isFuture: boolean,
): string => {
  if (isFuture) return colors.textTertiary;
  if (total > 0 && met / total >= 0.75) return colors.textOnPrimary;
  return colors.text;
};

export function CalendarDay({
  date,
  isCurrentMonth,
  isToday,
  isFuture,
  goalsMet,
  goalsTotal,
  hasIncompleteWorkout,
  hasYoga,
  hasCardio,
  hasTravel,
  onPress,
}: CalendarDayProps) {
  const dayNumber = date.getDate();
  const backgroundColor = isCurrentMonth ? getGoalBackgroundColor(goalsMet, goalsTotal, isFuture) : undefined;
  const textColor = isCurrentMonth ? getGoalTextColor(goalsMet, goalsTotal, isFuture) : colors.textTertiary;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        backgroundColor && { backgroundColor },
        isToday && styles.todayRing,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.dayText,
          { color: textColor },
          isToday && styles.dayTextToday,
        ]}
      >
        {dayNumber}
      </Text>
      {hasIncompleteWorkout && isCurrentMonth && (
        <View style={styles.incompleteIndicator} />
      )}
      {isCurrentMonth && !isFuture && (hasYoga || hasCardio || hasTravel) && (
        <View style={styles.activityDots}>
          {hasYoga && <View style={[styles.activityDot, { backgroundColor: colors.chartYoga }]} />}
          {hasCardio && <View style={[styles.activityDot, { backgroundColor: colors.chartCardio }]} />}
          {hasTravel && <Text style={styles.travelIcon}>✈️</Text>}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
    borderRadius: borderRadius.md,
  },
  todayRing: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  dayText: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  dayTextToday: {
    fontWeight: '700',
  },
  incompleteIndicator: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  activityDots: {
    position: 'absolute',
    bottom: 2,
    flexDirection: 'row',
    gap: 2,
  },
  activityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  travelIcon: {
    fontSize: 7,
    lineHeight: 8,
  },
});

export default CalendarDay;
