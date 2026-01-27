import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import { useWorkout } from '../contexts/WorkoutContext';
import { MUSCLE_GROUP_DISPLAY_NAMES, EQUIPMENT_DISPLAY_NAMES, CABLE_ACCESSORY_DISPLAY_NAMES, Equipment, MuscleGroup } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type TemplateDetailRouteProp = RouteProp<RootStackParamList, 'TemplateDetail'>;

export function TemplateDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<TemplateDetailRouteProp>();
  const { templateId } = route.params;
  const { templates, exercises, deleteTemplate, getLocationById } = useData();
  const { startWorkout } = useWorkout();
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [muscleModalVisible, setMuscleModalVisible] = useState(false);

  const template = templates.find(t => t.id === templateId);

  // Get exercises for a muscle group (by display name)
  const getExercisesForMuscle = (muscleDisplayName: string) => {
    // Find the muscle group key from display name
    const muscleKey = Object.entries(MUSCLE_GROUP_DISPLAY_NAMES).find(
      ([, displayName]) => displayName === muscleDisplayName
    )?.[0] as MuscleGroup | undefined;

    if (!muscleKey) return [];

    return exercises.filter(exercise => {
      const primaryMuscles = exercise.primaryMuscleGroups?.length
        ? exercise.primaryMuscleGroups
        : exercise.primaryMuscleGroup
        ? [exercise.primaryMuscleGroup]
        : [];
      const secondaryMuscles = exercise.secondaryMuscleGroups || [];

      return primaryMuscles.includes(muscleKey) || secondaryMuscles.includes(muscleKey);
    }).sort((a, b) => {
      // Sort by whether it's primary (primary first)
      const aIsPrimary = (a.primaryMuscleGroups?.includes(muscleKey) || a.primaryMuscleGroup === muscleKey) ? 0 : 1;
      const bIsPrimary = (b.primaryMuscleGroups?.includes(muscleKey) || b.primaryMuscleGroup === muscleKey) ? 0 : 1;
      if (aIsPrimary !== bIsPrimary) return aIsPrimary - bIsPrimary;
      return a.name.localeCompare(b.name);
    });
  };

  const handleMusclePress = (muscle: string) => {
    setSelectedMuscle(muscle);
    setMuscleModalVisible(true);
  };

  if (!template) {
    return (
      <SafeAreaView style={commonStyles.safeArea}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Template not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const templateExercises = template.exerciseIds
    .map(id => exercises.find(e => e.id === id))
    .filter(Boolean);

  const location = getLocationById(template.locationId);

  // Get unique equipment used in this template
  const uniqueEquipment = useMemo(() => {
    const equipmentSet = new Set<Equipment>();
    templateExercises.forEach(exercise => {
      if (exercise?.equipment) {
        equipmentSet.add(exercise.equipment);
      }
    });
    return Array.from(equipmentSet);
  }, [templateExercises]);

  // Get muscle group coverage
  const muscleGroupCoverage = useMemo(() => {
    const coverage: Record<string, { count: number; exercises: string[] }> = {};

    templateExercises.forEach(exercise => {
      if (!exercise) return;

      // Get primary muscle groups
      const primaryMuscles = exercise.primaryMuscleGroups?.length
        ? exercise.primaryMuscleGroups
        : exercise.primaryMuscleGroup
        ? [exercise.primaryMuscleGroup]
        : [];

      primaryMuscles.forEach(muscle => {
        const displayName = MUSCLE_GROUP_DISPLAY_NAMES[muscle] || muscle;
        if (!coverage[displayName]) {
          coverage[displayName] = { count: 0, exercises: [] };
        }
        coverage[displayName].count++;
        coverage[displayName].exercises.push(exercise.name);
      });

      // Get secondary muscle groups
      const secondaryMuscles = exercise.secondaryMuscleGroups || [];
      secondaryMuscles.forEach(muscle => {
        const displayName = MUSCLE_GROUP_DISPLAY_NAMES[muscle] || muscle;
        if (!coverage[displayName]) {
          coverage[displayName] = { count: 0, exercises: [] };
        }
        // Add 0.5 for secondary muscles
        coverage[displayName].count += 0.5;
      });
    });

    // Sort by count descending
    return Object.entries(coverage)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([muscle, data]) => ({
        muscle,
        count: Math.round(data.count * 10) / 10,
        exercises: data.exercises,
      }));
  }, [templateExercises]);

  const handleStartWorkout = async () => {
    const workoutId = await startWorkout(template.id);
    navigation.navigate('ActiveWorkout', { workoutId });
  };

  const handleEdit = () => {
    navigation.navigate('EditTemplate', { templateId });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Template',
      `Are you sure you want to delete "${template.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTemplate(templateId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{template.name}</Text>
          <Text style={styles.subtitle}>
            {location?.name || 'Unknown'} • {templateExercises.length} exercises
          </Text>
          {uniqueEquipment.length > 0 && (
            <View style={styles.equipmentRow}>
              {uniqueEquipment.map(eq => (
                <View key={eq} style={styles.equipmentChip}>
                  <Text style={styles.equipmentChipText}>
                    {EQUIPMENT_DISPLAY_NAMES[eq]}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Start Workout Button */}
        <Button
          title="Start Workout"
          onPress={handleStartWorkout}
          fullWidth
          size="large"
        />

        {/* Exercises */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercises</Text>
          <Card padding="none">
            {templateExercises.map((exercise, index) => (
              <TouchableOpacity
                key={exercise!.id}
                style={[
                  styles.exerciseItem,
                  index === 0 && styles.exerciseItemFirst,
                  index === templateExercises.length - 1 && styles.exerciseItemLast,
                  index < templateExercises.length - 1 && styles.exerciseItemBorder,
                ]}
                onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: exercise!.id })}
                activeOpacity={0.7}
              >
                <View style={styles.exerciseNumber}>
                  <Text style={styles.numberText}>{index + 1}</Text>
                </View>
                <View style={styles.exerciseInfo}>
                  <Text style={styles.exerciseName}>{exercise!.name}</Text>
                  <Text style={styles.exerciseMuscle}>
                    {exercise!.primaryMuscleGroups && exercise!.primaryMuscleGroups.length > 0
                      ? exercise!.primaryMuscleGroups.map(m => MUSCLE_GROUP_DISPLAY_NAMES[m]).join(', ')
                      : exercise!.primaryMuscleGroup
                      ? MUSCLE_GROUP_DISPLAY_NAMES[exercise!.primaryMuscleGroup]
                      : 'Unknown'}
                    {' • '}
                    {EQUIPMENT_DISPLAY_NAMES[exercise!.equipment]}
                    {exercise!.equipment === 'cable' && exercise!.cableAccessory &&
                      ` (${CABLE_ACCESSORY_DISPLAY_NAMES[exercise!.cableAccessory]})`}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </View>

        {/* Muscle Group Coverage */}
        {muscleGroupCoverage.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Muscle Coverage</Text>
            <Text style={styles.sectionHint}>Tap a muscle to see exercise options</Text>
            <Card>
              <View style={styles.coverageGrid}>
                {muscleGroupCoverage.map(({ muscle, count, exercises: muscleExercises }) => (
                  <TouchableOpacity
                    key={muscle}
                    style={styles.coverageItem}
                    onPress={() => handleMusclePress(muscle)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.coverageHeader}>
                      <Text style={styles.coverageMuscle}>{muscle}</Text>
                      <View style={styles.coverageRight}>
                        <Text style={styles.coverageCount}>
                          {count} in routine
                        </Text>
                        <Text style={styles.coverageChevron}>›</Text>
                      </View>
                    </View>
                    <View style={styles.coverageBar}>
                      <View
                        style={[
                          styles.coverageBarFill,
                          { width: `${Math.min(count / 3 * 100, 100)}%` },
                        ]}
                      />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Edit Template"
            onPress={handleEdit}
            variant="secondary"
            fullWidth
          />
          <Button
            title="Delete Template"
            onPress={handleDelete}
            variant="destructive"
            fullWidth
            style={styles.deleteButton}
          />
        </View>
      </ScrollView>

      {/* Exercise Options Modal */}
      <Modal
        visible={muscleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMuscleModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMuscleModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedMuscle} Exercises</Text>
            <Text style={styles.modalSubtitle}>
              {selectedMuscle && getExercisesForMuscle(selectedMuscle).length} exercises available
            </Text>

            <ScrollView style={styles.exerciseList} showsVerticalScrollIndicator={false}>
              {selectedMuscle && getExercisesForMuscle(selectedMuscle).map(exercise => {
                const isInTemplate = template?.exerciseIds.includes(exercise.id);
                const isPrimary = exercise.primaryMuscleGroups?.some(m =>
                  MUSCLE_GROUP_DISPLAY_NAMES[m] === selectedMuscle
                ) || MUSCLE_GROUP_DISPLAY_NAMES[exercise.primaryMuscleGroup || ''] === selectedMuscle;

                return (
                  <TouchableOpacity
                    key={exercise.id}
                    style={[
                      styles.exerciseOption,
                      isInTemplate && styles.exerciseOptionInTemplate,
                    ]}
                    onPress={() => {
                      setMuscleModalVisible(false);
                      navigation.navigate('ExerciseDetail', { exerciseId: exercise.id });
                    }}
                  >
                    <View style={styles.exerciseOptionLeft}>
                      <Text style={styles.exerciseOptionName}>{exercise.name}</Text>
                      <Text style={styles.exerciseOptionMeta}>
                        {EQUIPMENT_DISPLAY_NAMES[exercise.equipment]}
                        {!isPrimary && ' • Secondary'}
                      </Text>
                    </View>
                    {isInTemplate && (
                      <View style={styles.inTemplateBadge}>
                        <Text style={styles.inTemplateBadgeText}>In Routine</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Button
              title="Close"
              onPress={() => setMuscleModalVisible(false)}
              variant="secondary"
              fullWidth
              style={styles.closeButton}
            />
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.size.lg,
    color: colors.textSecondary,
  },
  header: {
    marginBottom: spacing.lg,
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
    textTransform: 'capitalize',
  },
  equipmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  equipmentChip: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  equipmentChipText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  exerciseItemFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  exerciseItemLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  exerciseItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  exerciseNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  numberText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: typography.size.md,
    color: colors.text,
  },
  exerciseMuscle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  actions: {
    marginTop: spacing.xl,
  },
  deleteButton: {
    marginTop: spacing.md,
  },
  // Muscle coverage styles
  coverageGrid: {
    gap: spacing.md,
  },
  coverageItem: {
    gap: spacing.xs,
  },
  coverageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coverageMuscle: {
    fontSize: typography.size.sm,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  coverageCount: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  coverageBar: {
    height: 6,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  coverageBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  coverageRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  coverageChevron: {
    fontSize: typography.size.lg,
    color: colors.textTertiary,
  },
  sectionHint: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '80%',
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
  exerciseList: {
    maxHeight: 400,
  },
  exerciseOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  exerciseOptionInTemplate: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  exerciseOptionLeft: {
    flex: 1,
  },
  exerciseOptionName: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  exerciseOptionMeta: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inTemplateBadge: {
    backgroundColor: colors.primaryDim,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  inTemplateBadgeText: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  closeButton: {
    marginTop: spacing.md,
  },
});

export default TemplateDetailScreen;
