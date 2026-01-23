import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import * as Crypto from 'expo-crypto';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';

// Generate UUID using expo-crypto
const generateId = () => Crypto.randomUUID();
import { Button, Card, NumberInput } from '../components/common';
import { useData } from '../contexts/DataContext';
import { addWorkout, addSet, getLastSetsForExercise } from '../services/storage';
import { Workout, WorkoutSet, Exercise, Template, MUSCLE_GROUP_DISPLAY_NAMES } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface SetEntry {
  id: string;
  reps: number;
  weight: number;
}

interface ExerciseEntry {
  exerciseId: string;
  sets: SetEntry[];
}

export function LogPastWorkoutScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { exercises, templates, refreshWorkouts } = useData();

  const [workoutDate, setWorkoutDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isBlankWorkout, setIsBlankWorkout] = useState(false);
  const [exerciseEntries, setExerciseEntries] = useState<ExerciseEntry[]>([]);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize exercises when template is selected
  useEffect(() => {
    if (selectedTemplate) {
      const entries: ExerciseEntry[] = selectedTemplate.exerciseIds.map(id => ({
        exerciseId: id,
        sets: [],
      }));
      setExerciseEntries(entries);
      if (entries.length > 0) {
        setExpandedExerciseId(entries[0].exerciseId);
      }
    }
  }, [selectedTemplate]);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setWorkoutDate(selectedDate);
    }
  };

  const addSetToExercise = (exerciseId: string) => {
    setExerciseEntries(prev => prev.map(entry => {
      if (entry.exerciseId === exerciseId) {
        return {
          ...entry,
          sets: [...entry.sets, { id: generateId(), reps: 8, weight: 0 }],
        };
      }
      return entry;
    }));
  };

  const updateSet = (exerciseId: string, setId: string, field: 'reps' | 'weight', value: number) => {
    setExerciseEntries(prev => prev.map(entry => {
      if (entry.exerciseId === exerciseId) {
        return {
          ...entry,
          sets: entry.sets.map(set =>
            set.id === setId ? { ...set, [field]: value } : set
          ),
        };
      }
      return entry;
    }));
  };

  const removeSet = (exerciseId: string, setId: string) => {
    setExerciseEntries(prev => prev.map(entry => {
      if (entry.exerciseId === exerciseId) {
        return {
          ...entry,
          sets: entry.sets.filter(set => set.id !== setId),
        };
      }
      return entry;
    }));
  };

  const addExerciseToWorkout = (exerciseId: string) => {
    if (exerciseEntries.some(e => e.exerciseId === exerciseId)) {
      return; // Already added
    }
    setExerciseEntries(prev => [...prev, { exerciseId, sets: [] }]);
    setExpandedExerciseId(exerciseId);
  };

  const removeExerciseFromWorkout = (exerciseId: string) => {
    setExerciseEntries(prev => prev.filter(e => e.exerciseId !== exerciseId));
  };

  const handleStartBlankWorkout = () => {
    setIsBlankWorkout(true);
    setExerciseEntries([]);
  };

  const handleSaveWorkout = async () => {
    const totalSets = exerciseEntries.reduce((sum, e) => sum + e.sets.length, 0);
    if (totalSets === 0) {
      Alert.alert('No Sets', 'Please add at least one set to save the workout.');
      return;
    }

    setIsSaving(true);
    try {
      // Create workout with the selected date
      const workout: Workout = {
        id: generateId(),
        startedAt: workoutDate.toISOString(),
        completedAt: workoutDate.toISOString(),
        templateId: selectedTemplate?.id || null,
      };

      await addWorkout(workout);

      // Create sets for each exercise
      for (const entry of exerciseEntries) {
        for (const set of entry.sets) {
          const workoutSet: WorkoutSet = {
            id: generateId(),
            workoutId: workout.id,
            exerciseId: entry.exerciseId,
            reps: set.reps,
            weight: set.weight,
            loggedAt: workoutDate.toISOString(),
          };
          await addSet(workoutSet);
        }
      }

      await refreshWorkouts();

      Alert.alert(
        'Workout Saved',
        `Logged ${totalSets} sets for ${format(workoutDate, 'EEEE, MMM d')}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Error', `Failed to save workout: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getExercise = (id: string): Exercise | undefined => {
    return exercises.find(e => e.id === id);
  };

  // Template selection view
  if (!selectedTemplate && !isBlankWorkout) {
    return (
      <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.title}>Log Past Workout</Text>
          <Text style={styles.description}>
            Select a template or start a blank workout to log exercises from an earlier date.
          </Text>

          {/* Date Picker */}
          <Card style={styles.section}>
            <Text style={styles.label}>Workout Date</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {format(workoutDate, 'EEEE, MMMM d, yyyy')}
              </Text>
              <Text style={styles.dateButtonHint}>Tap to change</Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={workoutDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                maximumDate={new Date()}
                themeVariant="dark"
              />
            )}
          </Card>

          {/* Blank Workout Option */}
          <TouchableOpacity
            style={styles.blankWorkoutButton}
            onPress={handleStartBlankWorkout}
          >
            <Text style={styles.blankWorkoutText}>+ Blank Workout</Text>
            <Text style={styles.blankWorkoutHint}>Add any exercises manually</Text>
          </TouchableOpacity>

          {/* Template Selection */}
          <Text style={styles.sectionTitle}>Or Select Template</Text>
          <Card padding="none">
            {templates.map((template, index) => (
              <TouchableOpacity
                key={template.id}
                style={[
                  styles.templateItem,
                  index === 0 && styles.templateItemFirst,
                  index === templates.length - 1 && styles.templateItemLast,
                  index < templates.length - 1 && styles.templateItemBorder,
                ]}
                onPress={() => setSelectedTemplate(template)}
              >
                <Text style={styles.templateName}>{template.name}</Text>
                <Text style={styles.templateExercises}>
                  {template.exerciseIds.length} exercises
                </Text>
              </TouchableOpacity>
            ))}
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Workout entry view
  const handleBack = () => {
    setSelectedTemplate(null);
    setIsBlankWorkout(false);
    setExerciseEntries([]);
  };

  const [showExercisePicker, setShowExercisePicker] = useState(false);

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerDate}>
            {format(workoutDate, 'EEE, MMM d')}
          </Text>
        </View>

        <Text style={styles.title}>
          {isBlankWorkout ? 'Custom Workout' : selectedTemplate?.name}
        </Text>
        <Text style={styles.description}>
          Add the sets you performed for each exercise.
        </Text>

        {/* Exercises */}
        {exerciseEntries.map((entry, index) => {
          const exercise = getExercise(entry.exerciseId);
          const isExpanded = expandedExerciseId === entry.exerciseId;

          if (!exercise) return null;

          return (
            <Card key={entry.exerciseId} style={styles.exerciseCard} padding="none">
              <TouchableOpacity
                style={styles.exerciseHeader}
                onPress={() => setExpandedExerciseId(isExpanded ? null : entry.exerciseId)}
              >
                <View style={styles.exerciseHeaderLeft}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseSets}>
                    {entry.sets.length} {entry.sets.length === 1 ? 'set' : 'sets'}
                  </Text>
                </View>
                <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.exerciseContent}>
                  {/* Sets */}
                  {entry.sets.map((set, setIndex) => (
                    <View key={set.id} style={styles.setRow}>
                      <Text style={styles.setNumber}>Set {setIndex + 1}</Text>
                      <View style={styles.setInputs}>
                        <View style={styles.setInputGroup}>
                          <Text style={styles.setInputLabel}>lbs</Text>
                          <NumberInput
                            value={set.weight}
                            onChangeValue={(v) => updateSet(entry.exerciseId, set.id, 'weight', v)}
                            step={5}
                            min={0}
                            max={1000}
                          />
                        </View>
                        <Text style={styles.setX}>×</Text>
                        <View style={styles.setInputGroup}>
                          <Text style={styles.setInputLabel}>reps</Text>
                          <NumberInput
                            value={set.reps}
                            onChangeValue={(v) => updateSet(entry.exerciseId, set.id, 'reps', v)}
                            step={1}
                            min={1}
                            max={100}
                          />
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => removeSet(entry.exerciseId, set.id)}>
                        <Text style={styles.removeSet}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <Button
                    title="+ Add Set"
                    onPress={() => addSetToExercise(entry.exerciseId)}
                    variant="secondary"
                    fullWidth
                    style={styles.addSetButton}
                  />
                </View>
              )}
            </Card>
          );
        })}

        {/* Add Exercise Button (for blank workouts or any workout) */}
        <TouchableOpacity
          style={styles.addExerciseButton}
          onPress={() => setShowExercisePicker(true)}
        >
          <Text style={styles.addExerciseText}>+ Add Exercise</Text>
        </TouchableOpacity>

        {/* Save Button */}
        <Button
          title={isSaving ? 'Saving...' : 'Save Workout'}
          onPress={handleSaveWorkout}
          disabled={isSaving}
          fullWidth
          size="large"
          style={styles.saveButton}
        />
      </ScrollView>

      {/* Exercise Picker Modal */}
      <Modal
        visible={showExercisePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowExercisePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Exercise</Text>
              <TouchableOpacity onPress={() => setShowExercisePicker(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.exerciseList}>
              {exercises
                .filter(e => !exerciseEntries.some(entry => entry.exerciseId === e.id))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(exercise => (
                  <TouchableOpacity
                    key={exercise.id}
                    style={styles.exerciseListItem}
                    onPress={() => {
                      addExerciseToWorkout(exercise.id);
                      setShowExercisePicker(false);
                    }}
                  >
                    <Text style={styles.exerciseListName}>{exercise.name}</Text>
                    <Text style={styles.exerciseListMuscle}>
                      {exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
                        ? exercise.primaryMuscleGroups.map(m => MUSCLE_GROUP_DISPLAY_NAMES[m]).join(', ')
                        : exercise.primaryMuscleGroup
                        ? MUSCLE_GROUP_DISPLAY_NAMES[exercise.primaryMuscleGroup]
                        : 'Unknown'}
                    </Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backButton: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  headerDate: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  dateButton: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  dateButtonHint: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  templateItemFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  templateItemLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  templateItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  templateName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  templateExercises: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  exerciseCard: {
    marginBottom: spacing.md,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  exerciseHeaderLeft: {
    flex: 1,
  },
  exerciseName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  exerciseSets: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  expandIcon: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  exerciseContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    padding: spacing.base,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  setNumber: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    width: 50,
  },
  setInputs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setInputGroup: {
    alignItems: 'center',
  },
  setInputLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  setX: {
    fontSize: typography.size.lg,
    color: colors.textSecondary,
    marginHorizontal: spacing.md,
  },
  removeSet: {
    fontSize: typography.size.xl,
    color: colors.error,
    paddingHorizontal: spacing.sm,
  },
  addSetButton: {
    marginTop: spacing.sm,
  },
  saveButton: {
    marginTop: spacing.lg,
  },
  blankWorkoutButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  blankWorkoutText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  blankWorkoutHint: {
    fontSize: typography.size.sm,
    color: colors.text,
    opacity: 0.8,
    marginTop: spacing.xs,
  },
  addExerciseButton: {
    padding: spacing.base,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.separator,
    borderStyle: 'dashed',
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  addExerciseText: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  modalTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  modalClose: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  exerciseList: {
    padding: spacing.base,
  },
  exerciseListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  exerciseListName: {
    fontSize: typography.size.md,
    color: colors.text,
    flex: 1,
  },
  exerciseListMuscle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
});

export default LogPastWorkoutScreen;
