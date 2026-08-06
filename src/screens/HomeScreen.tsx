import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, startOfWeek, endOfWeek, subWeeks, getISOWeek, getYear } from 'date-fns';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card, ProgressBar } from '../components/common';
import { TodayRings, StreakCounters, WeeklyGrid, WeeklyTotals } from '../components/goals';
import { SupplementCheckbox } from '../components/supplements';
import { useWorkoutBarPadding } from '../components/workout';
import { WeeklySummaryModal } from '../components/WeeklySummaryModal';
import { MissingSleepPrompt } from '../components/goals/MissingSleepPrompt';
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
  getSets,
  getSupplements,
  getSupplementIntakes,
  getPTRoutines,
  getPTCompletions,
  getUserSettings,
  getRoutines,
  getTemplates,
  getExercises,
  getLastAppOpened,
  setLastAppOpened,
  getWeeklySummaryDismissed,
  setWeeklySummaryDismissed,
  getManualSleepEntry,
  saveManualSleepEntry,
  getSleepFallbackDismissed,
  setSleepFallbackDismissed,
} from '../services/storage';
import { getSleepData as getCachedSleepData, clearCacheForDate, getSleepAverage } from '../services/healthKitCache';
import { DAY_NAMES, DEFAULT_DAILY_GOALS, DEFAULT_WEEKLY_GOALS, Challenge, Partnership, CHALLENGE_TYPE_NAMES, Supplement } from '../types';
import { RootStackParamList } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { getActivePartnership, getPartnerId, getPartnerStats } from '../services/partnershipService';
import { getActiveChallenge, getDaysRemaining } from '../services/challengeService';
import { getTopSuggestions, CoachSuggestion, dismissSuggestion } from '../services/coachSuggestions';
import { getCachedInsights, insightToCoachSuggestion } from '../services/insights';
import { CoachSuggestionsCard } from '../components/coach';
import { syncManager } from '../services/syncService';
import { todaysModality, markRecoveryComplete } from '../services/modalityActions';
import { requestCalendarFocus } from '../services/calendarFocus';
import { getWorkouts as getWorkoutsFromStorage } from '../services/storage';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    userSettings,
    refreshWorkouts,
    supplements,
    supplementIntakes,
    toggleSupplementIntake,
    ptRoutines,
    ptCompletions,
    togglePTCompletion,
    templates,
    exercises,
    getActiveRoutine,
    getExerciseById,
    exerciseSwaps,
    refreshExerciseSwaps,
  } = useData();
  const { isWorkoutActive, recoveredWorkout, dismissRecovery } = useWorkout();
  const workoutBarPadding = useWorkoutBarPadding();

  // Today's date for supplements
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const activeSupplements = useMemo(
    () => supplements.filter(s => s.isActive),
    [supplements]
  );
  const activePTRoutines = useMemo(
    () => ptRoutines.filter(r => r.isActive),
    [ptRoutines]
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
  const [coachSuggestions, setCoachSuggestions] = useState<CoachSuggestion[]>([]);

  // Challenge widget state
  const { user } = useAuth();
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [partnership, setPartnership] = useState<Partnership | null>(null);
  const [partnerName, setPartnerName] = useState<string>('Partner');

  // Sync status
  const [syncPending, setSyncPending] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Past-day supplement marker: long-press a supplement to open a date picker for a previous day
  const [supplementDatePickerFor, setSupplementDatePickerFor] = useState<Supplement | null>(null);

  useEffect(() => {
    return syncManager.subscribe(status => {
      setSyncPending(status.pendingCount);
      setIsSyncing(status.isSyncing);
    });
  }, []);

  // Weekly summary modal state
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);
  const [weeklySummaryWeekStart, setWeeklySummaryWeekStart] = useState<Date | null>(null);
  const hasCheckedWeeklySummary = useRef(false);

  // Missing sleep prompt state
  const [showMissingSleep, setShowMissingSleep] = useState(false);
  const [averageSleepHours, setAverageSleepHours] = useState<number | null>(null);
  const hasCheckedMissingSleep = useRef(false);

  // Memoize active routine for render
  const activeRoutine = useMemo(() => getActiveRoutine(), [getActiveRoutine]);

  // Fallbacks for settings that might not have been migrated
  const dailyGoals = userSettings.dailyGoals || DEFAULT_DAILY_GOALS;
  const weeklyGoals = userSettings.weeklyGoals || DEFAULT_WEEKLY_GOALS;

  // Net swaps this week. Storage already collapses chains and removes round-trips at write time,
  // so we just filter the current week and look up display names.
  const weekSwaps = useMemo(() => {
    const weekStartsOn = userSettings?.weekStartDay === 'monday' ? 1 : 0;
    const weekStart = startOfWeek(new Date(), { weekStartsOn });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn });
    return exerciseSwaps
      .filter(s => {
        const t = new Date(s.swappedAt);
        return t >= weekStart && t <= weekEnd;
      })
      .sort((a, b) => b.swappedAt.localeCompare(a.swappedAt))
      .map(s => ({
        id: s.id,
        swappedAt: s.swappedAt,
        originalName: getExerciseById(s.originalExerciseId)?.name ?? 'Unknown',
        currentName: getExerciseById(s.currentExerciseId)?.name ?? 'Unknown',
      }));
  }, [exerciseSwaps, userSettings?.weekStartDay, getExerciseById]);

  // Check if we should show weekly summary (once per app session)
  useEffect(() => {
    if (hasCheckedWeeklySummary.current) return;
    hasCheckedWeeklySummary.current = true;

    const checkWeeklySummary = async () => {
      try {
        const today = new Date();
        const todayStr = format(today, 'yyyy-MM-dd');
        const weekStartDay = userSettings?.weekStartDay || 'sunday';
        const weekStartsOn = weekStartDay === 'monday' ? 1 : 0;

        // Get the start of last week (the week we want to summarize)
        const thisWeekStart = startOfWeek(today, { weekStartsOn });
        const lastWeekStart = subWeeks(thisWeekStart, 1);

        // Create a unique identifier for last week (YYYY-WW format)
        const lastWeekId = `${getYear(lastWeekStart)}-${String(getISOWeek(lastWeekStart)).padStart(2, '0')}`;

        // Check if user already dismissed this week's summary
        const dismissedWeek = await getWeeklySummaryDismissed();
        if (dismissedWeek === lastWeekId) {
          return; // Already dismissed
        }

        // Check if this is the first day of the new week (or within first 2 days)
        const daysSinceWeekStart = Math.floor(
          (today.getTime() - thisWeekStart.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceWeekStart > 1) {
          return; // Only show on first 2 days of the week
        }

        // Show the weekly summary for last week
        setWeeklySummaryWeekStart(lastWeekStart);
        setShowWeeklySummary(true);

        // Update last app opened
        await setLastAppOpened(todayStr);
      } catch (error) {
        console.error('[HomeScreen] Error checking weekly summary:', error);
      }
    };

    checkWeeklySummary();
  }, [userSettings?.weekStartDay]);

  const handleDismissWeeklySummary = useCallback(async () => {
    setShowWeeklySummary(false);
    if (weeklySummaryWeekStart) {
      const weekId = `${getYear(weeklySummaryWeekStart)}-${String(getISOWeek(weeklySummaryWeekStart)).padStart(2, '0')}`;
      await setWeeklySummaryDismissed(weekId);
    }
  }, [weeklySummaryWeekStart]);

  // Check for missing sleep data (once per session, morning only)
  useEffect(() => {
    if (hasCheckedMissingSleep.current) return;
    hasCheckedMissingSleep.current = true;

    const checkMissingSleep = async () => {
      try {
        const now = new Date();
        // Only check before noon
        if (now.getHours() >= 12) return;

        const settings = await getUserSettings();
        // Setting must be enabled
        if (settings.sleepFallbackReminderEnabled === false) return;

        // Already dismissed today?
        const todayDate = format(now, 'yyyy-MM-dd');
        const dismissed = await getSleepFallbackDismissed();
        if (dismissed === todayDate) return;

        // Check if sleep data already exists (HealthKit or prior manual entry)
        const existingSleep = await getCachedSleepData(now);
        if (existingSleep) return;

        // No data — compute average for "Use my average" option
        const avg = await getSleepAverage(30);
        setAverageSleepHours(avg);

        // Auto-average mode: silently fill in and skip prompt
        if (settings.sleepFallbackAutoAverage && avg !== null) {
          await saveManualSleepEntry({
            date: todayDate,
            totalHours: avg,
            isManual: false,
            isEstimate: true,
            createdAt: new Date().toISOString(),
          });
          await clearCacheForDate(now);
          return;
        }

        // Show the prompt
        setShowMissingSleep(true);
      } catch (error) {
        console.error('[HomeScreen] Error checking missing sleep:', error);
      }
    };

    checkMissingSleep();
  }, []);

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
        freshSets,
        freshSupplements,
        freshIntakes,
        freshSettings,
        freshRoutines,
        freshTemplates,
        freshExercises,
        freshPTRoutines,
        freshPTCompletions,
      ] = await Promise.all([
        getWorkouts(),
        getSets(),
        getSupplements(),
        getSupplementIntakes(),
        getUserSettings(),
        getRoutines(),
        getTemplates(),
        getExercises(),
        getPTRoutines(),
        getPTCompletions(),
      ]);

      const activeSupps = freshSupplements.filter(s => s.isActive);
      const activePT = freshPTRoutines.filter(r => r.isActive);
      const currentRoutine = freshRoutines.find(r => r.isActive);

      // Phase 2: Calculate shortfalls (no HealthKit, fast)
      let shortfallData: MuscleGroupShortfall[] = [];

      try {
        const result = await calculateWeeklyShortfalls(
          currentRoutine, freshTemplates, freshExercises, freshSettings
        );
        if (result) {
          shortfallData = result;
          setShortfalls(result);
        }
      } catch (e) {
        console.error('[HomeScreen] Shortfalls error:', e);
      }

      // Phase 2.5: Generate coach suggestions
      if (freshSettings.coachSuggestionsEnabled !== false) {
        try {
          const suggestions = await getTopSuggestions({
            workouts: freshWorkouts,
            sets: freshSets,
            exercises: freshExercises,
            templates: freshTemplates,
            routine: currentRoutine,
            settings: freshSettings,
            shortfalls: shortfallData,
          }, 2);

          // Merge top insight into coach suggestions (max 3 total)
          try {
            const insightsResult = await getCachedInsights({
              exercises: freshExercises,
              sets: freshSets,
              workouts: freshWorkouts,
              bodyMeasurements: [],
              userSettings: freshSettings,
              bodyWeightLbs: null,
              nutritionHistory: new Map(),
              sleepHistory: new Map(),
            });
            if (insightsResult.length > 0) {
              const topInsight = insightToCoachSuggestion(insightsResult[0]);
              // Only add if not duplicate type
              const hasInsight = suggestions.some(s => s.type === 'insight');
              if (!hasInsight) {
                suggestions.push(topInsight);
              }
            }
          } catch {
            // Insights are optional — don't block coach
          }

          setCoachSuggestions(suggestions.slice(0, 3));
        } catch (e) {
          console.error('[HomeScreen] Coach suggestions error:', e);
        }
      } else {
        setCoachSuggestions([]);
      }

      // Phase 3: Calculate HealthKit-dependent data (all in parallel)
      const [status, streakCounts, gridData, summary] = await Promise.all([
        getTodayGoalStatus(freshSettings, freshWorkouts, freshIntakes, activeSupps, freshPTCompletions, activePT)
          .catch(e => { console.error('[HomeScreen] Today status error:', e); return null; }),
        calculateStreaks(freshSettings, freshWorkouts, freshIntakes, activeSupps, currentRoutine, freshPTCompletions, activePT)
          .catch(e => { console.error('[HomeScreen] Streaks error:', e); return null; }),
        getWeeklyGridData(freshSettings, freshWorkouts, freshIntakes, activeSupps, freshPTCompletions, activePT)
          .catch(e => { console.error('[HomeScreen] Grid error:', e); return null; }),
        getWeeklySummary(freshSettings, freshWorkouts, freshIntakes, activeSupps, freshPTCompletions, activePT, currentRoutine)
          .catch(e => { console.error('[HomeScreen] Summary error:', e); return null; }),
      ]);

      if (status) setTodayStatus(status);
      if (streakCounts) setStreaks(streakCounts);
      if (gridData) setWeeklyGridData(gridData);
      if (summary) setWeeklySummary(summary);

      // Load challenge data (fire-and-forget, don't block main data)
      try {
        const activePartnership = await getActivePartnership();
        if (activePartnership) {
          setPartnership(activePartnership);
          const challenge = await getActiveChallenge(activePartnership.id);
          if (challenge && (challenge.status === 'active' || challenge.status === 'pending')) {
            setActiveChallenge(challenge);
            const partnerId = getPartnerId(activePartnership, user?.id || '');
            const stats = await getPartnerStats(partnerId);
            setPartnerName(stats?.displayName || 'Partner');
          } else {
            setActiveChallenge(null);
          }
        } else {
          setPartnership(null);
          setActiveChallenge(null);
        }
      } catch (e) {
        console.log('[HomeScreen] Challenge load error:', e);
      }
    } catch (error) {
      console.error('[HomeScreen] Failed to load:', error);
    }
  }, [user?.id]);

  const handleSaveMissingSleep = useCallback(async (hours: number, isEstimate: boolean) => {
    const todayDate = format(new Date(), 'yyyy-MM-dd');
    await saveManualSleepEntry({
      date: todayDate,
      totalHours: hours,
      isManual: !isEstimate,
      isEstimate,
      createdAt: new Date().toISOString(),
    });
    await clearCacheForDate(new Date());
    await setSleepFallbackDismissed(todayDate);
    setShowMissingSleep(false);
    loadData();
  }, [loadData]);

  const handleDismissMissingSleep = useCallback(async () => {
    const todayDate = format(new Date(), 'yyyy-MM-dd');
    await setSleepFallbackDismissed(todayDate);
    setShowMissingSleep(false);
  }, []);

  // Load data on screen focus - stable deps, no re-render loop
  useFocusEffect(
    useCallback(() => {
      refreshWorkouts();
      // Pull fresh swap rows so changes made inside the active workout appear immediately
      // when the user comes back to Home (WorkoutContext writes to storage but doesn't
      // touch DataContext state directly).
      refreshExerciseSwaps();
      loadData();
    }, [refreshWorkouts, refreshExerciseSwaps, loadData])
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
  const todayDaySchedule = activeRoutine?.daySchedule.find(d => d.day === todayDayOfWeek);
  const todayPlannedTemplateIds = todayDaySchedule?.templateIds || [];
  const todayPlannedTemplates = todayPlannedTemplateIds
    .map(id => templates.find(t => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);
  const todayModalityInfo = todaysModality(activeRoutine, templates, todayDayOfWeek);
  const todayModality = todayModalityInfo?.modality;

  const handleStartWorkout = () => {
    if (isWorkoutActive) {
      navigation.navigate('MainTabs', { screen: 'Train' });
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
          <View>
            <Text style={styles.title}>Workout Tracker</Text>
            <Text style={styles.dateText}>
              Week of {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d')}
            </Text>
          </View>
          {syncPending > 0 && (
            <TouchableOpacity
              style={styles.syncIndicator}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Profile' })}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isSyncing ? 'cloud-upload' : 'cloud-offline'}
                size={18}
                color={isSyncing ? colors.primary : colors.warning}
              />
              <Text style={[styles.syncIndicatorText, isSyncing && styles.syncIndicatorTextActive]}>
                {syncPending}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Recovery Banner for interrupted workouts */}
        {recoveredWorkout && (
          <Card style={styles.recoveryCard}>
            <View style={styles.recoveryHeader}>
              <Ionicons name="warning" size={22} color={colors.warning} />
              <Text style={styles.recoveryTitle}>Interrupted Workout Found</Text>
            </View>
            <Text style={styles.recoveryText}>
              You had an active workout when the app closed.
            </Text>
            <View style={styles.recoveryButtons}>
              <TouchableOpacity
                style={styles.recoveryResumeButton}
                onPress={() => {
                  dismissRecovery();
                  navigation.navigate('MainTabs', { screen: 'Train' });
                }}
              >
                <Text style={styles.recoveryResumeText}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.recoveryDismissButton}
                onPress={dismissRecovery}
              >
                <Text style={styles.recoveryDismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* Deload Week Banner */}
        {userSettings.isOnDeload && (
          <Card style={styles.deloadCard}>
            <View style={styles.recoveryHeader}>
              <MaterialCommunityIcons name="restart" size={22} color={colors.primary} />
              <Text style={styles.deloadTitle}>Deload Week Active</Text>
            </View>
            <Text style={styles.recoveryText}>
              Weights reduced to {userSettings.deloadPercentage ?? 50}%. Fatigue tracking paused.
            </Text>
          </Card>
        )}

        {/* Today's Rings - shows when data arrives */}
        {todayStatus ? (
          <TodayRings
            status={todayStatus}
            dailyGoals={dailyGoals}
            calorieTolerancePercent={userSettings.calorieTolerancePercent || 10}
            userSettings={userSettings}
            weeklySummary={weeklySummary}
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
            calorieGoal={userSettings.calorieGoal}
            userSettings={userSettings}
            hasActiveSupplements={activeSupplements.length > 0}
          />
        ) : (
          <Card style={styles.loadingCard}>
            <Text style={styles.loadingText}>Loading streaks...</Text>
          </Card>
        )}

        {/* Active Challenge Widget */}
        {activeChallenge && activeChallenge.status === 'active' && partnership && (
          <TouchableOpacity
            onPress={() => navigation.navigate('Challenge', { partnershipId: partnership.id })}
            activeOpacity={0.7}
          >
            <Card style={styles.challengeWidget}>
              <View style={styles.challengeWidgetHeader}>
                <MaterialCommunityIcons name="trophy" size={20} color={colors.primary} />
                <Text style={styles.challengeWidgetTitle}>
                  {CHALLENGE_TYPE_NAMES[activeChallenge.type]}
                </Text>
                <View style={styles.challengeDaysLeft}>
                  <Text style={styles.challengeDaysNumber}>{getDaysRemaining(activeChallenge)}</Text>
                  <Text style={styles.challengeDaysLabel}>days</Text>
                </View>
              </View>
              <View style={styles.challengeWidgetScores}>
                <View style={styles.challengeWidgetScore}>
                  <Text style={styles.challengeWidgetScoreLabel}>You</Text>
                  <Text style={styles.challengeWidgetScoreValue}>
                    {partnership.userId1 === user?.id
                      ? activeChallenge.user1Score
                      : activeChallenge.user2Score}
                  </Text>
                </View>
                <Text style={styles.challengeWidgetVs}>vs</Text>
                <View style={styles.challengeWidgetScore}>
                  <Text style={styles.challengeWidgetScoreLabel}>{partnerName}</Text>
                  <Text style={styles.challengeWidgetScoreValue}>
                    {partnership.userId1 === user?.id
                      ? activeChallenge.user2Score
                      : activeChallenge.user1Score}
                  </Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* Weekly Grid - shows when data arrives */}
        {weeklyGridData ? (
          <WeeklyGrid
            days={weeklyGridData.days}
            todayIndex={weeklyGridData.todayIndex}
            dayLabels={weeklyGridData.dayLabels}
            dailyGoals={dailyGoals}
            hasActiveSupplements={activeSupplements.length > 0}
            onDayPress={(dateStr) => {
              // Open that day's detail in the Progress-tab calendar
              requestCalendarFocus(dateStr);
              navigation.navigate('MainTabs', { screen: 'Progress' });
            }}
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
            userSettings={userSettings}
            hasActiveSupplements={activeSupplements.length > 0}
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
                // "planned" = what the user expects to do this week (already done + scheduled).
                // "target" = the user's actual weekly goal. The bar visualizes both: gold for
                // completed, lighter gold for scheduled-but-not-done, and the bar's gray
                // background fills in the gap to target.
                const planned = item.currentSets + item.projectedSets;
                const targetHit = item.currentSets >= item.targetSets;
                const routineDone = !targetHit && item.projectedSets === 0;
                const barMax = Math.max(item.targetSets, item.currentSets);
                const completedPct = barMax > 0 ? (item.currentSets / barMax) * 100 : 0;
                const pendingPct = barMax > 0 ? (item.projectedSets / barMax) * 100 : 0;

                let statsText: string;
                if (targetHit) {
                  statsText = `${item.currentSets}/${item.targetSets} sets ✓`;
                } else if (routineDone) {
                  statsText = `${item.currentSets}/${item.currentSets} ✓ (+${item.shortfall} to target)`;
                } else {
                  statsText = `${item.currentSets}/${planned} sets`;
                }

                const completedColor = targetHit ? colors.success : colors.primary;

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
                        <Text style={styles.shortfallStats}>{statsText}</Text>
                      </View>
                      <View style={styles.volumeBarTrack}>
                        {completedPct > 0 && (
                          <View
                            style={[
                              styles.volumeBarSegment,
                              { width: `${completedPct}%`, backgroundColor: completedColor },
                            ]}
                          />
                        )}
                        {pendingPct > 0 && (
                          <View
                            style={[
                              styles.volumeBarSegment,
                              { width: `${pendingPct}%`, backgroundColor: colors.primaryMuted },
                            ]}
                          />
                        )}
                      </View>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </Card>
          )}
        </View>

        {/* This Week's Swaps */}
        {weekSwaps.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>This Week's Swaps</Text>
            <Card padding="none">
              {weekSwaps.map((swap, index) => (
                <View
                  key={swap.id}
                  style={[
                    styles.swapRow,
                    index === 0 && styles.swapRowFirst,
                    index === weekSwaps.length - 1 && styles.swapRowLast,
                    index < weekSwaps.length - 1 && styles.swapRowBorder,
                  ]}
                >
                  <Ionicons
                    name="swap-horizontal-outline"
                    size={20}
                    color={colors.primary}
                    style={styles.swapIcon}
                  />
                  <View style={styles.swapInfo}>
                    <Text style={styles.swapText}>
                      {swap.originalName}{' '}
                      <Text style={styles.swapArrow}>→</Text>{' '}
                      {swap.currentName}
                    </Text>
                    <Text style={styles.swapDate}>
                      {format(new Date(swap.swappedAt), 'yyyy-MM-dd')}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* Coach Suggestions */}
        {coachSuggestions.length > 0 && (
          <CoachSuggestionsCard
            suggestions={coachSuggestions}
            onDismiss={async (id) => {
              await dismissSuggestion(id, 24);
              setCoachSuggestions(prev => prev.filter(s => s.id !== id));
            }}
            onMuscleGroupPress={handleMuscleGroupPress}
          />
        )}

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
              ) : todayModality === 'aerobic' ? (
                <TouchableOpacity
                  style={styles.modalityTile}
                  onPress={() => {
                    navigation.navigate('AerobicSession', {
                      targetDurationMin: todayDaySchedule?.targetDurationMin,
                      targetIntensityRPE: todayDaySchedule?.targetIntensityRPE,
                      targetHRPctMax: todayDaySchedule?.targetHRPctMax,
                      notes: todayDaySchedule?.notes,
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="bicycle-outline" size={32} color={colors.primary} style={styles.modalityIcon} />
                  <Text style={styles.modalityTileTitle}>Start Aerobic Session</Text>
                  {todayDaySchedule?.targetDurationMin || todayDaySchedule?.targetIntensityRPE ? (
                    <Text style={styles.modalityTileSub}>
                      Target:{' '}
                      {[
                        todayDaySchedule?.targetDurationMin ? `${todayDaySchedule.targetDurationMin} min` : null,
                        todayDaySchedule?.targetIntensityRPE ? `RPE ${todayDaySchedule.targetIntensityRPE}` : null,
                        todayDaySchedule?.targetHRPctMax ? `${todayDaySchedule.targetHRPctMax}% HRmax` : null,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ) : todayModality === 'recovery' ? (
                <TouchableOpacity
                  style={styles.modalityTile}
                  onPress={async () => {
                    try {
                      const all = await getWorkoutsFromStorage();
                      await markRecoveryComplete(all);
                      await refreshWorkouts();
                    } catch (e) {
                      Alert.alert('Error', 'Could not mark recovery complete.');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="leaf-outline" size={32} color={colors.primary} style={styles.modalityIcon} />
                  <Text style={styles.modalityTileTitle}>Mark Recovery Complete</Text>
                  <Text style={styles.modalityTileSub}>
                    {todayDaySchedule?.notes ?? 'Rest or gentle movement today.'}
                  </Text>
                </TouchableOpacity>
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
                    onLongPress={() => setSupplementDatePickerFor(supplement)}
                    isFirst={index === 0}
                    isLast={index === activeSupplements.length - 1}
                  />
                );
              })}
            </Card>
          </View>
        )}

        {/* Today's Physical Therapy */}
        {activePTRoutines.length > 0 && userSettings.dailyGoals?.trackPT && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Physical Therapy</Text>
            <Card padding="none">
              {activePTRoutines.map((routine, index) => {
                const isDone = ptCompletions.some(
                  c => c.ptRoutineId === routine.id && c.date === todayStr
                );
                return (
                  <SupplementCheckbox
                    key={routine.id}
                    supplement={{ ...routine, sortOrder: routine.sortOrder, isActive: routine.isActive }}
                    isTaken={isDone}
                    onToggle={() => togglePTCompletion(routine.id, todayStr)}
                    isFirst={index === 0}
                    isLast={index === activePTRoutines.length - 1}
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

      {/* Weekly Summary Modal */}
      {weeklySummaryWeekStart && (
        <WeeklySummaryModal
          visible={showWeeklySummary}
          onDismiss={handleDismissWeeklySummary}
          weekStart={weeklySummaryWeekStart}
        />
      )}

      {/* Missing Sleep Prompt */}
      <MissingSleepPrompt
        visible={showMissingSleep}
        onDismiss={handleDismissMissingSleep}
        onSave={handleSaveMissingSleep}
        averageSleepHours={averageSleepHours}
      />

      {/* Past-day supplement marker */}
      <PastDateSupplementPicker
        supplement={supplementDatePickerFor}
        supplementIntakes={supplementIntakes}
        onClose={() => setSupplementDatePickerFor(null)}
        onConfirm={async (dateStr) => {
          if (supplementDatePickerFor) {
            await toggleSupplementIntake(supplementDatePickerFor.id, dateStr);
          }
          setSupplementDatePickerFor(null);
        }}
      />
    </SafeAreaView>
  );
}

interface PastDateSupplementPickerProps {
  supplement: Supplement | null;
  supplementIntakes: { supplementId: string; date: string }[];
  onClose: () => void;
  onConfirm: (dateStr: string) => void;
}

function PastDateSupplementPicker({
  supplement,
  supplementIntakes,
  onClose,
  onConfirm,
}: PastDateSupplementPickerProps) {
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }, []);
  const [pickedDate, setPickedDate] = useState(yesterday);

  // Reset to yesterday each time the picker opens for a new supplement
  useEffect(() => {
    if (supplement) setPickedDate(yesterday);
  }, [supplement, yesterday]);

  if (!supplement) return null;

  const handleDone = () => {
    const dateStr = format(pickedDate, 'yyyy-MM-dd');
    const alreadyTaken = supplementIntakes.some(
      i => i.supplementId === supplement.id && i.date === dateStr
    );
    const action = alreadyTaken ? 'unmark' : 'mark';
    const verb = alreadyTaken ? 'remove' : 'mark taken';
    Alert.alert(
      alreadyTaken ? 'Remove?' : 'Mark Taken?',
      `${alreadyTaken ? 'Remove' : 'Mark'} ${supplement.name} ${alreadyTaken ? 'from' : 'for'} ${format(pickedDate, 'EEE, MMM d')}?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: onClose },
        { text: action === 'unmark' ? 'Remove' : 'Mark', onPress: () => onConfirm(dateStr) },
      ]
    );
  };

  return (
    <View style={pastPickerStyles.overlay} pointerEvents="box-none">
      <TouchableOpacity style={pastPickerStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={pastPickerStyles.sheet}>
        <Text style={pastPickerStyles.title}>{supplement.name}</Text>
        <Text style={pastPickerStyles.subtitle}>Pick a past date</Text>
        <DateTimePicker
          value={pickedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          themeVariant="dark"
          onChange={(event, date) => {
            if (Platform.OS === 'android') {
              // Android: native dialog dismisses itself; act on the result here.
              if (event.type === 'set' && date) {
                setPickedDate(date);
                // Defer so the picker UI fully tears down before the Alert shows
                setTimeout(() => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const alreadyTaken = supplementIntakes.some(
                    i => i.supplementId === supplement.id && i.date === dateStr
                  );
                  Alert.alert(
                    alreadyTaken ? 'Remove?' : 'Mark Taken?',
                    `${alreadyTaken ? 'Remove' : 'Mark'} ${supplement.name} ${alreadyTaken ? 'from' : 'for'} ${format(date, 'EEE, MMM d')}?`,
                    [
                      { text: 'Cancel', style: 'cancel', onPress: onClose },
                      { text: alreadyTaken ? 'Remove' : 'Mark', onPress: () => onConfirm(dateStr) },
                    ]
                  );
                }, 0);
              } else {
                onClose();
              }
            } else if (date) {
              setPickedDate(date);
            }
          }}
        />
        {Platform.OS === 'ios' && (
          <View style={pastPickerStyles.buttonRow}>
            <TouchableOpacity style={pastPickerStyles.cancelButton} onPress={onClose}>
              <Text style={pastPickerStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pastPickerStyles.doneButton} onPress={handleDone}>
              <Text style={pastPickerStyles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const pastPickerStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.lg,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
  },
  doneButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  doneText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  syncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  syncIndicatorText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold as any,
    color: colors.warning,
  },
  syncIndicatorTextActive: {
    color: colors.primary,
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
  modalityTile: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  modalityIcon: {
    marginBottom: spacing.sm,
  },
  modalityTileTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  modalityTileSub: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
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
  swapRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  swapRowFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  swapRowLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  swapRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  swapIcon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  swapInfo: {
    flex: 1,
  },
  swapText: {
    fontSize: typography.size.md,
    color: colors.text,
    lineHeight: typography.size.md * 1.35,
  },
  swapArrow: {
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  swapDate: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
  // Segmented bar: gold completed + muted-gold pending sit on a gray background.
  // The unfilled tail of the track is the implicit "gap to target" gray section.
  volumeBarTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.backgroundTertiary,
    marginTop: spacing.xs,
  },
  volumeBarSegment: {
    height: '100%',
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
  // Challenge Widget styles
  challengeWidget: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  challengeWidgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  challengeWidgetTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginLeft: spacing.sm,
    flex: 1,
  },
  challengeDaysLeft: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  challengeDaysNumber: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  challengeDaysLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  challengeWidgetScores: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  challengeWidgetScore: {
    alignItems: 'center',
    flex: 1,
  },
  challengeWidgetScoreLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  challengeWidgetScoreValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  challengeWidgetVs: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    fontWeight: typography.weight.semibold,
    paddingHorizontal: spacing.md,
  },
  // Recovery banner styles
  deloadCard: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  deloadTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  recoveryCard: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  recoveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  recoveryTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.warning,
    marginLeft: spacing.sm,
  },
  recoveryText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  recoveryButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  recoveryResumeButton: {
    flex: 1,
    backgroundColor: colors.warning,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  recoveryResumeText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: '#000',
  },
  recoveryDismissButton: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  recoveryDismissText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.textSecondary,
  },
});

export default HomeScreen;
