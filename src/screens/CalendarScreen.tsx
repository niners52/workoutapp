import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  format,
  isSameDay,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isAfter,
  startOfDay,
} from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { useWorkoutBarPadding } from '../components/workout';
import { CalendarView, GoalStatusMap } from '../components/calendar';
import { useData } from '../contexts/DataContext';
import {
  getWorkouts,
  getSupplements,
  getSupplementIntakes,
  getUserSettings,
} from '../services/storage';
import { batchFetchHealthData } from '../services/healthKitCache';
import { checkCalorieGoalMet } from '../services/streaks';
import { Workout, DEFAULT_DAILY_GOALS } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function CalendarScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { workouts, templates, userSettings, refreshWorkouts } = useData();
  const workoutBarPadding = useWorkoutBarPadding();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [goalStatusMap, setGoalStatusMap] = useState<GoalStatusMap>({});
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Load goal status for the current month.
   * Fetches from storage directly, batch fetches HealthKit data.
   * No per-day async calls.
   */
  const loadGoalStatus = useCallback(async () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const today = startOfDay(new Date());

    // Get all days in the month that are today or earlier
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const datesToProcess = allDays.filter(day => !isAfter(startOfDay(day), today));

    if (datesToProcess.length === 0) {
      setGoalStatusMap({});
      return;
    }

    try {
      // Fetch all local data from storage (fast)
      const [freshWorkouts, freshSupplements, freshIntakes, freshSettings] = await Promise.all([
        getWorkouts(),
        getSupplements(),
        getSupplementIntakes(),
        getUserSettings(),
      ]);

      const activeSupps = freshSupplements.filter(s => s.isActive);
      const dailyGoals = freshSettings.dailyGoals || DEFAULT_DAILY_GOALS;

      // Batch fetch HealthKit data for all dates (parallel, chunked, with timeouts)
      const healthData = await batchFetchHealthData(datesToProcess);

      // Build status map synchronously (no async calls in loop)
      const statusMap: GoalStatusMap = {};

      for (const day of datesToProcess) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0 };

        let goalsMetCount = 0;

        // Sleep
        if (health.sleepHours >= dailyGoals.sleepHours) goalsMetCount++;

        // Protein
        if (health.proteinGrams >= dailyGoals.proteinGrams) goalsMetCount++;

        // Supplements
        const dayIntakes = freshIntakes.filter(i => i.date === dateStr);
        const allSupplementsTaken = activeSupps.length > 0 &&
          activeSupps.every(s => dayIntakes.some(i => i.supplementId === s.id));
        if (activeSupps.length === 0 || allSupplementsTaken) goalsMetCount++;

        // Training
        const hasWorkout = freshWorkouts.some(w => {
          if (!w.completedAt) return false;
          return format(new Date(w.completedAt), 'yyyy-MM-dd') === dateStr;
        });
        if (hasWorkout) goalsMetCount++;

        // Calories (only if goal is set)
        const calorieGoal = freshSettings.calorieGoal || 0;
        if (calorieGoal > 0) {
          const caloriesMet = checkCalorieGoalMet(
            health.calories,
            calorieGoal,
            freshSettings.nutritionMode,
            freshSettings.calorieTolerancePercent || 10
          );
          if (caloriesMet) goalsMetCount++;
        }

        statusMap[dateStr] = goalsMetCount;
      }

      setGoalStatusMap(statusMap);
    } catch (error) {
      console.error('[CalendarScreen] Error loading goal status:', error);
    }
  }, [currentMonth]);

  // Load on focus - only depends on currentMonth which is stable
  useFocusEffect(
    useCallback(() => {
      refreshWorkouts();
      loadGoalStatus();
    }, [refreshWorkouts, loadGoalStatus])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshWorkouts();
    await loadGoalStatus();
    setRefreshing(false);
  }, [refreshWorkouts, loadGoalStatus]);

  const handleMonthChange = useCallback((date: Date) => {
    setCurrentMonth(date);
    setSelectedDate(null);
  }, []);

  const handleDayPress = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  const handleWorkoutPress = (workoutId: string) => {
    navigation.navigate('WorkoutDetail', { workoutId });
  };

  // Get workouts for selected date (from DataContext for UI)
  const selectedDateWorkouts = useMemo(() => {
    if (!selectedDate) return [];
    return workouts.filter(w => {
      if (!w.completedAt) return false;
      return isSameDay(new Date(w.completedAt), selectedDate);
    });
  }, [workouts, selectedDate]);

  const getTemplateName = (workout: Workout): string => {
    if (!workout.templateId) return 'Custom Workout';
    const template = templates.find(t => t.id === workout.templateId);
    return template?.name || 'Custom Workout';
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + workoutBarPadding }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
      >
        <Text style={styles.title}>Calendar</Text>

        {/* Calendar */}
        <CalendarView
          currentMonth={currentMonth}
          onMonthChange={handleMonthChange}
          goalStatusMap={goalStatusMap}
          onDayPress={handleDayPress}
          weekStartDay={userSettings.weekStartDay}
        />

        {/* Selected Date Workouts */}
        {selectedDate && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </Text>
            {selectedDateWorkouts.length === 0 ? (
              <Card>
                <Text style={styles.emptyText}>No workouts on this day</Text>
              </Card>
            ) : (
              <Card padding="none">
                {selectedDateWorkouts.map((workout, index) => (
                  <TouchableOpacity
                    key={workout.id}
                    style={[
                      styles.workoutItem,
                      index === 0 && styles.workoutItemFirst,
                      index === selectedDateWorkouts.length - 1 && styles.workoutItemLast,
                      index < selectedDateWorkouts.length - 1 && styles.workoutItemBorder,
                    ]}
                    onPress={() => handleWorkoutPress(workout.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.workoutInfo}>
                      <Text style={styles.workoutTitle}>
                        {getTemplateName(workout)}
                      </Text>
                      <Text style={styles.workoutTime}>
                        {format(new Date(workout.startedAt), 'h:mm a')}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </Card>
            )}
          </View>
        )}

        {/* Goal Stats for Month */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {format(currentMonth, 'MMMM')} Summary
          </Text>
          <Card>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {Object.values(goalStatusMap).filter(g => {
                    const maxGoals = (userSettings.calorieGoal && userSettings.calorieGoal > 0) ? 5 : 4;
                    return g === maxGoals;
                  }).length}
                </Text>
                <Text style={styles.statLabel}>Perfect Days</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {Object.values(goalStatusMap).filter(g => g >= 3).length}
                </Text>
                <Text style={styles.statLabel}>3+ Goals</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {Object.keys(goalStatusMap).length}
                </Text>
                <Text style={styles.statLabel}>Days Tracked</Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  section: {
    marginTop: spacing.xxl,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.base,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
    lineHeight: typography.size.base * 1.5,
  },
  workoutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.lg,
  },
  workoutItemFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  workoutItemLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  workoutItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  workoutInfo: {
    flex: 1,
  },
  workoutTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text,
    lineHeight: typography.size.base * 1.4,
  },
  workoutTime: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: typography.size.sm * 1.4,
  },
  chevron: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
  },
  stat: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  statValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
    lineHeight: typography.size.xxl * 1.2,
  },
  statLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: typography.size.sm * 1.4,
  },
});

export default CalendarScreen;
