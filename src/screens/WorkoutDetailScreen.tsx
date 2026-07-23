import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { WorkoutShareButton } from '../components/WorkoutShareCard';
import * as Crypto from 'expo-crypto';
import { useData } from '../contexts/DataContext';
import { useWorkout } from '../contexts/WorkoutContext';
import { getSetsByWorkoutId, updateWorkout, deleteWorkout, clearActiveWorkoutState } from '../services/storage';
import { WorkoutSet, PrimaryMuscleGroup, Template, TemplateType } from '../types';
import { RootStackParamList } from '../navigation/types';
import { formatWeightValue } from '../services/units';

const generateId = () => Crypto.randomUUID();

type WorkoutDetailRouteProp = RouteProp<RootStackParamList, 'WorkoutDetail'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function WorkoutDetailScreen() {
  const route = useRoute<WorkoutDetailRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { workoutId } = route.params;
  const { workouts, templates, exercises, locations, userSettings, refreshWorkouts, addTemplate } = useData();
  const { startWorkout } = useWorkout();
  const units = userSettings?.units || 'imperial';

  const [sets, setSets] = useState<WorkoutSet[]>([]);
  // "Create as Workout" modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createLocationId, setCreateLocationId] = useState('gym');
  const [createType, setCreateType] = useState<TemplateType>('full_body');
  const [creating, setCreating] = useState(false);

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

  // Calculate muscle group sets for share card
  const muscleGroupSets = useMemo(() => {
    const muscleSetCounts = new Map<string, { sets: number; isSecondary: boolean }>();

    exerciseIds.forEach(exerciseId => {
      const exercise = exercises.find(e => e.id === exerciseId);
      if (!exercise) return;

      const exerciseSets = setsByExercise[exerciseId];
      const setCount = exerciseSets.length;

      // Primary muscle groups
      const primaryMuscles = exercise.primaryMuscleGroups?.length
        ? exercise.primaryMuscleGroups
        : exercise.primaryMuscleGroup
        ? [exercise.primaryMuscleGroup]
        : [];

      primaryMuscles.forEach((muscle: PrimaryMuscleGroup) => {
        const existing = muscleSetCounts.get(muscle);
        if (existing) {
          existing.sets += setCount;
        } else {
          muscleSetCounts.set(muscle, { sets: setCount, isSecondary: false });
        }
      });

      // Secondary muscle groups
      exercise.secondaryMuscleGroups?.forEach((muscle: PrimaryMuscleGroup) => {
        const existing = muscleSetCounts.get(muscle);
        if (existing && !existing.isSecondary) {
          // Already counted as primary, don't change
        } else if (existing) {
          existing.sets += setCount;
        } else {
          muscleSetCounts.set(muscle, { sets: setCount, isSecondary: true });
        }
      });
    });

    return Array.from(muscleSetCounts.entries()).map(([muscleGroup, data]) => ({
      muscleGroup,
      sets: data.sets,
      isSecondary: data.isSecondary,
    }));
  }, [exerciseIds, exercises, setsByExercise]);

  const workoutName = template?.name || 'Custom Workout';

  const handleExercisePress = (exerciseId: string) => {
    navigation.navigate('ExerciseDetail', { exerciseId });
  };

  const openCreateModal = () => {
    // Pre-fill from the source workout's template if present, else sensible defaults.
    setCreateName(template?.name ? `${template.name} (copy)` : `Workout from ${format(workoutDate, 'MMM d')}`);
    setCreateLocationId(template?.locationId ?? 'gym');
    setCreateType((template?.type as TemplateType) ?? 'full_body');
    setCreateModalVisible(true);
  };

  const handleStartNow = async () => {
    if (exerciseIds.length === 0) return;
    setCreating(true);
    try {
      const newWorkoutId = await startWorkout(undefined, exerciseIds, workout?.locationId ?? template?.locationId);
      if (!newWorkoutId) return; // user kept their in-progress workout
      setCreateModalVisible(false);
      navigation.navigate('ActiveWorkout', { workoutId: newWorkoutId });
    } catch (err) {
      console.log('[WorkoutDetail] Start now failed:', err);
      Alert.alert('Error', 'Could not start the workout.');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    const trimmed = createName.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a name for the template.');
      return;
    }
    if (exerciseIds.length === 0) return;
    setCreating(true);
    try {
      const newTemplate: Template = {
        id: generateId(),
        name: trimmed,
        type: createType,
        locationId: createLocationId,
        exerciseIds: [...exerciseIds],
      };
      await addTemplate(newTemplate);
      setCreateModalVisible(false);
      Alert.alert('Template Saved', `"${trimmed}" added to your templates.`);
    } catch (err) {
      console.log('[WorkoutDetail] Save template failed:', err);
      Alert.alert('Error', 'Could not save the template.');
    } finally {
      setCreating(false);
    }
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

        {/* Interrupted Workout Resolution Card */}
        {!workout.completedAt && (
          <Card style={styles.resolutionCard}>
            <View style={styles.resolutionHeader}>
              <Ionicons name="warning" size={22} color={colors.warning} />
              <Text style={styles.resolutionTitle}>Interrupted Workout</Text>
            </View>
            <Text style={styles.resolutionText}>
              This workout was not completed.
            </Text>
            <View style={styles.resolutionButtons}>
              <TouchableOpacity
                style={styles.resolutionCompleteButton}
                onPress={() => {
                  Alert.alert(
                    'Mark as Complete',
                    'This will mark the workout as completed. The completion time will be set to the start time.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Complete',
                        onPress: async () => {
                          await updateWorkout({ ...workout, completedAt: workout.startedAt });
                          await clearActiveWorkoutState();
                          refreshWorkouts();
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.resolutionCompleteText}>Mark Complete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resolutionDeleteButton}
                onPress={() => {
                  Alert.alert(
                    'Delete Workout',
                    'This will permanently delete this workout and all its sets.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          await deleteWorkout(workoutId);
                          await clearActiveWorkoutState();
                          refreshWorkouts();
                          navigation.goBack();
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.resolutionDeleteText}>Delete Workout</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

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
                            {formatWeightValue(set.weight, units)}×{set.reps}
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

        {/* Action Buttons (Share + Create as Workout) */}
        {workout.completedAt && sets.length > 0 && (
          <View style={styles.shareSection}>
            <WorkoutShareButton
              workoutName={workoutName}
              startedAt={workout.startedAt}
              completedAt={workout.completedAt}
              sets={sets}
              exercises={exercises}
              muscleGroupSets={muscleGroupSets}
              units={units}
            />
            <TouchableOpacity
              style={createStyles.createButton}
              onPress={openCreateModal}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.textOnPrimary} />
              <Text style={createStyles.createButtonText}>Create as Workout</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Create as Workout Modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <TouchableOpacity
          style={createStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCreateModalVisible(false)}
        >
          <View style={createStyles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={createStyles.modalTitle}>Create as Workout</Text>
            <Text style={createStyles.modalSubtitle}>
              {exerciseIds.length} exercise{exerciseIds.length === 1 ? '' : 's'} from this session
            </Text>

            {/* Name */}
            <Text style={createStyles.fieldLabel}>Name</Text>
            <TextInput
              style={createStyles.input}
              value={createName}
              onChangeText={setCreateName}
              placeholder="Workout name"
              placeholderTextColor={colors.textTertiary}
            />

            {/* Location */}
            <Text style={createStyles.fieldLabel}>Location</Text>
            <View style={createStyles.chipRow}>
              {locations.map(loc => {
                const selected = createLocationId === loc.id;
                return (
                  <TouchableOpacity
                    key={loc.id}
                    style={[createStyles.chip, selected && createStyles.chipSelected]}
                    onPress={() => setCreateLocationId(loc.id)}
                  >
                    <Text style={[createStyles.chipText, selected && createStyles.chipTextSelected]}>
                      {loc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Type */}
            <Text style={createStyles.fieldLabel}>Type</Text>
            <View style={createStyles.chipRow}>
              {(['push', 'pull', 'lower', 'full_body'] as const).map(t => {
                const selected = createType === t;
                const label = t === 'full_body' ? 'Full Body' : t.charAt(0).toUpperCase() + t.slice(1);
                return (
                  <TouchableOpacity
                    key={t}
                    style={[createStyles.chip, selected && createStyles.chipSelected]}
                    onPress={() => setCreateType(t)}
                  >
                    <Text style={[createStyles.chipText, selected && createStyles.chipTextSelected]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Actions */}
            <View style={createStyles.actionRow}>
              <TouchableOpacity
                style={[createStyles.actionSecondary, creating && createStyles.actionDisabled]}
                onPress={handleSaveAsTemplate}
                disabled={creating}
              >
                <Text style={createStyles.actionSecondaryText}>Save Template</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[createStyles.actionPrimary, creating && createStyles.actionDisabled]}
                onPress={handleStartNow}
                disabled={creating}
              >
                <Text style={createStyles.actionPrimaryText}>Start Now</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={createStyles.cancelLink}
              onPress={() => setCreateModalVisible(false)}
              disabled={creating}
            >
              <Text style={createStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  shareSection: {
    marginTop: spacing.lg,
  },
  // Resolution card styles
  resolutionCard: {
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  resolutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  resolutionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.warning,
    marginLeft: spacing.sm,
  },
  resolutionText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  resolutionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  resolutionCompleteButton: {
    flex: 1,
    backgroundColor: colors.warning,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  resolutionCompleteText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: '#000',
  },
  resolutionDeleteButton: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  resolutionDeleteText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.error,
  },
});

const createStyles = StyleSheet.create({
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
  },
  createButtonText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  modalTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  chipTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  actionPrimary: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  actionPrimaryText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  actionSecondary: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
  },
  actionSecondaryText: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  cancelLink: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: typography.size.md,
  },
});

export default WorkoutDetailScreen;
