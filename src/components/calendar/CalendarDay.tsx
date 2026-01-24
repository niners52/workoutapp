import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';

interface CalendarDayProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasWorkout: boolean;
  onPress: () => void;
}

export function CalendarDay({
  date,
  isCurrentMonth,
  isToday,
  hasWorkout,
  onPress,
}: CalendarDayProps) {
  const dayNumber = date.getDate();

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isToday && styles.todayContainer,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.dayText,
          !isCurrentMonth && styles.dayTextOtherMonth,
          isToday && styles.dayTextToday,
        ]}
      >
        {dayNumber}
      </Text>
      {hasWorkout && (
        <View style={[styles.workoutDot, isToday && styles.workoutDotToday]} />
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
  todayContainer: {
    backgroundColor: colors.primary,
  },
  dayText: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  dayTextOtherMonth: {
    color: colors.textTertiary,
  },
  dayTextToday: {
    color: colors.text,
    fontWeight: '600',
  },
  workoutDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 2,
  },
  workoutDotToday: {
    backgroundColor: colors.text,
  },
});

export default CalendarDay;
