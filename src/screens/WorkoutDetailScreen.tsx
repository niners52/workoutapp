import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import { getSetsByWorkoutId } from '../services/storage';
import { WorkoutSet } from '../types';
import { RootStackParamList } from '../navigation/types';

type WorkoutDetailRouteProp = RouteProp<RootStackParamList, 'WorkoutDetail'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function WorkoutDetailScreen() {
  const route = useRoute<WorkoutDetailRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { workoutId } = route.params;
  const { workouts, templates, exercises } = useData();

  const [sets, setSets] = useState<WorkoutSet[]>([]);

  const workout = workouts.find(w => w.id === workoutId);
  const template = workout?.templateId
    ? templates.find(t => t.id === workout.templateId)
    : null;

  useEffect(() => {
    const loadSets = async () => {
      const workoutSets = await getSetsByWorkoutId(workoutId);
      setSets(workoutSets);
    };
    loadSets();
  }, [workoutId]);

  if (!workout) {
    return (
      <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <Text style={styles.emptyText}>Workout not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const workoutDate = new Date(workout.startedAt);
  const dateStr = format(workoutDate, 'EEEE, MMMM d, yyyy');
  const timeStr = format(workoutDate, 'h:mm a');

  // Group sets by exercise
  const setsByExercise = sets.reduce((acc, set) => {
    if (!acc[set.exerciseId]) {
      acc[set.exerciseId] = [];
    }
    acc[set.exerciseId].push(set);
    return acc;
  }, {} as Record<string, WorkoutSet[]>);

  const exerciseIds = Object.keys(setsByExercise);

  const handleExercisePress = (exerciseId: string) => {
    navigation.navigate('ExerciseDetail', { exerciseId });
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <Text style={styles.title}>
          {template?.name || 'Custom Workout'}
        </Text>
        <Text style={styles.subtitle}>
          {dateStr}
        </Text>
        <Text style={styles.time}>
          Started at {timeStr}
        </Text>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{sets.length}</Text>
            <Text style={styles.statLabel}>Total Sets</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{exerciseIds.length}</Text>
            <Text style={styles.statLabel}>Exercises</Text>
          </Card>
        </View>

        {/* Exercises */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercises</Text>
          {exerciseIds.length === 0 ? (
            <Card>
              <Text style={styles.emptyText}>No exercises logged</Text>
            </Card>
          ) : (
            <Card padding="none">
              {exerciseIds.map((exerciseId, index) => {
                const exercise = exercises.find(e => e.id === exerciseId);
                const exerciseSets = setsByExercise[exerciseId];

                return (
                  <TouchableOpacity
                    key={exerciseId}
                    style={[
                      styles.exerciseRow,
                      index === 0 && styles.exerciseRowFirst,
                      index === exerciseIds.length - 1 && styles.exerciseRowLast,
                      index < exerciseIds.length - 1 && styles.exerciseRowBorder,
                    ]}
                    onPress={() => handleExercisePress(exerciseId)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.exerciseInfo}>
                      <Text style={styles.exerciseName}>
                        {exercise?.name || 'Unknown Exercise'}
                      </Text>
                      <View style={styles.setsRow}>
                        {exerciseSets.map((set, idx) => (
                          <Text key={set.id} style={styles.setDetail}>
                            {set.weight}×{set.reps}
                            {idx < exerciseSets.length - 1 ? '  ' : ''}
                          </Text>
                        ))}
                      </View>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </Card>
          )}
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
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  time: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
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
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  exerciseRowFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  exerciseRowLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  exerciseRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  setsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  setDetail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  chevron: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
});

export default WorkoutDetailScreen;
