import React, { useEffect, useState, useCallback } from 'react';
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
import { format, startOfWeek, endOfWeek, isWithinInterval, subDays } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { WeeklyBarChart } from '../components/charts';
import { useData } from '../contexts/DataContext';
import { useWorkout } from '../contexts/WorkoutContext';
import { getWeeklyVolume, calculateTrainingScore } from '../services/analytics';
import { getWeeklyNutritionAverage, getWeeklySleepAverage } from '../services/healthKit';
import { Workout, WeeklyVolume } from '../types';
import { RootStackParamList } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { workouts, userSettings, refreshWorkouts } = useData();
  const { isWorkoutActive } = useWorkout();

  const [refreshing, setRefreshing] = useState(false);
  const [weeklyVolume, setWeeklyVolume] = useState<WeeklyVolume | null>(null);
  const [weeklyNutrition, setWeeklyNutrition] = useState<{
    avgProtein: number;
    days: number;
  } | null>(null);
  const [weeklySleep, setWeeklySleep] = useState<{
    avgHours: number;
    days: number;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const today = new Date();

      // Load weekly volume
      const volume = await getWeeklyVolume(today);
      setWeeklyVolume(volume);

      // Load weekly nutrition
      const nutrition = await getWeeklyNutritionAverage(today);
      setWeeklyNutrition({
        avgProtein: nutrition.avgProtein,
        days: nutrition.days,
      });

      // Load weekly sleep
      const sleep = await getWeeklySleepAverage(today);
      setWeeklySleep({
        avgHours: sleep.avgHours,
        days: sleep.days,
      });
    } catch (error) {
      console.error('Failed to load home data:', error);
    }
  }, []);

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

  // Get this week's workouts
  const today = new Date();
  const dayOffset = userSettings.weekStartDay === 'sunday' ? 0 : 1;
  const weekStart = startOfWeek(today, { weekStartsOn: dayOffset as 0 | 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: dayOffset as 0 | 1 });

  const thisWeeksWorkouts = workouts.filter(w =>
    w.completedAt &&
    isWithinInterval(new Date(w.startedAt), { start: weekStart, end: weekEnd })
  );

  // Calculate chart data
  const trainingScore = weeklyVolume
    ? calculateTrainingScore(weeklyVolume.muscleGroups)
    : 0;

  const proteinScore = weeklyNutrition
    ? Math.round((weeklyNutrition.avgProtein / userSettings.proteinGoal) * 100)
    : 0;

  const sleepScore = weeklySleep
    ? Math.round((weeklySleep.avgHours / userSettings.sleepGoal) * 100)
    : 0;

  const chartData = [
    {
      label: 'Training',
      value: trainingScore,
      maxValue: 100,
      color: colors.chartTraining,
      onPress: () => navigation.navigate('MainTabs', { screen: 'Analytics' }),
    },
    {
      label: 'Protein',
      value: weeklyNutrition?.avgProtein || 0,
      maxValue: userSettings.proteinGoal,
      color: colors.chartProtein,
      onPress: () => navigation.navigate('MainTabs', { screen: 'Analytics' }),
    },
    {
      label: 'Sleep',
      value: weeklySleep?.avgHours || 0,
      maxValue: userSettings.sleepGoal,
      color: colors.chartSleep,
      onPress: () => navigation.navigate('MainTabs', { screen: 'Analytics' }),
    },
  ];

  const handleStartWorkout = () => {
    if (isWorkoutActive) {
      // Resume active workout
      navigation.navigate('ActiveWorkout', { workoutId: '' });
    } else {
      navigation.navigate('StartWorkout');
    }
  };

  const handleWorkoutPress = (workoutId: string) => {
    navigation.navigate('WorkoutDetail', { workoutId });
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

        {/* Weekly Overview Chart */}
        <WeeklyBarChart
          data={chartData}
          title="This Week"
          height={140}
        />

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{thisWeeksWorkouts.length}</Text>
            <Text style={styles.statLabel}>Workouts</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>
              {weeklyVolume?.totalSets || 0}
            </Text>
            <Text style={styles.statLabel}>Total Sets</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>
              {weeklyNutrition?.avgProtein || 0}g
            </Text>
            <Text style={styles.statLabel}>Avg Protein</Text>
          </Card>
        </View>

        {/* This Week's Workouts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This Week's Workouts</Text>
          {thisWeeksWorkouts.length === 0 ? (
            <Card>
              <Text style={styles.emptyText}>No workouts yet this week</Text>
            </Card>
          ) : (
            <Card padding="none">
              {thisWeeksWorkouts.map((workout, index) => (
                <WorkoutListItem
                  key={workout.id}
                  workout={workout}
                  onPress={() => handleWorkoutPress(workout.id)}
                  isFirst={index === 0}
                  isLast={index === thisWeeksWorkouts.length - 1}
                />
              ))}
            </Card>
          )}
        </View>

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

interface WorkoutListItemProps {
  workout: Workout;
  onPress: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function WorkoutListItem({ workout, onPress, isFirst, isLast }: WorkoutListItemProps) {
  const { templates } = useData();
  const template = workout.templateId
    ? templates.find(t => t.id === workout.templateId)
    : null;

  const workoutDate = new Date(workout.startedAt);
  const dateStr = format(workoutDate, 'EEEE, MMM d');
  const timeStr = format(workoutDate, 'h:mm a');

  return (
    <TouchableOpacity
      style={[
        styles.workoutItem,
        isFirst && styles.workoutItemFirst,
        isLast && styles.workoutItemLast,
        !isLast && styles.workoutItemBorder,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.workoutHeader}>
        <View style={styles.workoutHeaderLeft}>
          <Text style={styles.workoutTitle}>
            {template?.name || 'Custom Workout'}
          </Text>
          <Text style={styles.workoutDate}>
            {dateStr} at {timeStr}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
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
    marginBottom: spacing.lg,
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
  statsRow: {
    flexDirection: 'row',
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  workoutItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
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
  workoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  workoutHeaderLeft: {
    flex: 1,
  },
  workoutTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  workoutDate: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
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
});

export default HomeScreen;
