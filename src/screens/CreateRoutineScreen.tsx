import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
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
  Routine,
  RoutineDaySchedule,
  DAY_NAMES,
  ANALYTICS_CATEGORIES,
  MUSCLE_GROUP_DISPLAY_NAMES,
} from '../types';
import { calculateProjectedVolumeForRoutine, aggregateIntoCategories } from '../services/analytics';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type EditRouteProp = RouteProp<RootStackParamList, 'EditRoutine'>;

interface CreateRoutineScreenProps {
  isEditing?: boolean;
}

export function CreateRoutineScreen({ isEditing = false }: CreateRoutineScreenProps) {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<EditRouteProp>();
  const routineId = (route.params as any)?.routineId;

  const {
    templates,
    exercises,
    userSettings,
    routines,
    addRoutine,
    updateRoutine,
  } = useData();

  // Find existing routine if editing
  const existingRoutine = routineId ? routines.find(r => r.id === routineId) : null;

  // Initialize state
  const [name, setName] = useState(existingRoutine?.name || '');
  const [daySchedule, setDaySchedule] = useState<RoutineDaySchedule[]>(
    existingRoutine?.daySchedule || [
      { day: 0, templateIds: [] },
      { day: 1, templateIds: [] },
      { day: 2, templateIds: [] },
      { day: 3, templateIds: [] },
      { day: 4, templateIds: [] },
      { day: 5, templateIds: [] },
      { day: 6, templateIds: [] },
    ]
  );
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  // Calculate projected volume
  const projectedVolume = useMemo(() => {
    const tempRoutine: Routine = {
      id: 'temp',
      name: name,
      daySchedule: daySchedule,
      isActive: false,
    };
    return calculateProjectedVolumeForRoutine(
      tempRoutine,
      templates,
      exercises,
      userSettings.muscleGroupTargets
    );
  }, [daySchedule, templates, exercises, userSettings.muscleGroupTargets, name]);

  const categoryVolumes = useMemo(() => {
    return aggregateIntoCategories(projectedVolume);
  }, [projectedVolume]);

  // Toggle a template for a specific day (add/remove from array)
  const handleToggleTemplate = (day: number, templateId: string) => {
    setDaySchedule(prev =>
      prev.map(d => {
        if (d.day !== day) return d;
        const currentIds = d.templateIds || [];
        const isSelected = currentIds.includes(templateId);
        return {
          ...d,
          templateIds: isSelected
            ? currentIds.filter(id => id !== templateId)
            : [...currentIds, templateId],
        };
      })
    );
  };

  // Clear all templates for a day (make it a rest day)
  const handleClearDay = (day: number) => {
    setDaySchedule(prev =>
      prev.map(d => (d.day === day ? { ...d, templateIds: [] } : d))
    );
    setExpandedDay(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a name for this routine.');
      return;
    }

    const hasAtLeastOneWorkout = daySchedule.some(d => d.templateIds && d.templateIds.length > 0);
    if (!hasAtLeastOneWorkout) {
      Alert.alert('No Workouts', 'Please assign at least one workout to a day.');
      return;
    }

    if (existingRoutine) {
      // Update existing
      await updateRoutine({
        ...existingRoutine,
        name: name.trim(),
        daySchedule,
      });
    } else {
      // Create new
      const newRoutine: Routine = {
        id: `routine-${Date.now()}`,
        name: name.trim(),
        daySchedule,
        isActive: routines.length === 0, // First routine is automatically active
      };
      await addRoutine(newRoutine);
    }

    navigation.goBack();
  };

  const getTemplatesForDay = (day: number) => {
    const schedule = daySchedule.find(d => d.day === day);
    if (!schedule?.templateIds || schedule.templateIds.length === 0) return [];
    return schedule.templateIds
      .map(id => templates.find(t => t.id === id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
  };

  const isTemplateSelectedForDay = (day: number, templateId: string) => {
    const schedule = daySchedule.find(d => d.day === day);
    return schedule?.templateIds?.includes(templateId) || false;
  };

  const workoutDayCount = daySchedule.filter(d => d.templateIds && d.templateIds.length > 0).length;

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>{'‹ Cancel'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {existingRoutine ? 'Edit Routine' : 'Create Routine'}
          </Text>
        </View>

        {/* Name Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Name</Text>
          <TextInput
            style={styles.nameInput}
            placeholder="e.g., PPL Split, Upper/Lower, etc."
            placeholderTextColor={colors.textTertiary}
            value={name}
            onChangeText={setName}
          />
        </View>

        {/* Day Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Schedule</Text>
          <Card padding="none">
            {DAY_NAMES.map((dayName, dayIndex) => {
              const dayTemplates = getTemplatesForDay(dayIndex);
              const isExpanded = expandedDay === dayIndex;
              const isRestDay = dayTemplates.length === 0;

              return (
                <View key={dayIndex}>
                  <TouchableOpacity
                    style={[
                      styles.dayRow,
                      dayIndex === 0 && styles.dayRowFirst,
                      dayIndex === 6 && !isExpanded && styles.dayRowLast,
                      dayIndex < 6 && !isExpanded && styles.dayRowBorder,
                    ]}
                    onPress={() => setExpandedDay(isExpanded ? null : dayIndex)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dayName}>{dayName}</Text>
                    <View style={styles.dayValue}>
                      <Text
                        style={[
                          styles.templateName,
                          isRestDay && styles.restDay,
                        ]}
                        numberOfLines={1}
                      >
                        {isRestDay
                          ? 'Rest'
                          : dayTemplates.length === 1
                          ? dayTemplates[0].name
                          : `${dayTemplates.length} workouts`}
                      </Text>
                      <Text style={styles.expandIcon}>
                        {isExpanded ? '−' : '+'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.templatePicker}>
                      {/* Show selected templates summary if any */}
                      {dayTemplates.length > 0 && (
                        <View style={styles.selectedTemplates}>
                          <Text style={styles.selectedLabel}>Selected:</Text>
                          {dayTemplates.map(t => (
                            <View key={t.id} style={styles.selectedChip}>
                              <Text style={styles.selectedChipText}>{t.name}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Clear/Rest option */}
                      <TouchableOpacity
                        style={[
                          styles.templateOption,
                          isRestDay && styles.templateOptionSelected,
                        ]}
                        onPress={() => handleClearDay(dayIndex)}
                      >
                        <Text
                          style={[
                            styles.templateOptionText,
                            isRestDay && styles.templateOptionTextSelected,
                          ]}
                        >
                          Rest Day (Clear All)
                        </Text>
                      </TouchableOpacity>

                      {/* Template options - multi-select */}
                      {templates.map(t => {
                        const isSelected = isTemplateSelectedForDay(dayIndex, t.id);
                        return (
                          <TouchableOpacity
                            key={t.id}
                            style={[
                              styles.templateOption,
                              isSelected && styles.templateOptionSelected,
                            ]}
                            onPress={() => handleToggleTemplate(dayIndex, t.id)}
                          >
                            <View style={styles.templateOptionRow}>
                              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                {isSelected && <Text style={styles.checkmark}>✓</Text>}
                              </View>
                              <Text
                                style={[
                                  styles.templateOptionText,
                                  isSelected && styles.templateOptionTextSelected,
                                ]}
                              >
                                {t.name}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}

                      {/* Done button */}
                      <TouchableOpacity
                        style={styles.doneButton}
                        onPress={() => setExpandedDay(null)}
                      >
                        <Text style={styles.doneButtonText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
          <Text style={styles.hint}>
            {workoutDayCount} workout day{workoutDayCount !== 1 ? 's' : ''}, {7 - workoutDayCount} rest day{7 - workoutDayCount !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Projected Volume */}
        {workoutDayCount > 0 && (
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

                  return (
                    <View key={category.category} style={styles.volumeRow}>
                      <View style={styles.volumeHeader}>
                        <Text style={styles.volumeLabel}>{category.name}</Text>
                        <Text style={styles.volumeSets}>
                          {category.totalSets}/{category.totalTarget} sets
                        </Text>
                      </View>
                      <ProgressBar
                        progress={Math.min(progress, 100)}
                        color={progressColor}
                        height={6}
                      />
                      {/* Individual muscle groups */}
                      {category.muscleGroups
                        .filter(mg => mg.target > 0 || mg.sets > 0)
                        .map(mg => (
                          <View key={mg.muscleGroup} style={styles.subVolumeRow}>
                            <Text style={styles.subVolumeLabel}>
                              {MUSCLE_GROUP_DISPLAY_NAMES[mg.muscleGroup]}
                            </Text>
                            <Text style={styles.subVolumeSets}>
                              {mg.sets} sets
                            </Text>
                          </View>
                        ))}
                    </View>
                  );
                })}
            </Card>
            <Text style={styles.hint}>
              Based on 3 sets per exercise
            </Text>
          </View>
        )}

        {/* Save Button */}
        <View style={styles.buttonContainer}>
          <Button
            title={existingRoutine ? 'Save Changes' : 'Create Routine'}
            onPress={handleSave}
            fullWidth
            size="large"
          />
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
  header: {
    marginBottom: spacing.lg,
  },
  backButton: {
    fontSize: typography.size.md,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  nameInput: {
    fontSize: typography.size.md,
    color: colors.text,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
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
  dayValue: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
  },
  templateName: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  restDay: {
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  expandIcon: {
    fontSize: typography.size.lg,
    color: colors.textSecondary,
  },
  templatePicker: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  templateOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginVertical: 2,
  },
  templateOptionSelected: {
    backgroundColor: colors.primary + '30',
  },
  templateOptionText: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  templateOptionTextSelected: {
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  templateOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.textTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.text,
    fontSize: 12,
    fontWeight: typography.weight.bold,
  },
  selectedTemplates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    marginBottom: spacing.sm,
  },
  selectedLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  selectedChip: {
    backgroundColor: colors.primary + '30',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  selectedChipText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  doneButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  doneButtonText: {
    color: colors.text,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
  hint: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.sm,
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
    marginTop: spacing.xs,
  },
  subVolumeLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  subVolumeSets: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  buttonContainer: {
    marginTop: spacing.lg,
  },
});

export default CreateRoutineScreen;
