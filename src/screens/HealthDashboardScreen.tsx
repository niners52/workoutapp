/**
 * Home: the health dashboard. Three tiers, read top to bottom in a few seconds:
 * today's guardrails, this week's training and body, then the medical layer.
 * Every tile links out to detail instead of expanding in place.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, startOfWeek } from 'date-fns';
import { colors, typography, spacing, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { useWorkoutBarPadding } from '../components/workout';
import { useWorkout } from '../contexts/WorkoutContext';
import {
  BodyWeightTileView,
  CalciumTileView,
  CaloriesTileView,
  CarbsTileView,
  DayVerdictCard,
  DeloadBanner,
  FatTileView,
  LoggingTileView,
  ProteinTileView,
  RemindersCard,
  SleepTileView,
  SodiumTileView,
  WeeklyVolumeCard,
} from '../components/health';
import { useData } from '../contexts/DataContext';
import {
  bodyWeightTile,
  calciumTile,
  caloriesTile,
  carbsTile,
  dayVerdict,
  fatTile,
  loggingTile,
  openReminders,
  proteinTile,
  sleepTile,
  sodiumTile,
  weeklyVolumeView,
  type SleepInput,
} from '../services/healthDashboard';
import { loadNutrition, loadSleep, type NutritionLoad } from '../services/healthDashboardData';
import { getLocalReminders, loadReminders, setReminderDone } from '../services/healthReminders';
import { computeWeeklyVolume } from '../services/analytics';
import {
  dismissMissedExercise,
  getExercises,
  getExerciseSwaps,
  getMissedExerciseDismissals,
  getSets,
  getUserSettings,
  getWorkouts,
} from '../services/storage';
import { getMissedExercisesThisWeek, getTrainingWeekStart, type MissedExercise } from '../services/missedExercises';
import { CatchUpCard } from '../components/goals';
import { InsightsCard } from '../components/insights/InsightsCard';
import { syncNutritionFromHealthKit } from '../services/nutritionSync';
import { syncSleepFromHealthKit } from '../services/sleepSync';
import { importHealthKitBodyWeights } from '../services/bodyWeightImport';
import { requestProgressTab } from '../services/calendarFocus';
import { DEFAULT_HEALTH_TARGETS, type HealthReminder, type MuscleGroupVolume } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** Home re-reads Apple Health at most this often; pull-to-refresh always does. */
const FOCUS_SYNC_INTERVAL_MS = 15 * 60 * 1000;
/** Room kept under the scroll content for the pinned Start Workout button. */
const START_BUTTON_HEIGHT = 80;

