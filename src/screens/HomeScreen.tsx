import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card, ProgressBar } from '../components/common';
import { TodayRings, StreakCounters, WeeklyGrid, WeeklyTotals } from '../components/goals';
import { SupplementCheckbox } from '../components/supplements';
import { useWorkoutBarPadding } from '../components/workout';
import { useData } from '../contexts/DataContext';
import { useWorkout } from '../contexts/WorkoutContext';
import {
  getTodayGoalStatus,
  calculateStreaks,
  getWeeklyGridData,
  getWeeklySummary,
  DailyGoalStatus,
  StreakCounts,
  WeeklySummary,
} from '../services/streaks';
import {
  calculateWeeklyShortfalls,
  MuscleGroupShortfall,
} from '../services/analytics';
import {
  getWorkouts,
  getSupplements,
  getSupplementIntakes,
  getUserSettings,
  getRoutines,
  getTemplates,
  getExercises,
} from '../services/storage';
import { DAY_NAMES, DEFAULT_DAILY_GOALS, DEFAULT_WEEKLY_GOALS } from '../types';
import { RootStackParamList } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    userSettings,
    refreshWorkouts,
    supplements,
    supplementIntakes,
    toggleSupplementIntake,
    templates,
    exercises,
    getActiveRoutine,
  } = useData();
  const { isWorkoutActive } = useWorkout();
  const workoutBarPadding = useWorkoutBarPadding();

  // Today's date for supplements
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const activeSupplements = useMemo(
    () => supplements.filter(s => s.isActive),
    [supplements]
  );

  const [refreshing, setRefreshing] = useState(false);
  const [todayStatus, setTodayStatus] = useState<DailyGoalStatus | null>(null);
  const [streaks, setStreaks] = useState<StreakCounts | null>(null);
  const [weeklyGridData, setWeeklyGridData] = useState<{
    days: DailyGoalStatus[];
    todayIndex: number;
    dayLabels: string[];
  } | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [shortfalls, setShortfalls] = useState<MuscleGroupShortfall[]>([]);

  // Memoize active routine for render
  const activeRoutine = useMemo(() => getActiveRoutine(), [getActiveRoutine]);

  // Fallbacks for settings that might not have been migrated
  const dailyGoals = userSettings.dailyGoals || DEFAULT_DAILY_GOALS;
  const weeklyGoals = userSettings.weeklyGoals || DEFAULT_WEEKLY_GOALS;

  /**
   * Load all computed data.
   * Fetches fresh from storage directly to avoid stale closures.
   * No DataContext dependencies = no re-render loop.
   */
  const loadData = useCallback(async () => {
    try {
      // Phase 1: Fetch fresh local data from storage (fast)
      const [
        freshWorkouts,
        freshSupplements,
        freshIntakes,
        freshSettings,
        freshRoutines,
        freshTemplates,
        freshExercises,
      ] = await Promise.all([
        getWorkouts(),
        getSupplements(),
        getSupplementIntakes(),
        getUserSettings(),
        getRoutines(),
        getTemplates(),
        getExercises(),
      ]);

      const activeSupps = freshSupplements.filter(s => s.isActive);
      const currentRoutine = freshRoutines.find(r => r.isActive);

      // Phase 2: Calculate shortfalls (no HealthKit, fast)
      try {
        const shortfallData = await calculateWeeklyShortfalls(
          currentRoutine, freshTemplates, freshExercises, freshSettings
        );
        if (shortfallData) setShortfalls(shortfallData);
      } catch (e) {
        console.error('[HomeScreen] Shortfalls error:', e);
      }

      // Phase 3: Calculate HealthKit-dependent data (all in parallel)
      const [status, streakCounts, gridData, summary] = await Promise.all([
        getTodayGoalStatus(freshSettings, freshWorkouts, freshIntakes, activeSupps)
          .catch(e => { console.error('[HomeScreen] Today status error:', e); return null; }),
        calculateStreaks(freshSettings, freshWorkouts, freshIntakes, activeSupps, currentRoutine)
          .catch(e => { console.error('[HomeScreen] Streaks error:', e); return null; }),
        getWeeklyGridData(freshSettings, freshWorkouts, freshIntakes, activeSupps)
          .catch(e => { console.error('[HomeScreen] Grid error:', e); return null; }),
        getWeeklySummary(freshSettings, freshWorkouts, freshIntakes, activeSupps)
          .catch(e => { console.error('[HomeScreen] Summary error:', e); return null; }),
      ]);

      if (status) setTodayStatus(status);
      if (streakCounts) setStreaks(streakCounts);
      if (gridData) setWeeklyGridData(gridData);
      if (summary) setWeeklySummary(summary);
    } catch (error) {
      console.error('[HomeScreen] Failed to load:', error);
    }
  }, []);

  // Load data on screen focus - stable deps, no re-render loop
  useFocusEffect(
    useCallback(() => {
      refreshWorkouts();
      loadData();
    }, [refreshWorkouts, loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshWorkouts();
    await loadData();
    setRefreshing(false);
  }, [refreshWorkouts, loadData]);

  // Week dates for header
  const today = new Date();
  const dayOffset = userSettings.weekStartDay === 'sunday' ? 0 : 1;
  const weekStart = startOfWeek(today, { weekStartsOn: dayOffset as 0 | 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: dayOffset as 0 | 1 });

  // Get today's planned workouts from active routine
  const todayDayOfWeek = today.getDay();
  const todayPlannedTemplateIds =
    activeRoutine?.daySchedule.find(d => d.day === todayDayOfWeek)?.templateIds || [];
  const todayPlannedTemplates = todayPlannedTemplateIds
    .map(id => templates.find(t => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

  const handleStartWorkout = () => {
    if (isWorkoutActive) {
      navigation.navigate('ActiveWorkout', { workoutId: '' });
    } else {
      navigation.navigate('StartWorkout');
    }
  };

  const handleStartPlannedWorkout = (templateId: string) => {
    navigation.navigate('TemplateDetail', { templateId });
  };

  const handleMuscleGroupPress = (muscleGroup: string) => {
    navigation.navigate('MuscleGroupDetail', {
      muscleGroup,
      weekStart: format(weekStart, 'yyyy-MM-dd'),
    });
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: 100 + workoutBarPadding }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Workout Tracker</Text>
          <Text style={styles.dateText}>
            Week of {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d')}
          </Text>
        </View>

        {/* Today's Rings - shows when data arrives */}
        {todayStatus ? (
          <TodayRings
            status={todayStatus}
            dailyGoals={dailyGoals}
          />
        ) : (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading today's progress...</Text>
          </Card>
        )}

        {/* Streaks - shows when data arrives */}
        {streaks ? (
          <StreakCounters
            streaks={streaks}
            dailyGoals={dailyGoals}
          />
        ) : (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading streaks...</Text>
          </Card>
        )}

        {/* Weekly Grid - shows when data arrives */}
        {weeklyGridData ? (
          <WeeklyGrid
            days={weeklyGridData.days}
            todayIndex={weeklyGridData.todayIndex}
            dayLabels={weeklyGridData.dayLabels}
            dailyGoals={dailyGoals}
          />
        ) : (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading weekly data...</Text>
          </Card>
        )}

        {/* Weekly Totals - shows when data arrives */}
        {weeklySummary ? (
          <WeeklyTotals
            summary={weeklySummary}
            weeklyGoals={weeklyGoals}
            dailyGoals={dailyGoals}
          />
        ) : (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading weekly totals...</Text>
          </Card>
        )}

        {/* Weekly Shortfalls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Muscle Groups Needing Attention</Text>
          {shortfalls.length === 0 ? (
            <Card style={styles.onTrackCard}>
              <MaterialCommunityIcons name="arm-flex" size={32} color={colors.success} style={styles.onTrackIcon} />
              <Text style={styles.onTrackText}>You're on track this week!</Text>
              <Text style={styles.onTrackSubtext}>
                All muscle groups are projected to hit their targets.
              </Text>
            </Card>
          ) : (
            <Card padding="none">
              {shortfalls.slice(0, 5).map((item, index) => {
                const progress = item.targetSets > 0
                  ? (item.currentSets / item.targetSets) * 100
                  : 0;
                return (
                  <TouchableOpacity
                    key={item.muscleGroup}
                    style={[
                      styles.shortfallRow,
                      index === 0 && styles.shortfallRowFirst,
                      index === Math.min(shortfalls.length - 1, 4) && styles.shortfallRowLast,
                      index < Math.min(shortfalls.length - 1, 4) && styles.shortfallRowBorder,
                    ]}
                    onPress={() => handleMuscleGroupPress(item.muscleGroup)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.shortfallInfo}>
                      <View style={styles.shortfallHeader}>
                        <Text style={styles.shortfallName}>{item.displayName}</Text>
                        <Text style={styles.shortfallStats}>
                          {item.currentSets}/{item.targetSets} sets
                        </Text>
                      </View>
                      <ProgressBar
                        progress={progress}
                        height={6}
                        color={colors.warning}
                        style={styles.shortfallProgress}
                      />
                      <Text style={styles.shortfallNote}>
                        Need {item.shortfall} more sets
                        {item.projectedSets > 0 && ` (${item.projectedSets} scheduled)`}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </Card>
          )}
        </View>

        {/* Today's Planned Workouts */}
        {activeRoutine && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Today's Plan ({DAY_NAMES[todayDayOfWeek]})
            </Text>
            <Card padding={todayPlannedTemplates.length > 0 ? 'none' : undefined}>
              {todayPlannedTemplates.length > 0 ? (
                todayPlannedTemplates.map((template, index) => (
                  <TouchableOpacity
                    key={template.id}
                    style={[
                      styles.plannedWorkout,
                      index === 0 && styles.plannedWorkoutFirst,
                      index === todayPlannedTemplates.length - 1 &&
                        styles.plannedWorkoutLast,
                      index < todayPlannedTemplates.length - 1 &&
                        styles.plannedWorkoutBorder,
                    ]}
                    onPress={() => handleStartPlannedWorkout(template.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.plannedWorkoutInfo}>
                      <Text style={styles.plannedWorkoutName}>{template.name}</Text>
                      <Text style={styles.plannedWorkoutRoutine}>
                        {todayPlannedTemplates.length > 1
                          ? `Workout ${index + 1} of ${todayPlannedTemplates.length}`
                          : `From: ${activeRoutine.name}`}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.restDayContainer}>
                  <Ionicons name="moon" size={32} color={colors.textSecondary} style={styles.restDayIcon} />
                  <Text style={styles.restDayText}>Rest Day</Text>
                  <Text style={styles.restDaySubtext}>Enjoy your recovery!</Text>
                </View>
              )}
            </Card>
          </View>
        )}

        {/* Today's Supplements */}
        {activeSupplements.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Supplements</Text>
            <Card padding="none">
              {activeSupplements.map((supplement, index) => {
                const isTaken = supplementIntakes.some(
                  i => i.supplementId === supplement.id && i.date === todayStr
                );
                return (
                  <SupplementCheckbox
                    key={supplement.id}
                    supplement={supplement}
                    isTaken={isTaken}
                    onToggle={() => toggleSupplementIntake(supplement.id, todayStr)}
                    isFirst={index === 0}
                    isLast={index === activeSupplements.length - 1}
                  />
                );
              })}
            </Card>
          </View>
        )}

        {/* Spacer for button */}
        <View style={styles.buttonSpacer} />
      </ScrollView>

      {/* Start Workout Button */}
      <View style={[styles.buttonContainer, { bottom: workoutBarPadding }]}>
        <Button
          title={isWorkoutActive ? 'Continue Workout' : 'Start Workout'}
          onPress={handleStartWorkout}
          size="large"
          fullWidth
        />
      </View>
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
  },
  header: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  dateText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  buttonSpacer: {
    height: 80,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.base,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  plannedWorkout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  plannedWorkoutFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  plannedWorkoutLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  plannedWorkoutBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  plannedWorkoutInfo: {
    flex: 1,
  },
  plannedWorkoutName: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  plannedWorkoutRoutine: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  restDayContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  restDayIcon: {
    marginBottom: spacing.sm,
  },
  restDayText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  restDaySubtext: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  onTrackCard: {
    alignItems: 'center',
  },
  onTrackIcon: {
    marginBottom: spacing.sm,
  },
  onTrackText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.success,
  },
  onTrackSubtext: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  shortfallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  shortfallRowFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  shortfallRowLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  shortfallRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  shortfallInfo: {
    flex: 1,
  },
  shortfallHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  shortfallName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  shortfallStats: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  shortfallProgress: {
    marginVertical: spacing.xs,
  },
  shortfallNote: {
    fontSize: typography.size.xs,
    color: colors.warning,
  },
  loadingCard: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  loadingText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
});

export default HomeScreen;
