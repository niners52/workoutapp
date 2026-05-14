import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { WorkoutShareButton } from '../components/WorkoutShareCard';
import { useData } from '../contexts/DataContext';
import {
  MUSCLE_GROUP_DISPLAY_NAMES,
  PrimaryMuscleGroup,
  ANALYTICS_CATEGORIES,
} from '../types';
import { RootStackParamList } from '../navigation/types';
import { formatVolume, formatWeight } from '../services/units';
import { formatPRLabel } from '../services/personalRecords';
import { getSetsByWorkoutId } from '../services/storage';
import { WorkoutSet } from '../types';

type WorkoutSummaryRouteProp = RouteProp<RootStackParamList, 'WorkoutSummary'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface MuscleGroupSetData {
  muscleGroup: string;
  sets: number;
  isSecondary: boolean;
}

// Group muscle groups by analytics category
function groupByCategory(muscleGroupSets: MuscleGroupSetData[]): {
  category: string;
  items: MuscleGroupSetData[];
}[] {
  const categoryGroups: { category: string; items: MuscleGroupSetData[] }[] = [];

  ANALYTICS_CATEGORIES.forEach(cat => {
    const items = muscleGroupSets.filter(mg =>
      cat.muscleGroups.includes(mg.muscleGroup as PrimaryMuscleGroup)
    );
    if (items.length > 0) {
      categoryGroups.push({
        category: cat.name,
        items: items.sort((a, b) => b.sets - a.sets),
      });
    }
  });

  return categoryGroups;
}

