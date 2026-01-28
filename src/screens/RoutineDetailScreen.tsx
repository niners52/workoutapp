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
import { Card, Button } from '../components/common';
import { ProgressBar } from '../components/common/ProgressBar';
import { useData } from '../contexts/DataContext';
import { RootStackParamList } from '../navigation/types';
import {
  DAY_NAMES,
  MUSCLE_GROUP_DISPLAY_NAMES,
  EQUIPMENT_DISPLAY_NAMES,
  MuscleGroup,
} from '../types';
import { calculateProjectedVolumeForRoutine, aggregateIntoCategories } from '../services/analytics';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutineDetailRouteProp = RouteProp<RootStackParamList, 'RoutineDetail'>;

export function RoutineDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutineDetailRouteProp>();
  const { routineId } = route.params;

  const {
    routines,
    templates,
    exercises,
    userSettings,
    setActiveRoutine,
    deleteRoutine,
  } = useData();

  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [muscleModalVisible, setMuscleModalVisible] = useState(false);

  const routine = routines.find(r => r.id === routineId);

  // Get all exercise IDs from all templates in this routine
  const routineExerciseIds = useMemo(() => {
    const ids = new Set<string>();
    routine?.daySchedule.forEach(day => {
      day.templateIds?.forEach(templateId => {
        const template = templates.find(t => t.id === templateId);
        template?.exerciseIds.forEach(id => ids.add(id));
      });
    });
    return ids;
  }, [routine, templates]);

  // Get exercises for a muscle group (by muscle group key)
  const getExercisesForMuscle = (muscleKey: MuscleGroup) => {
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

  const handleMusclePress = (muscleKey: MuscleGroup) => {
    setSelectedMuscle(muscleKey);
    setMuscleModalVisible(true);
  };

  if (!routine) {
    return (
      <SafeAreaView style={commonStyles.safeArea}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Routine not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Calculate projected volume
  const projectedVolume = useMemo(() => {
    return calculateProjectedVolumeForRoutine(
      routine,
      templates,
      exercises,
      userSettings.muscleGroupTargets
    );
  }, [routine, templates, exercises, userSettings.muscleGroupTargets]);

  const categoryVolumes = useMemo(() => {
    return aggregateIntoCategories(projectedVolume);
  }, [projectedVolume]);

  const getTemplatesForDay = (day: number) => {
    const schedule = routine.daySchedule.find(d => d.day === day);
    if (!schedule?.templateIds || schedule.templateIds.length === 0) return [];
    return schedule.templateIds
      .map(id => templates.find(t => t.id === id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
  };

  const workoutDayCount = routine.daySchedule.filter(d => d.templateIds && d.templateIds.length > 0).length;

  const handleSetActive = async () => {
    await setActiveRoutine(routine.id);
    Alert.alert('Routine Activated', `"${routine.name}" is now your active routine.`);
  };

  const handleDeactivate = async () => {
    await setActiveRoutine(null);
  };

  const handleEdit = () => {
    navigation.navigate('EditRoutine', { routineId: routine.id });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Routine',
      `Are you sure you want to delete "${routine.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRoutine(routineId);
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
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>{'‹ Back'}</Text>
          </TouchableOpacity>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{routine.name}</Text>
            {routine.isActive && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            )}
          </View>
          <Text style={styles.subtitle}>
            {workoutDayCount} workout day{workoutDayCount !== 1 ? 's' : ''} per week
          </Text>
        </View>

        {/* Set Active Button */}
        {!routine.isActive && (
          <Button
            title="Set as Active Routine"
            onPress={handleSetActive}
            fullWidth
            size="large"
          />
        )}

        {/* Weekly Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Schedule</Text>
          <Card padding="none">
            {DAY_NAMES.map((dayName, dayIndex) => {
              const dayTemplates = getTemplatesForDay(dayIndex);
              const isRestDay = dayTemplates.length === 0;

              return (
                <View
                  key={dayIndex}
                  style={[
                    styles.dayRow,
                    dayIndex === 0 && styles.dayRowFirst,
                    dayIndex === 6 && styles.dayRowLast,
                    dayIndex < 6 && styles.dayRowBorder,
                  ]}
                >
                  <Text style={styles.dayName}>{dayName}</Text>
                  <View style={styles.dayTemplates}>
                    {isRestDay ? (
                      <Text style={[styles.templateName, styles.restDay]}>Rest</Text>
                    ) : dayTemplates.length === 1 ? (
                      <Text style={styles.templateName}>{dayTemplates[0].name}</Text>
                    ) : (
                      <View style={styles.multipleTemplates}>
                        {dayTemplates.map((t, idx) => (
                          <Text key={t.id} style={styles.templateName}>
                            {t.name}{idx < dayTemplates.length - 1 ? ', ' : ''}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
        </View>

        {/* Projected Volume */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Projected Weekly Volume</Text>
          <Card>
            {categoryVolumes
              .filter(cat => cat.totalTarget > 0)
              .map(category => {
                const progress = category.totalTarget > 0
                  ? (category.totalSets / category.totalTarget) * 100
                  : 0;
                const progressColor = progress >= 100
                  ? colors.success
                  : progress >= 75
                  ? colors.warning
                  : colors.primary;
                const percentText = Math.round(progress);

                return (
                  <View key={category.category} style={styles.volumeRow}>
                    <View style={styles.volumeHeader}>
                      <Text style={styles.volumeLabel}>{category.name}</Text>
                      <Text style={styles.volumeSets}>
                        {category.totalSets}/{category.totalTarget} sets ({percentText}%)
                      </Text>
                    </View>
                    <ProgressBar
                      progress={Math.min(progress, 100)}
                      color={progressColor}
                      height={8}
                    />
                    {/* Individual muscle groups - tappable */}
                    {category.muscleGroups
                      .filter(mg => mg.target > 0 || mg.sets > 0)
                      .map(mg => {
                        const mgProgress = mg.target > 0
                          ? Math.round((mg.sets / mg.target) * 100)
                          : 0;
                        const isShort = mg.sets < mg.target;

                        return (
                          <TouchableOpacity
                            key={mg.muscleGroup}
                            style={styles.subVolumeRow}
                            onPress={() => handleMusclePress(mg.muscleGroup)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.subVolumeLabelRow}>
                              <Text style={[
                                styles.subVolumeLabel,
                                isShort && styles.subVolumeLabelShort,
                              ]}>
                                {MUSCLE_GROUP_DISPLAY_NAMES[mg.muscleGroup]}
                              </Text>
                              {isShort && (
                                <Text style={styles.shortBadge}>short</Text>
                              )}
                            </View>
                            <View style={styles.subVolumeRight}>
                              <Text style={[
                                styles.subVolumeSets,
                                isShort && styles.subVolumeSetsShort,
                              ]}>
                                {mg.sets}/{mg.target} ({mgProgress}%)
                              </Text>
                              <Text style={styles.subVolumeChevron}>›</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                );
              })}
          </Card>
          <Text style={styles.hint}>
            Projections based on 3 sets per exercise. Tap a muscle to see exercise options.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Edit Routine"
            onPress={handleEdit}
            variant="secondary"
            fullWidth
          />
          {routine.isActive && (
            <Button
              title="Deactivate Routine"
              onPress={handleDeactivate}
              variant="secondary"
              fullWidth
              style={styles.actionButton}
            />
          )}
          <Button
            title="Delete Routine"
            onPress={handleDelete}
            variant="destructive"
            fullWidth
            style={styles.actionButton}
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
            <Text style={styles.modalTitle}>
              {selectedMuscle ? MUSCLE_GROUP_DISPLAY_NAMES[selectedMuscle as MuscleGroup] : ''} Exercises
            </Text>
            <Text style={styles.modalSubtitle}>
              {selectedMuscle && getExercisesForMuscle(selectedMuscle as MuscleGroup).length} exercises available
            </Text>

            <ScrollView style={styles.exerciseList} showsVerticalScrollIndicator={false}>
              {selectedMuscle && getExercisesForMuscle(selectedMuscle as MuscleGroup).map(exercise => {
                const isInRoutine = routineExerciseIds.has(exercise.id);
                const isPrimary = exercise.primaryMuscleGroups?.includes(selectedMuscle as MuscleGroup)
                  || exercise.primaryMuscleGroup === selectedMuscle;

                return (
                  <TouchableOpacity
                    key={exercise.id}
                    style={[
                      styles.exerciseOption,
                      isInRoutine && styles.exerciseOptionInRoutine,
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
                    {isInRoutine && (
                      <View style={styles.inRoutineBadge}>
                        <Text style={styles.inRoutineBadgeText}>In Routine</Text>
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
  backButton: {
    fontSize: typography.size.md,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  activeBadge: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  activeBadgeText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.success,
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
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  dayRowFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  dayRowLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  dayRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  dayName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
    width: 100,
  },
  dayTemplates: {
    flex: 1,
    alignItems: 'flex-end',
  },
  multipleTemplates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  templateName: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  restDay: {
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  volumeRow: {
    marginBottom: spacing.lg,
  },
  volumeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  volumeLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  volumeSets: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  subVolumeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.sm,
    paddingRight: spacing.sm,
  },
  subVolumeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  subVolumeLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  subVolumeLabelShort: {
    color: colors.warning,
  },
  shortBadge: {
    fontSize: typography.size.xs,
    color: colors.warning,
    fontWeight: typography.weight.medium,
  },
  subVolumeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  subVolumeSets: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  subVolumeSetsShort: {
    color: colors.warning,
  },
  subVolumeChevron: {
    fontSize: typography.size.lg,
    color: colors.textTertiary,
  },
  hint: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  actions: {
    marginTop: spacing.xl,
  },
  actionButton: {
    marginTop: spacing.md,
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
  exerciseOptionInRoutine: {
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
  inRoutineBadge: {
    backgroundColor: colors.primaryDim,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  inRoutineBadgeText: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  closeButton: {
    marginTop: spacing.md,
  },
});

export default RoutineDetailScreen;
