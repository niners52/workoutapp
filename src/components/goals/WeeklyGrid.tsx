import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { DailyGoalStatus, LetterGrade, GRADE_COLORS } from '../../services/streaks';
import { DailyGoals } from '../../types';
import { isFuture, parseISO } from 'date-fns';

interface WeeklyGridProps {
  days: DailyGoalStatus[];
  todayIndex: number;
  dayLabels: string[];
  dailyGoals: DailyGoals;
  // Tapping any day column (grade cell or header) opens that day's detail —
  // previously the grid showed grades but wasn't tappable at all.
  onDayPress?: (dateStr: string) => void;
  // False when the user has zero ACTIVE supplements — hides the Supps row
  // regardless of trackCreatine (which defaults true).
  hasActiveSupplements?: boolean;
}

type GoalStatus = { type: 'grade'; grade: LetterGrade } | { type: 'future' } | { type: 'na' };

function StatusIcon({ status }: { status: GoalStatus }) {
  if (status.type === 'future' || status.type === 'na') {
    return <Text style={styles.dash}>-</Text>;
  }
  return (
    <Text style={[styles.gradeLetter, { color: GRADE_COLORS[status.grade] }]}>
      {status.grade}
    </Text>
  );
}

function GridRow({
  label,
  days,
  getStatus,
  todayIndex,
  onDayPress,
}: {
  label: string;
  days: DailyGoalStatus[];
  getStatus: (day: DailyGoalStatus, isFutureDay: boolean) => GoalStatus;
  todayIndex: number;
  onDayPress?: (dateStr: string) => void;
}) {
  return (
    <View style={styles.gridRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowCells}>
        {days.map((day, index) => {
          const isFutureDay = isFuture(parseISO(day.date));
          const isToday = index === todayIndex;
          const status = getStatus(day, isFutureDay);

          return (
            <TouchableOpacity
              key={day.date}
              style={[styles.cell, isToday && styles.cellToday]}
              onPress={onDayPress ? () => onDayPress(day.date) : undefined}
              disabled={!onDayPress}
              activeOpacity={0.6}
            >
              <StatusIcon status={status} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function WeeklyGrid({ days, todayIndex, dayLabels, dailyGoals, onDayPress, hasActiveSupplements = true }: WeeklyGridProps) {
  const getSleepStatus = (day: DailyGoalStatus, isFutureDay: boolean): GoalStatus => {
    if (isFutureDay) return { type: 'future' };
    if (day.sleep.hours === 0) return { type: 'na' };
    return { type: 'grade', grade: day.sleep.grade };
  };

  const getProteinStatus = (day: DailyGoalStatus, isFutureDay: boolean): GoalStatus => {
    if (isFutureDay) return { type: 'future' };
    if (day.protein.grams === 0) return { type: 'na' };
    return { type: 'grade', grade: day.protein.grade };
  };

  const getSupplementsStatus = (day: DailyGoalStatus, isFutureDay: boolean): GoalStatus => {
    if (isFutureDay) return { type: 'future' };
    if (day.supplements.total === 0) return { type: 'na' };
    return { type: 'grade', grade: day.supplements.grade };
  };

  const getTrainingStatus = (day: DailyGoalStatus, isFutureDay: boolean): GoalStatus => {
    if (isFutureDay) return { type: 'future' };
    if (!day.training.completed) return { type: 'na' }; // na for rest days
    return { type: 'grade', grade: day.training.grade };
  };

  const getPTStatus = (day: DailyGoalStatus, isFutureDay: boolean): GoalStatus => {
    if (isFutureDay) return { type: 'future' };
    if (day.physicalTherapy.total === 0) return { type: 'na' };
    return { type: 'grade', grade: day.physicalTherapy.grade };
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Weekly Progress</Text>

      {/* Day headers */}
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel} />
        <View style={styles.rowCells}>
          {dayLabels.map((label, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.headerCell, index === todayIndex && styles.headerCellToday]}
              onPress={onDayPress && days[index] ? () => onDayPress(days[index].date) : undefined}
              disabled={!onDayPress || !days[index]}
              activeOpacity={0.6}
            >
              <Text
                style={[
                  styles.headerText,
                  index === todayIndex && styles.headerTextToday,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Data rows */}
      <GridRow
        label="Sleep"
        days={days}
        getStatus={getSleepStatus}
        todayIndex={todayIndex}
        onDayPress={onDayPress}
      />
      <GridRow
        label="Protein"
        days={days}
        getStatus={getProteinStatus}
        todayIndex={todayIndex}
        onDayPress={onDayPress}
      />
      {dailyGoals.trackCreatine && hasActiveSupplements && (
        <GridRow
          label="Supps"
          days={days}
          getStatus={getSupplementsStatus}
          todayIndex={todayIndex}
          onDayPress={onDayPress}
        />
      )}
      {dailyGoals.trackTraining && (
        <GridRow
          label="Training"
          days={days}
          getStatus={getTrainingStatus}
          todayIndex={todayIndex}
          onDayPress={onDayPress}
        />
      )}
      {dailyGoals.trackPT && (
        <GridRow
          label="PT"
          days={days}
          getStatus={getPTStatus}
          todayIndex={todayIndex}
          onDayPress={onDayPress}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerLabel: {
    width: 70,
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  headerCellToday: {
    backgroundColor: colors.primary + '20',
    borderRadius: borderRadius.sm,
  },
  headerText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    color: colors.textSecondary,
  },
  headerTextToday: {
    color: colors.primary,
    fontWeight: typography.weight.bold,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  rowLabel: {
    width: 70,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  rowCells: {
    flex: 1,
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  cellToday: {
    backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.sm,
  },
  dash: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  gradeLetter: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
});

export default WeeklyGrid;
