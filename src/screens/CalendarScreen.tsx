import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
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
  parseISO,
} from 'date-fns';
import { consumeCalendarFocus } from '../services/calendarFocus';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { useWorkoutBarPadding } from '../components/workout';
import { useWorkout } from '../contexts/WorkoutContext';
import { CalendarView, GoalStatusMap } from '../components/calendar';
import { useData } from '../contexts/DataContext';
import {
  getWorkouts,
  getSupplements,
  getSupplementIntakes,
  getPTRoutines,
  getPTCompletions,
  getUserSettings,
} from '../services/storage';
import { batchFetchHealthData, getHealthKitWorkoutsForDate } from '../services/healthKitCache';
import { HealthKitWorkout } from '../services/healthKit';
import { checkCalorieGoalMet } from '../services/streaks';
import { Workout, DEFAULT_DAILY_GOALS } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function CalendarScreen({ embedded }: { embedded?: boolean }) {
  const navigation = useNavigation<NavigationProp>();
  const { workouts, templates, userSettings, refreshWorkouts } = useData();
  const workoutBarPadding = useWorkoutBarPadding();
  const { activeWorkout } = useWorkout();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [goalStatusMap, setGoalStatusMap] = useState<GoalStatusMap>({});
  const [incompleteDates, setIncompleteDates] = useState<Set<string>>(new Set());
  const [yogaDates, setYogaDates] = useState<Set<string>>(new Set());
  const [cardioDates, setCardioDates] = useState<Set<string>>(new Set());
  const [travelDates, setTravelDates] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [healthKitWorkouts, setHealthKitWorkouts] = useState<HealthKitWorkout[]>([]);

  // Load HealthKit workouts when a date is selected
  useEffect(() => {
    if (!selectedDate || Platform.OS !== 'ios') {
      setHealthKitWorkouts([]);
      return;
    }
    let cancelled = false;
    getHealthKitWorkoutsForDate(selectedDate).then(workouts => {
      if (!cancelled) {
        // Filter out strength training (already shown from local workouts)
        const cardioYoga = workouts.filter(w =>
          w.activityName !== 'TraditionalStrengthTraining' &&
          w.activityName !== 'FunctionalStrengthTraining'
        );
        setHealthKitWorkouts(cardioYoga);
      }
    });
    return () => { cancelled = true; };
  }, [selectedDate]);

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
      const [freshWorkouts, freshSupplements, freshIntakes, freshSettings, freshPTRoutines, freshPTCompletions] = await Promise.all([
        getWorkouts(),
        getSupplements(),
        getSupplementIntakes(),
        getUserSettings(),
        getPTRoutines(),
        getPTCompletions(),
      ]);

      const activeSupps = freshSupplements.filter(s => s.isActive);
      const activePT = freshPTRoutines.filter(r => r.isActive);
      const dailyGoals = freshSettings.dailyGoals || DEFAULT_DAILY_GOALS;

      // Batch fetch HealthKit data for all dates (parallel, chunked, with timeouts)
      const healthData = await batchFetchHealthData(datesToProcess);

      // Build status map synchronously (no async calls in loop)
      const statusMap: GoalStatusMap = {};
      const yogaSet = new Set<string>();
      const cardioSet = new Set<string>();

      // Each entry contributes ONE category to the day's score, but only when the
      // user has that category enabled. Disabled categories are dropped from both
      // numerator and denominator so the day's ratio renormalizes (turning a
      // category off scales the others up instead of leaving a hole).
      const calorieGoal = freshSettings.calorieGoal || 0;
      const trackTraining = dailyGoals.trackTraining !== false;
      const trackSupps = activeSupps.length > 0;
      const trackPT = !!dailyGoals.trackPT && activePT.length > 0;
      const trackSleep = dailyGoals.sleepHours > 0;
      const trackProtein = dailyGoals.proteinGrams > 0;
      const trackCalories = calorieGoal > 0;

      for (const day of datesToProcess) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const health = healthData.get(dateStr) || { sleepHours: 0, proteinGrams: 0, calories: 0, yogaMinutes: 0, cardioMinutes: 0 };

        let met = 0;
        let total = 0;

        if (trackSleep) {
          total += 1;
          if (health.sleepHours >= dailyGoals.sleepHours) met += 1;
        }

        if (trackProtein) {
          total += 1;
          if (health.proteinGrams >= dailyGoals.proteinGrams) met += 1;
        }

        if (trackCalories) {
          total += 1;
          if (checkCalorieGoalMet(
            health.calories,
            calorieGoal,
            freshSettings.nutritionMode,
            freshSettings.calorieTolerancePercent || 10,
          )) met += 1;
        }

        if (trackSupps) {
          total += 1;
          const dayIntakes = freshIntakes.filter(i => i.date === dateStr);
          const allSupplementsTaken = activeSupps.every(s =>
            dayIntakes.some(i => i.supplementId === s.id),
          );
          if (allSupplementsTaken) met += 1;
        }

        if (trackTraining) {
          total += 1;
          const hasWorkout = freshWorkouts.some(w => {
            if (!w.completedAt) return false;
            return format(new Date(w.completedAt), 'yyyy-MM-dd') === dateStr;
          });
          if (hasWorkout) met += 1;
        }

        if (trackPT) {
          total += 1;
          const dayPTCompletions = freshPTCompletions.filter(c => c.date === dateStr);
          const allPTDone = activePT.every(r =>
            dayPTCompletions.some(c => c.ptRoutineId === r.id),
          );
          if (allPTDone) met += 1;
        }

        statusMap[dateStr] = { met, total };

        // Track yoga/cardio session days
        if (health.yogaMinutes > 0) yogaSet.add(dateStr);
        if (health.cardioMinutes > 0) cardioSet.add(dateStr);
      }

      setGoalStatusMap(statusMap);
      setYogaDates(yogaSet);
      setCardioDates(cardioSet);

      // Travel/Other workout days (✈️ marker on the calendar)
      const travelSet = new Set<string>(
        freshWorkouts
          .filter(w => w.completedAt && w.locationId === 'travel')
          .map(w => format(new Date(w.startedAt), 'yyyy-MM-dd'))
      );
      setTravelDates(travelSet);

      // Compute incomplete workout dates
      const incompleteDateSet = new Set(
        freshWorkouts
          .filter(w => !w.completedAt)
          .map(w => format(new Date(w.startedAt), 'yyyy-MM-dd'))
      );
      setIncompleteDates(incompleteDateSet);
    } catch (error) {
      console.error('[CalendarScreen] Error loading goal status:', error);
    }
  }, [currentMonth]);

  // Load on focus - only depends on currentMonth which is stable
  useFocusEffect(
    useCallback(() => {
      refreshWorkouts();
      loadGoalStatus();
      // Another screen (e.g. Home's weekly grade grid) may have asked us to
      // open a specific day's detail.
      const pending = consumeCalendarFocus();
      if (pending) {
        const date = parseISO(pending);
        setCurrentMonth(date);
        setSelectedDate(date);
      }
    }, [refreshWorkouts, loadGoalStatus])
  );

  // Auto-scroll to the day-detail section when a day is selected — previously
  // the section rendered below the fold and tapping a day looked like a no-op.
  const scrollRef = useRef<ScrollView>(null);
  const detailYRef = useRef(0);
  useEffect(() => {
    if (!selectedDate) return;
    // Give the section a frame to lay out before scrolling
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, detailYRef.current - 12), animated: true });
    }, 120);
    return () => clearTimeout(t);
  }, [selectedDate]);

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
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return workouts.filter(w => {
      if (w.completedAt) {
        return isSameDay(new Date(w.completedAt), selectedDate);
      }
      // Include incomplete workouts by startedAt date
      return format(new Date(w.startedAt), 'yyyy-MM-dd') === dateStr;
    });
  }, [workouts, selectedDate]);

  const getTemplateName = (workout: Workout): string => {
    if (!workout.templateId) return 'Custom Workout';
    const template = templates.find(t => t.id === workout.templateId);
    return template?.name || 'Custom Workout';
  };

  const formatHKDuration = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  };

  const formatHKDistance = (miles: number): string => {
    if (userSettings.units === 'metric') {
      return `${(miles * 1.60934).toFixed(1)} km`;
    }
    return `${miles.toFixed(1)} mi`;
  };

  const getActivityDisplayName = (name: string): string => {
    const map: Record<string, string> = {
      'Running': 'Outdoor Run',
      'Cycling': 'Cycling',
      'Walking': 'Walk',
      'Hiking': 'Hike',
      'Swimming': 'Swim',
      'Yoga': 'Yoga',
      'Elliptical': 'Elliptical',
      'Rowing': 'Rowing',
      'StairClimbing': 'Stair Climbing',
      'Dance': 'Dance',
      'HighIntensityIntervalTraining': 'HIIT',
      'CrossTraining': 'Cross Training',
      'JumpRope': 'Jump Rope',
      'Kickboxing': 'Kickboxing',
      'StepTraining': 'Step Training',
    };
    return map[name] || name;
  };

  const hasAnyWorkouts = selectedDateWorkouts.length > 0 || healthKitWorkouts.length > 0;

  const content = (
    <ScrollView
      ref={scrollRef}
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
          incompleteDates={incompleteDates}
          yogaDates={userSettings.trackYoga ? yogaDates : undefined}
          cardioDates={userSettings.trackCardio ? cardioDates : undefined}
          travelDates={travelDates}
        />

        {/* Selected Date Workouts */}
        {selectedDate && (
          <View
            style={styles.section}
            onLayout={(e) => { detailYRef.current = e.nativeEvent.layout.y; }}
          >
            <Text style={styles.sectionTitle}>
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </Text>
            {!hasAnyWorkouts ? (
              <Card>
                <Text style={styles.emptyText}>No workouts on this day</Text>
              </Card>
            ) : (
              <Card padding="none">
                {/* Strength workouts (local) */}
                {selectedDateWorkouts.map((workout, index) => (
                  <TouchableOpacity
                    key={workout.id}
                    style={[
                      styles.workoutItem,
                      index === 0 && styles.workoutItemFirst,
                      index === selectedDateWorkouts.length - 1 && healthKitWorkouts.length === 0 && styles.workoutItemLast,
                      (index < selectedDateWorkouts.length - 1 || healthKitWorkouts.length > 0) && styles.workoutItemBorder,
                    ]}
                    onPress={() => handleWorkoutPress(workout.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.workoutInfo}>
                      <View style={styles.workoutTitleRow}>
                        <Text style={styles.workoutTitle}>
                          {getTemplateName(workout)}
                        </Text>
                        {!workout.completedAt && (
                          <View style={styles.interruptedBadge}>
                            <Text style={styles.interruptedBadgeText}>
                              {activeWorkout?.workout.id === workout.id ? 'In Progress' : 'Incomplete'}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.workoutTime}>
                        {format(new Date(workout.startedAt), 'h:mm a')}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))}

                {/* HealthKit cardio/yoga workouts */}
                {healthKitWorkouts.map((hkWorkout, index) => {
                  const isLast = index === healthKitWorkouts.length - 1;
                  const details: string[] = [];
                  if (hkWorkout.calories > 0) details.push(`${Math.round(hkWorkout.calories)} cal`);
                  if (hkWorkout.distance > 0) details.push(formatHKDistance(hkWorkout.distance));

                  return (
                    <View
                      key={hkWorkout.id}
                      style={[
                        styles.workoutItem,
                        selectedDateWorkouts.length === 0 && index === 0 && styles.workoutItemFirst,
                        isLast && styles.workoutItemLast,
                        !isLast && styles.workoutItemBorder,
                      ]}
                    >
                      <View style={styles.hkWorkoutIcon}>
                        <Text style={styles.hkWorkoutEmoji}>
                          {hkWorkout.activityName === 'Yoga' ? '🧘' : '🏃'}
                        </Text>
                      </View>
                      <View style={styles.workoutInfo}>
                        <View style={styles.workoutTitleRow}>
                          <Text style={styles.workoutTitle}>
                            {getActivityDisplayName(hkWorkout.activityName)}
                          </Text>
                          <Text style={styles.hkDuration}>
                            {formatHKDuration(hkWorkout.duration)}
                          </Text>
                        </View>
                        <Text style={styles.workoutTime}>
                          {details.length > 0 ? details.join(' · ') : ''}
                          {details.length > 0 && hkWorkout.sourceName ? '  ·  ' : ''}
                          {hkWorkout.sourceName || ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
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
                  {Object.values(goalStatusMap).filter(g => g.total > 0 && g.met === g.total).length}
                </Text>
                <Text style={styles.statLabel}>Perfect Days</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {Object.values(goalStatusMap).filter(g => g.total > 0 && g.met / g.total >= 0.6).length}
                </Text>
                <Text style={styles.statLabel}>Strong Days</Text>
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
  );

  if (embedded) return content;

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      {content}
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
  workoutTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  workoutTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text,
    lineHeight: typography.size.base * 1.4,
  },
  interruptedBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  interruptedBadgeText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: '#000',
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
  hkWorkoutIcon: {
    width: 28,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  hkWorkoutEmoji: {
    fontSize: 18,
  },
  hkDuration: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondary,
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
