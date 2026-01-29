import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isAfter,
  startOfDay,
} from 'date-fns';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { CalendarDay } from './CalendarDay';
import { WeekStartDay } from '../../types';

// Map of date string to goals met count (0-4)
export interface GoalStatusMap {
  [dateStr: string]: number;
}

interface CalendarViewProps {
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  goalStatusMap: GoalStatusMap; // Map of 'YYYY-MM-DD' to goals met count
  onDayPress: (date: Date) => void;
  weekStartDay: WeekStartDay;
}

export function CalendarView({
  currentMonth,
  onMonthChange,
  goalStatusMap,
  onDayPress,
  weekStartDay,
}: CalendarViewProps) {
  const today = startOfDay(new Date());
  const weekStartsOn = weekStartDay === 'sunday' ? 0 : 1;

  // Get day headers based on week start
  const dayHeaders = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (weekStartsOn === 1) {
      // Rotate array to start with Monday
      return [...days.slice(1), days[0]];
    }
    return days;
  }, [weekStartsOn]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: weekStartsOn as 0 | 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: weekStartsOn as 0 | 1 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth, weekStartsOn]);

  const handlePreviousMonth = () => {
    onMonthChange(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    onMonthChange(addMonths(currentMonth, 1));
  };

  // Group days into weeks
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

  return (
    <View style={styles.container}>
      {/* Month Navigation */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handlePreviousMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>
          {format(currentMonth, 'MMMM yyyy')}
        </Text>
        <TouchableOpacity onPress={handleNextMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day Headers */}
      <View style={styles.dayHeadersRow}>
        {dayHeaders.map((day) => (
          <View key={day} style={styles.dayHeaderCell}>
            <Text style={styles.dayHeaderText}>{day}</Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.weekRow}>
            {week.map((date) => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const isCurrentMonth = isSameMonth(date, currentMonth);
              const isToday = isSameDay(date, today);
              const isFuture = isAfter(startOfDay(date), today);
              const goalsMetCount = goalStatusMap[dateStr] ?? 0;

              return (
                <CalendarDay
                  key={dateStr}
                  date={date}
                  isCurrentMonth={isCurrentMonth}
                  isToday={isToday}
                  isFuture={isFuture}
                  goalsMetCount={goalsMetCount}
                  onPress={() => onDayPress(date)}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  navButton: {
    padding: spacing.sm,
  },
  navButtonText: {
    fontSize: 28,
    color: colors.primary,
    fontWeight: '300',
  },
  monthTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  dayHeadersRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayHeaderText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: typography.weight.medium,
  },
  calendarGrid: {
    gap: 2,
  },
  weekRow: {
    flexDirection: 'row',
  },
});

export default CalendarView;
