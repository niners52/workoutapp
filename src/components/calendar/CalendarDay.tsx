import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';

interface CalendarDayProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  goalsMetCount: number; // 0-4 goals met
  onPress: () => void;
}

// Color mapping based on goals met
const getGoalBackgroundColor = (goalsMetCount: number, isFuture: boolean): string | undefined => {
  if (isFuture) return undefined;
  switch (goalsMetCount) {
    case 4: return colors.primary; // Gold - perfect day
    case 3: return 'rgba(255, 197, 47, 0.5)'; // Muted gold (50% opacity)
    case 2: return colors.backgroundTertiary; // Light navy (#1A3A5C)
    case 1: return colors.backgroundSecondary; // Darker navy (#12284B)
    default: return undefined; // No highlight
  }
};

const getGoalTextColor = (goalsMetCount: number, isFuture: boolean): string => {
  if (isFuture) return colors.textTertiary;
  if (goalsMetCount >= 3) return colors.textOnPrimary; // Dark text on gold
  return colors.text; // White text on navy or no background
};

export function CalendarDay({
  date,
  isCurrentMonth,
  isToday,
  isFuture,
  goalsMetCount,
  onPress,
}: CalendarDayProps) {
  const dayNumber = date.getDate();
  const backgroundColor = isCurrentMonth ? getGoalBackgroundColor(goalsMetCount, isFuture) : undefined;
  const textColor = isCurrentMonth ? getGoalTextColor(goalsMetCount, isFuture) : colors.textTertiary;

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
});

export default CalendarDay;