export function WorkoutSummaryScreen() {
  const route = useRoute<WorkoutSummaryRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { workoutId, startedAt, completedAt, totalSets, muscleGroupSets, sessionPRs } = route.params;
  const { workouts, templates, exercises, userSettings } = useData();

  // Load sets directly from storage. DataContext's `sets` state isn't refreshed when
  // logSet writes during a workout, so the just-finished workout's sets aren't there yet
  // and total volume would render as 0.
  const [workoutSets, setWorkoutSets] = useState<WorkoutSet[]>([]);
  useEffect(() => {
    let cancelled = false;
    getSetsByWorkoutId(workoutId).then(s => {
      if (!cancelled) setWorkoutSets(s);
    });
    return () => { cancelled = true; };
  }, [workoutId]);

  // Get workout details
  const workout = workouts.find(w => w.id === workoutId);
  const template = workout?.templateId ? templates.find(t => t.id === workout.templateId) : null;
  const workoutName = template?.name || 'Custom Workout';
  const units = userSettings?.units || 'imperial';

  const startTime = parseISO(startedAt);
  const endTime = parseISO(completedAt);
  const durationMinutes = differenceInMinutes(endTime, startTime);

  // Format duration
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const durationStr = hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes} min`;

  // Group by category
  const categoryGroups = groupByCategory(muscleGroupSets);

  // Calculate primary sets (total excluding secondary contributions)
  const primarySets = muscleGroupSets
    .filter(mg => !mg.isSecondary)
    .reduce((sum, mg) => sum + mg.sets, 0);

  // Calculate total volume (weight × reps for all sets)
  const totalVolume = workoutSets.reduce((sum, set) => {
    const weight = set.weight || 0;
    const reps = set.reps || 0;
    return sum + (weight * reps);
  }, 0);

  const handleDone = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="checkmark-circle" size={48} color={colors.success} style={styles.checkmarkIcon} />
          <Text style={styles.title}>Workout Complete!</Text>
          <Text style={styles.subtitle}>
            {format(startTime, 'EEEE, MMM d')} at {format(startTime, 'h:mm a')}
          </Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{durationStr}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{totalSets}</Text>
            <Text style={styles.statLabel}>Total Sets</Text>
          </Card>
        </View>

        {/* Volume */}
        <Card style={styles.volumeCard}>
          <Ionicons name="barbell-outline" size={24} color={colors.primary} />
          <View style={styles.volumeInfo}>
            <Text style={styles.volumeValue}>{formatVolume(totalVolume, units)}</Text>
            <Text style={styles.volumeLabel}>Total Volume</Text>
          </View>
        </Card>

        {/* PRs Section */}
        {sessionPRs && sessionPRs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Records</Text>
            <Card style={styles.prSummaryCard}>
              <Text style={styles.prSummaryHeadline}>
                You set {sessionPRs.length} PR{sessionPRs.length !== 1 ? 's' : ''} this session!
              </Text>
              {sessionPRs.map((pr, index) => {
                const exercise = exercises.find(e => e.id === pr.exerciseId);
                const set = workoutSets.find(s => s.id === pr.setId);
                return (
                  <View
                    key={pr.setId}
                    style={[
                      styles.prRow,
                      index === sessionPRs.length - 1 && styles.prRowLast,
                    ]}
                  >
                    <View style={styles.prRowLeft}>
                      <Text style={styles.prExerciseName}>
                        {exercise?.name || 'Unknown'}
                      </Text>
                      <Text style={styles.prDetail}>
                        {pr.prTypes.map(t => formatPRLabel(t)).join(', ')}
                        {set ? ` — ${formatWeight(set.weight, units)} × ${set.reps}` : ''}
                      </Text>
                    </View>
                    {pr.isMilestone && pr.milestoneLabel ? (
                      <View style={styles.milestoneBadge}>
                        <Text style={styles.milestoneBadgeText}>🏆 {pr.milestoneLabel}</Text>
                      </View>
                    ) : (
                      <View style={styles.regularPrBadge}>
                        <Text style={styles.regularPrBadgeText}>🏅 PR</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
          </View>
        )}

        {/* Muscle Groups Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Muscles Worked</Text>

          {categoryGroups.length === 0 ? (
            <Card>
              <Text style={styles.emptyText}>No exercises logged</Text>
            </Card>
          ) : (
            categoryGroups.map(group => (
              <Card key={group.category} style={styles.categoryCard}>
                <Text style={styles.categoryTitle}>{group.category}</Text>
                {group.items.map((item, index) => (
                  <View
                    key={item.muscleGroup}
                    style={[
                      styles.muscleRow,
                      index === group.items.length - 1 && styles.muscleRowLast,
                    ]}
                  >
                    <View style={styles.muscleInfo}>
                      <Text style={[
                        styles.muscleName,
                        item.isSecondary && styles.muscleNameSecondary,
                      ]}>
                        {MUSCLE_GROUP_DISPLAY_NAMES[item.muscleGroup as PrimaryMuscleGroup]}
                      </Text>
                      {item.isSecondary && (
                        <Text style={styles.secondaryBadge}>secondary</Text>
                      )}
                    </View>
                    <Text style={[
                      styles.musclesets,
                      item.isSecondary && styles.muscleSetsSecondary,
                    ]}>
                      {item.sets} sets
                    </Text>
                  </View>
                ))}
              </Card>
            ))
          )}
        </View>
      </ScrollView>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <WorkoutShareButton
          workoutName={workoutName}
          startedAt={startedAt}
          completedAt={completedAt}
          sets={workoutSets}
          exercises={exercises}
          muscleGroupSets={muscleGroupSets}
          units={units}
        />
        <View style={styles.buttonSpacer} />
        <Button
          title="Done"
          onPress={handleDone}
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
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  checkmarkIcon: {
    marginBottom: spacing.md,
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
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  statLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  volumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  volumeInfo: {
    flex: 1,
  },
  volumeValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  volumeLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
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
  categoryCard: {
    marginBottom: spacing.md,
  },
  categoryTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  muscleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  muscleRowLast: {
    borderBottomWidth: 0,
  },
  muscleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  muscleName: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  muscleNameSecondary: {
    color: colors.textSecondary,
  },
  secondaryBadge: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  musclesets: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.primary,
  },
  muscleSetsSecondary: {
    color: colors.textSecondary,
  },
  prSummaryCard: {
    marginBottom: spacing.md,
  },
  prSummaryHeadline: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  prRowLast: {
    borderBottomWidth: 0,
  },
  prRowLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  prExerciseName: {
    fontSize: typography.size.base,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  prDetail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  milestoneBadge: {
    backgroundColor: colors.primary + '30',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  milestoneBadgeText: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  regularPrBadge: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  regularPrBadgeText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
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
  buttonSpacer: {
    height: spacing.sm,
  },
});

export default WorkoutSummaryScreen;
