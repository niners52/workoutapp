import React, { useState, useCallback } from 'react';
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
import { Button, Card } from '../components/common';
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
    getActiveRoutine,
  } = useData();
  const { isWorkoutActive } = useWorkout();

  // Get today's date string for supplements
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const activeSupplements = supplements.filter(s => s.isActive);

  const [refreshing, setRefreshing] = useState(false);
  const [todayStatus, setTodayStatus] = useState<DailyGoalStatus | null>(null);
  const [streaks, setStreaks] = useState<StreakCounts | null>(null);
  const [weeklyGridData, setWeeklyGridData] = useState<{
    days: DailyGoalStatus[];
    todayIndex: number;
    dayLabels: string[];
  } | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);

  const loadData = useCallback(async () => {
    try {
      // Load all goals data
      const [status, streakCounts, gridData, summary] = await Promise.all([
        getTodayGoalStatus(userSettings),
        calculateStreaks(userSettings),
        getWeeklyGridData(userSettings),
        getWeeklySummary(userSettings),
      ]);

      setTodayStatus(status);
      setStreaks(streakCounts);
      setWeeklyGridData(gridData);
      setWeeklySummary(summary);
    } catch (error) {
      console.error('Failed to load home data:', error);
    }
  }, [userSettings]);

  useFocusEffect(
    useCallback(() => {
      refreshWorkouts();
      loadData();
    }, [loadData, refreshWorkouts])
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
  const activeRoutine = getActiveRoutine();
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
        {todayStatus && userSettings.dailyGoals && (
          <TodayRings
            status={todayStatus}
            dailyGoals={userSettings.dailyGoals}
          />
        )}

        {/* Streaks */}
        {streaks && userSettings.dailyGoals && (
          <StreakCounters
            streaks={streaks}
            dailyGoals={userSettings.dailyGoals}
          />
        )}

        {/* Weekly Grid */}
        {weeklyGridData && userSettings.dailyGoals && (
          <WeeklyGrid
            days={weeklyGridData.days}
            todayIndex={weeklyGridData.todayIndex}
            dayLabels={weeklyGridData.dayLabels}
            dailyGoals={userSettings.dailyGoals}
          />
        )}

        {/* Weekly Totals */}
        {weeklySummary && userSettings.weeklyGoals && userSettings.dailyGoals && (
          <WeeklyTotals
            summary={weeklySummary}
            weeklyGoals={userSettings.weeklyGoals}
            dailyGoals={userSettings.dailyGoals}
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
});

export default HomeScreen;
