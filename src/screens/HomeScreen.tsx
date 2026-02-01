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
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card, ProgressBar } from '../components/common';
import { TodayRings, StreakCounters, WeeklyGrid, WeeklyTotals } from '../components/goals';
import { SupplementCheckbox } from '../components/supplements';
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
import { DAY_NAMES } from '../types';
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

  // Get today's date string for supplements
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Memoize to prevent infinite re-render loop
  const activeSupplements = useMemo(
    () => supplements.filter(s => s.isActive),
    [supplements]
  );

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [todayStatus, setTodayStatus] = useState<DailyGoalStatus | null>(null);
  const [streaks, setStreaks] = useState<StreakCounts | null>(null);
  const [weeklyGridData, setWeeklyGridData] = useState<{
    days: DailyGoalStatus[];
    todayIndex: number;
    dayLabels: string[];
  } | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [shortfalls, setShortfalls] = useState<MuscleGroupShortfall[]>([]);

  // Memoize to prevent infinite re-render loop
  const activeRoutine = useMemo(
    () => getActiveRoutine(),
    [getActiveRoutine]
  );

  // Ref to prevent concurrent loads
  const isLoadingRef = useRef(false);

  // Timeout wrapper for debugging hanging promises
  const withTimeout = async <T,>(
    promise: Promise<T>,
    timeoutMs: number,
    name: string
  ): Promise<T | null> => {
    const timeout = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    try {
      return await Promise.race([promise, timeout]);
    } catch (error) {
      console.error(`[HomeScreen] ${name} failed:`, error);
      return null;
    }
  };

  const loadData = useCallback(async () => {
    // Prevent concurrent loads
    if (isLoadingRef.current) {
      console.log('[HomeScreen] Already loading, skipping');
      return;
    }

    isLoadingRef.current = true;
    console.log('[HomeScreen] ========== loadData START ==========');
    console.log('[HomeScreen] userSettings:', userSettings);
    console.time('[HomeScreen] Total load time');

    setLoading(true);

    try {
      // Read current values inside the function
      const currentSupplements = supplements.filter(s => s.isActive);
      const currentRoutine = getActiveRoutine();

      console.log('[HomeScreen] activeSupplements:', currentSupplements);

      // Phase 1: Load critical data first (Today's status)
      console.log('[HomeScreen] Phase 1: Starting getTodayGoalStatus...');
      console.time('[HomeScreen] Phase 1: Critical data');

      const status = await withTimeout(
        getTodayGoalStatus(userSettings, currentSupplements),
        10000,
        'getTodayGoalStatus'
      );

      if (status) {
        setTodayStatus(status);
        console.log('[HomeScreen] Phase 1: getTodayGoalStatus SUCCESS', status);
      } else {
        console.warn('[HomeScreen] Phase 1: getTodayGoalStatus returned null');
      }
      console.timeEnd('[HomeScreen] Phase 1: Critical data');

      // Phase 2: Load non-critical data in parallel with individual timeouts
      console.log('[HomeScreen] Phase 2: Starting parallel data load...');
      console.time('[HomeScreen] Phase 2: Non-critical data');

      console.log('[HomeScreen] Phase 2: Starting calculateStreaks...');
      const streaksPromise = withTimeout(
        calculateStreaks(userSettings),
        10000,
        'calculateStreaks'
      );

      console.log('[HomeScreen] Phase 2: Starting getWeeklyGridData...');
      const gridDataPromise = withTimeout(
        getWeeklyGridData(userSettings),
        10000,
        'getWeeklyGridData'
      );

      console.log('[HomeScreen] Phase 2: Starting getWeeklySummary...');
      const summaryPromise = withTimeout(
        getWeeklySummary(userSettings),
        10000,
        'getWeeklySummary'
      );

      console.log('[HomeScreen] Phase 2: Starting calculateWeeklyShortfalls...');
      const shortfallPromise = withTimeout(
        calculateWeeklyShortfalls(currentRoutine, templates, exercises, userSettings),
        10000,
        'calculateWeeklyShortfalls'
      );

      const [streakCounts, gridData, summary, shortfallData] = await Promise.all([
        streaksPromise,
        gridDataPromise,
        summaryPromise,
        shortfallPromise,
      ]);

      if (streakCounts) {
        setStreaks(streakCounts);
        console.log('[HomeScreen] Phase 2: calculateStreaks SUCCESS', streakCounts);
      } else {
        console.warn('[HomeScreen] Phase 2: calculateStreaks returned null');
      }

      if (gridData) {
        setWeeklyGridData(gridData);
        console.log('[HomeScreen] Phase 2: getWeeklyGridData SUCCESS', gridData);
      } else {
        console.warn('[HomeScreen] Phase 2: getWeeklyGridData returned null');
      }

      if (summary) {
        setWeeklySummary(summary);
        console.log('[HomeScreen] Phase 2: getWeeklySummary SUCCESS', summary);
      } else {
        console.warn('[HomeScreen] Phase 2: getWeeklySummary returned null');
      }

      if (shortfallData) {
        setShortfalls(shortfallData);
        console.log('[HomeScreen] Phase 2: calculateWeeklyShortfalls SUCCESS', shortfallData);
      } else {
        console.warn('[HomeScreen] Phase 2: calculateWeeklyShortfalls returned null');
      }

      console.timeEnd('[HomeScreen] Phase 2: Non-critical data');
    } catch (error) {
      console.error('[HomeScreen] Failed to load home data:', error);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
      console.log('[HomeScreen] setLoading(false) - loading complete');
    }

    console.timeEnd('[HomeScreen] Total load time');
    console.log('[HomeScreen] ========== loadData END ==========');
  }, [userSettings, supplements, templates, exercises, getActiveRoutine]);

  // Use ref pattern to prevent useFocusEffect from re-registering on every render
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  useFocusEffect(
    useCallback(() => {
      refreshWorkouts();
      loadDataRef.current();
    }, [refreshWorkouts])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshWorkouts();
    await loadDataRef.current();
    setRefreshing(false);
  }, [refreshWorkouts]);

  // Week dates for header
  const today = new Date();
  const dayOffset = userSettings.weekStartDay === 'sunday' ? 0 : 1;
  const weekStart = startOfWeek(today, { weekStartsOn: dayOffset as 0 | 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: dayOffset as 0 | 1 });

  // Get today's planned workouts from active routine
  const todayDayOfWeek = today.getDay(); // 0-6 (Sunday-Saturday)
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
        contentContainerStyle={styles.content}
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

        {/* Today's Rings */}
        {loading ? (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading today's progress...</Text>
          </Card>
        ) : todayStatus && userSettings.dailyGoals ? (
          <TodayRings
            status={todayStatus}
            dailyGoals={userSettings.dailyGoals}
          />
        ) : (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>No daily goals configured</Text>
          </Card>
        )}

        {/* Streaks */}
        {loading ? (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading streaks...</Text>
          </Card>
        ) : streaks && userSettings.dailyGoals ? (
          <StreakCounters
            streaks={streaks}
            dailyGoals={userSettings.dailyGoals}
          />
        ) : (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>No streak data</Text>
          </Card>
        )}

        {/* Weekly Grid */}
        {loading ? (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading weekly data...</Text>
          </Card>
        ) : weeklyGridData && userSettings.dailyGoals ? (
          <WeeklyGrid
            days={weeklyGridData.days}
            todayIndex={weeklyGridData.todayIndex}
            dayLabels={weeklyGridData.dayLabels}
            dailyGoals={userSettings.dailyGoals}
          />
        ) : (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>No weekly data</Text>
          </Card>
        )}

        {/* Weekly Totals */}
        {loading ? (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading weekly totals...</Text>
          </Card>
        ) : weeklySummary && userSettings.weeklyGoals && userSettings.dailyGoals ? (
          <WeeklyTotals
            summary={weeklySummary}
            weeklyGoals={userSettings.weeklyGoals}
            dailyGoals={userSettings.dailyGoals}
          />
        ) : (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>No weekly goals configured</Text>
          </Card>
        )}

        {/* Weekly Shortfalls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Muscle Groups Needing Attention</Text>
          {shortfalls.length === 0 ? (
            <Card style={styles.onTrackCard}>
              <Text style={styles.onTrackEmoji}>💪</Text>
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
                  <Text style={styles.restDayEmoji}>😴</Text>
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
      <View style={styles.buttonContainer}>
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
    paddingBottom: 100,
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
  restDayEmoji: {
    fontSize: 32,
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
  // Shortfall styles
  onTrackCard: {
    alignItems: 'center',
  },
  onTrackEmoji: {
    fontSize: 32,
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