export function HealthDashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { userSettings, bodyMeasurements, refreshBodyMeasurements } = useData();
  const { isWorkoutActive, startWorkout } = useWorkout();
  const workoutBarPadding = useWorkoutBarPadding();
  const targets = userSettings.healthTargets ?? DEFAULT_HEALTH_TARGETS;
  const weekStartDay = userSettings.weekStartDay;

  const [now, setNow] = useState(() => new Date());
  const [nutrition, setNutrition] = useState<NutritionLoad | null>(null);
  const [volume, setVolume] = useState<MuscleGroupVolume[] | null>(null);
  const [volumeError, setVolumeError] = useState(false);
  const [missed, setMissed] = useState<MissedExercise[] | null>(null);
  const [sleep, setSleep] = useState<SleepInput | null>(null);
  const [reminders, setReminders] = useState<HealthReminder[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Time-of-day copy (17:00 evening budget, 19:00 logging check) flips while open.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Reads storage rather than DataContext, which the active workout does not
  // update. The set history is large, so it is read once per visit (not again
  // after the Apple Health sync, which never changes sets) and shared by both views.
  const loadTraining = useCallback(async () => {
    try {
      const [sets, workouts, exercises, settings, swaps, dismissals] = await Promise.all([
        getSets(),
        getWorkouts(),
        getExercises(),
        getUserSettings(),
        getExerciseSwaps(),
        getMissedExerciseDismissals(),
      ]);
      // Same counting rules as the Weekly Volume panel.
      setVolume(computeWeeklyVolume(sets, workouts, exercises, settings, new Date()).muscleGroups);
      setVolumeError(false);
      setMissed(getMissedExercisesThisWeek(workouts, sets, swaps, exercises, settings.weekStartDay, dismissals));
    } catch (e) {
      console.error('[HealthDashboard] Training load error:', e);
      setVolumeError(true);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    const at = new Date();
    setNow(at);
    await Promise.all([
      loadNutrition(at).then(setNutrition),
      loadSleep(at).then(setSleep),
      loadReminders()
        .catch(() => getLocalReminders())
        .then(setReminders),
    ]);
  }, []);

  const syncHealthKit = useCallback(
    async (force: boolean) => {
      await Promise.all([
        syncNutritionFromHealthKit(force, new Date(), FOCUS_SYNC_INTERVAL_MS).catch(e => console.log('Nutrition sync failed:', e)),
        syncSleepFromHealthKit(force).catch(e => console.log('Sleep sync failed:', e)),
        importHealthKitBodyWeights({ force })
          .then(r => (r.imported > 0 ? refreshBodyMeasurements() : undefined))
          .catch(e => console.log('Body weight import failed:', e)),
      ]);
    },
    [refreshBodyMeasurements],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadTraining();
      // Show what is already synced, then refresh from Apple Health if it is due.
      loadHealth()
        .then(() => syncHealthKit(false))
        .then(() => (active ? loadHealth() : undefined));
      return () => {
        active = false;
      };
    }, [loadTraining, loadHealth, syncHealthKit]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncHealthKit(true);
    await Promise.all([loadTraining(), loadHealth()]);
    setRefreshing(false);
  }, [syncHealthKit, loadTraining, loadHealth]);

  // Remove a row from the catch-up list for the rest of this training week.
  const handleDismissMissed = useCallback(
    async (exerciseId: string) => {
      setMissed(prev => prev?.filter(m => m.exercise.id !== exerciseId) ?? prev);
      try {
        await dismissMissedExercise(exerciseId, getTrainingWeekStart(weekStartDay));
      } catch (e) {
        console.error('[HealthDashboard] Dismiss missed exercise error:', e);
      }
    },
    [weekStartDay],
  );

  // One tap: an active workout preloaded with everything on the catch-up list.
  const handleStartCatchUp = useCallback(async () => {
    const ids = missed?.map(m => m.exercise.id) ?? [];
    if (ids.length === 0) return;
    try {
      // Returns null if the user chose to keep an in-progress workout.
      const workoutId = await startWorkout(undefined, ids);
      if (workoutId) navigation.navigate('MainTabs', { screen: 'Train' });
    } catch (e) {
      console.error('[HealthDashboard] Start catch-up workout error:', e);
      Alert.alert('Error', 'Could not start the catch-up workout.');
    }
  }, [missed, startWorkout, navigation]);

  const handleStartWorkout = () => {
    if (isWorkoutActive) navigation.navigate('MainTabs', { screen: 'Train' });
    else navigation.navigate('StartWorkout');
  };

  const today = nutrition?.today ?? null;
  const sodium = useMemo(() => sodiumTile(today, targets, now), [today, targets, now]);
  const calcium = useMemo(() => calciumTile(today, nutrition?.latestLogged ?? null, targets), [today, nutrition, targets]);
  const protein = useMemo(() => proteinTile(today, targets), [today, targets]);
  const calories = useMemo(() => caloriesTile(today, targets), [today, targets]);
  const fat = useMemo(() => fatTile(today, targets, now), [today, targets, now]);
  const carbs = useMemo(() => carbsTile(today, targets), [today, targets]);
  const logging = useMemo(() => loggingTile(today, targets, now), [today, targets, now]);
  // The verdict is for the newest day that is finished, never for today.
  const lastComplete = useMemo(() => {
    const todayKey = format(now, 'yyyy-MM-dd');
    return nutrition?.recent.find(r => r.date < todayKey) ?? null;
  }, [nutrition, now]);
  const verdict = useMemo(() => dayVerdict(lastComplete, targets, format(now, 'yyyy-MM-dd')), [lastComplete, targets, now]);
  const volumeView = useMemo(
    () => (volume ? weeklyVolumeView(volume, targets, now, weekStartDay) : null),
    [volume, targets, now, weekStartDay],
  );
  const weight = useMemo(() => bodyWeightTile(bodyMeasurements, targets, now), [bodyMeasurements, targets, now]);
  const sleepState = useMemo(() => (sleep ? sleepTile(sleep, targets) : null), [sleep, targets]);
  const reminderViews = useMemo(() => (reminders ? openReminders(reminders, now) : null), [reminders, now]);

  const openNutrition = (focus?: 'calcium') => navigation.navigate('NutritionToday', focus ? { focus } : undefined);
  const openAnalytics = () => {
    requestProgressTab('analytics');
    navigation.navigate('MainTabs', { screen: 'Progress' });
  };
  const weekStart = format(startOfWeek(now, { weekStartsOn: weekStartDay === 'monday' ? 1 : 0 }), 'yyyy-MM-dd');

  const handleToggleDone = useCallback(async (id: string) => {
    setReminders(prev => prev?.map(r => (r.id === id ? { ...r, doneAt: new Date().toISOString() } : r)) ?? prev);
    await setReminderDone(id, true);
    setReminders(await getLocalReminders());
  }, []);

  const syncedLabel = nutrition?.syncedAt ? `Synced ${format(new Date(nutrition.syncedAt), 'h:mm a')}` : nutrition ? 'Not synced yet' : '';

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + START_BUTTON_HEIGHT + workoutBarPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Today</Text>
            <Text style={styles.date}>{format(now, 'EEEE, MMM d')}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('TrainingOverview')}
              style={styles.headerButton}
              accessibilityLabel="Training and goals"
            >
              <Ionicons name="barbell-outline" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('HealthTargets')}
              style={styles.headerButton}
              accessibilityLabel="Health targets"
            >
              <Ionicons name="options-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tier 1: today's guardrails */}
        <View style={styles.tierHeader}>
          <Text style={styles.tierTitle}>Today</Text>
          <Text style={styles.tierMeta}>{syncedLabel}</Text>
        </View>
        <View style={styles.tileRow}>
          <SodiumTileView state={sodium} onPress={() => openNutrition()} />
          <CalciumTileView state={calcium} onPress={() => openNutrition(calcium.kind === 'notSyncing' ? 'calcium' : undefined)} />
        </View>
        <View style={styles.tileRow}>
          <ProteinTileView state={protein} onPress={() => openNutrition()} />
          <CaloriesTileView state={calories} onPress={() => openNutrition()} />
        </View>
        <View style={styles.tileRow}>
          <FatTileView state={fat} onPress={() => openNutrition()} />
          <CarbsTileView state={carbs} onPress={() => openNutrition()} />
        </View>
        <View style={styles.tileRow}>
          <LoggingTileView state={logging} onPress={() => openNutrition()} />
          <View style={styles.half} />
        </View>
        <DayVerdictCard
          state={verdict}
          label={lastComplete ? `Verdict — ${format(parseISO(lastComplete.date), 'EEE, MMM d')}` : undefined}
          onPress={() => openNutrition()}
        />

        {/* Tier 2: this week */}
        <View style={styles.tierHeader}>
          <Text style={styles.tierTitle}>This week</Text>
        </View>
        {missed && missed.length > 0 && (
          <View style={styles.catchUp}>
            <Text style={styles.catchUpTitle}>Missed this week — catch up</Text>
            <CatchUpCard
              items={missed}
              onPressExercise={exerciseId => navigation.navigate('ExerciseHistory', { exerciseId })}
              onDismiss={handleDismissMissed}
              onStart={handleStartCatchUp}
            />
          </View>
        )}
        {volumeView?.deload && <DeloadBanner />}
        <WeeklyVolumeCard
          view={volumeView}
          error={volumeError}
          onOpenAnalytics={openAnalytics}
          onRowPress={muscleGroup => navigation.navigate('MuscleGroupDetail', { muscleGroup, weekStart })}
        />
        <View style={styles.tileRow}>
          <BodyWeightTileView state={weight} onPress={openAnalytics} />
          {sleepState ? (
            <SleepTileView state={sleepState} onPress={() => navigation.navigate('HealthKitData')} />
          ) : (
            <View style={styles.half} />
          )}
        </View>

        <InsightsCard />

        {/* Tier 3: medical layer */}
        <View style={styles.tierHeader}>
          <Text style={styles.tierTitle}>Medical</Text>
        </View>
        <RemindersCard items={reminderViews} onToggleDone={handleToggleDone} onManage={() => navigation.navigate('HealthReminders')} />

        <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('TrainingOverview')} style={styles.trainingLink}>
          <Card style={styles.trainingCard}>
            <View style={styles.trainingText}>
              <Text style={styles.trainingTitle}>Training & goals</Text>
              <Text style={styles.trainingSubtitle}>Rings, streaks, today’s plan, supplements</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Card>
        </TouchableOpacity>
      </ScrollView>

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
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  date: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  headerButton: {
    padding: spacing.sm,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  tierTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tierMeta: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  tileRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  half: {
    flex: 1,
  },
  catchUp: {
    marginBottom: spacing.md,
  },
  catchUpTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  trainingLink: {
    marginTop: spacing.xl,
  },
  trainingCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trainingText: {
    flex: 1,
  },
  trainingTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  trainingSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: typography.size.lg,
    color: colors.textTertiary,
  },
  buttonContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    padding: spacing.base,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
});

export default HealthDashboardScreen;
