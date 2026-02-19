import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { differenceInSeconds, parseISO } from 'date-fns';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { useWorkout } from '../../contexts/WorkoutContext';
import { useData } from '../../contexts/DataContext';
import { RootStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const MINI_BAR_HEIGHT = 60;

export function ActiveWorkoutMiniBar() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { activeWorkout, isWorkoutActive } = useWorkout();
  const { templates } = useData();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Don't show on ActiveWorkout screen itself
  const isOnActiveWorkout = route.name === 'ActiveWorkout';

  // Update elapsed time every second
  useEffect(() => {
    if (!activeWorkout?.workout.startedAt) return;

    const updateElapsed = () => {
      const startTime = parseISO(activeWorkout.workout.startedAt);
      const now = new Date();
      setElapsedSeconds(differenceInSeconds(now, startTime));
    };

    // Initial update
    updateElapsed();

    // Set up interval
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [activeWorkout?.workout.startedAt]);

  // Don't render if no active workout or on ActiveWorkout screen
  if (!isWorkoutActive || !activeWorkout || isOnActiveWorkout) {
    return null;
  }

  // Get workout name from template or use default
  const template = activeWorkout.workout.templateId
    ? templates.find(t => t.id === activeWorkout.workout.templateId)
    : null;
  const workoutName = template?.name || 'Custom Workout';

  // Count exercises with at least one set logged
  const exercisesWithSets = new Set(activeWorkout.sets.map(s => s.exerciseId));
  const exercisesCompleted = exercisesWithSets.size;
  const totalExercises = activeWorkout.exerciseIds.length;
  const totalSets = activeWorkout.sets.length;

  // Format elapsed time
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  const timeDisplay = hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const handlePress = () => {
    navigation.navigate('MainTabs', { screen: 'Train' });
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { paddingBottom: Platform.OS === 'ios' ? 0 : insets.bottom > 0 ? 0 : spacing.xs },
      ]}
      onPress={handlePress}
      activeOpacity={0.9}
    >
      <View style={styles.content}>
        <View style={styles.leftSection}>
          <View style={styles.titleRow}>
            <Ionicons name="barbell" size={18} color={colors.primary} />
            <Text style={styles.workoutName} numberOfLines={1}>
              {workoutName}
            </Text>
          </View>
          <Text style={styles.statusText}>
            {exercisesCompleted}/{totalExercises} exercises  {totalSets} sets
          </Text>
        </View>

        <View style={styles.rightSection}>
          <Text style={styles.timer}>{timeDisplay}</Text>
          <Ionicons name="chevron-up" size={20} color={colors.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    borderTopWidth: 1,
    borderTopColor: colors.primary,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    height: MINI_BAR_HEIGHT,
  },
  leftSection: {
    flex: 1,
    marginRight: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  workoutName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    flex: 1,
  },
  statusText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
    marginLeft: 26, // Align with text after icon
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timer: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
});

export default ActiveWorkoutMiniBar;
