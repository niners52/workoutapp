import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO, addDays } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card, ProgressBar } from '../components/common';
import { useData } from '../contexts/DataContext';
import { getExerciseVolumeForMuscleGroup } from '../services/analytics';
import {
  MUSCLE_GROUP_DISPLAY_NAMES,
  PrimaryMuscleGroup,
} from '../types';
import { RootStackParamList } from '../navigation/types';

type MuscleGroupDetailRouteProp = RouteProp<RootStackParamList, 'MuscleGroupDetail'>;

export function MuscleGroupDetailScreen() {
  const route = useRoute<MuscleGroupDetailRouteProp>();
  const { muscleGroup, weekStart } = route.params;
  const { userSettings } = useData();

  const [exerciseVolume, setExerciseVolume] = useState<
    { exerciseId: string; exerciseName: string; sets: number }[]
  >([]);

  useEffect(() => {
    const loadData = async () => {
      const startDate = parseISO(weekStart);
      const endDate = addDays(startDate, 6);

      const volume = await getExerciseVolumeForMuscleGroup(
        muscleGroup as PrimaryMuscleGroup,
        startDate,
        endDate
      );
      setExerciseVolume(volume);
    };

    loadData();
  }, [muscleGroup, weekStart]);

  const target = userSettings.muscleGroupTargets[muscleGroup] || 0;
  const totalSets = exerciseVolume.reduce((sum, e) => sum + e.sets, 0);
  const progress = target > 0 ? (totalSets / target) * 100 : 0;

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <Text style={styles.title}>
          {MUSCLE_GROUP_DISPLAY_NAMES[muscleGroup as PrimaryMuscleGroup]}
        </Text>
        <Text style={styles.subtitle}>
          Week of {format(parseISO(weekStart), 'MMM d, yyyy')}
        </Text>

        {/* Progress Card */}
        <Card style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Weekly Progress</Text>
            <Text style={styles.progressValue}>
              {totalSets} / {target} sets
            </Text>
          </View>
          <ProgressBar
            progress={progress}
            height={12}
            color={progress >= 100 ? colors.success : colors.primary}
          />
          <Text style={styles.progressPercent}>
            {Math.round(progress)}% of target
          </Text>
        </Card>

        {/* Exercise Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercise Breakdown</Text>
          {exerciseVolume.length === 0 ? (
            <Card>
              <Text style={styles.emptyText}>No exercises logged this week</Text>
            </Card>
          ) : (
            <Card padding="none">
              {exerciseVolume.map((exercise, index) => (
                <View
                  key={exercise.exerciseId}
                  style={[
                    styles.exerciseRow,
                    index === 0 && styles.exerciseRowFirst,
                    index === exerciseVolume.length - 1 && styles.exerciseRowLast,
                    index < exerciseVolume.length - 1 && styles.exerciseRowBorder,
                  ]}
                >
                  <Text style={styles.exerciseName}>{exercise.exerciseName}</Text>
                  <Text style={styles.exerciseSets}>{exercise.sets} sets</Text>
                </View>
              ))}
            </Card>
          )}
        </View>

        {/* Tips */}
        {target > 0 && progress < 100 && (
          <Card style={styles.tipCard}>
            <Text style={styles.tipTitle}>Tip</Text>
            <Text style={styles.tipText}>
              You need {target - totalSets} more sets this week to hit your target.
            </Text>
          </Card>
        )}
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
    marginBottom: spacing.lg,
  },
  progressCard: {
    marginBottom: spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  progressLabel: {
    fontSize: typography.size.md,
    color: colors.text,
  },
  progressValue: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  progressPercent: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
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
  exerciseName: {
    fontSize: typography.size.md,
    color: colors.text,
    flex: 1,
  },
  exerciseSets: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  tipCard: {
    backgroundColor: colors.backgroundTertiary,
  },
  tipTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  tipText: {
    fontSize: typography.size.base,
    color: colors.text,
  },
});

export default MuscleGroupDetailScreen;
