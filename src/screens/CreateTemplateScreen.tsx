import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import {
  Template,
  TemplateType,
  Exercise,
  PrimaryMuscleGroup,
  MUSCLE_GROUP_DISPLAY_NAMES,
  ALL_TEMPLATE_TYPES,
  TEMPLATE_TYPE_DISPLAY_NAMES,
} from '../types';

// Map template types to their associated muscle groups
const TEMPLATE_TYPE_MUSCLES: Record<TemplateType, PrimaryMuscleGroup[]> = {
  push: ['chest', 'front_delts', 'side_delts', 'triceps'],
  pull: ['lats', 'upper_back', 'traps', 'rear_delts', 'biceps', 'forearms'],
  lower: ['quads', 'hamstrings', 'glutes', 'calves'],
};
import { RootStackParamList } from '../navigation/types';

type RouteProps = RouteProp<RootStackParamList, 'EditTemplate'>;

export function CreateTemplateScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const { exercises, templates, addTemplate, updateTemplate, locations } = useData();

  // Check if we're editing an existing template
  const editingTemplateId = route.params?.templateId;
  const existingTemplate = editingTemplateId
    ? templates.find(t => t.id === editingTemplateId)
    : undefined;

  const [name, setName] = useState(existingTemplate?.name || '');
  const [templateType, setTemplateType] = useState<TemplateType>(
    existingTemplate?.type || 'push'
  );
  const [locationId, setLocationId] = useState<string>(
    existingTemplate?.locationId || locations[0]?.id || 'gym'
  );
  const [selectedExercises, setSelectedExercises] = useState<string[]>(
    existingTemplate?.exerciseIds || []
  );
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showAllExercises, setShowAllExercises] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a template name');
      return;
    }

    if (selectedExercises.length === 0) {
      Alert.alert('Error', 'Please add at least one exercise');
      return;
    }

    const template: Template = {
      id: existingTemplate?.id || uuidv4(),
      name: name.trim(),
      type: templateType,
      locationId,
      exerciseIds: selectedExercises,
    };

    if (existingTemplate) {
      await updateTemplate(template);
    } else {
      await addTemplate(template);
    }
    navigation.goBack();
  };

  const toggleExercise = (exerciseId: string) => {
    if (selectedExercises.includes(exerciseId)) {
      setSelectedExercises(selectedExercises.filter(id => id !== exerciseId));
    } else {
      setSelectedExercises([...selectedExercises, exerciseId]);
    }
  };

  const moveExercise = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= selectedExercises.length) return;

    const newOrder = [...selectedExercises];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    setSelectedExercises(newOrder);
  };

  // Get the current location to filter exercises
  const currentLocation = locations.find(l => l.id === locationId);
  const locationName = currentLocation?.name.toLowerCase() || 'gym';

  // Filter exercises based on location and template type
  const filteredExercises = exercises.filter(e => {
    // If showing all exercises, skip filtering
    if (showAllExercises) return true;

    // Check location filter
    let locationMatch = false;
    if (e.locationIds && e.locationIds.length > 0) {
      // New locationIds field
      locationMatch = e.locationIds.includes(locationId);
    } else if (e.location) {
      // Legacy location field
      if (e.location === 'both') locationMatch = true;
      else if (locationName.includes('gym') && e.location === 'gym') locationMatch = true;
      else if (locationName.includes('home') && e.location === 'home') locationMatch = true;
      else if (!locationName.includes('gym') && !locationName.includes('home')) locationMatch = true;
    } else {
      // No location info, include it
      locationMatch = true;
    }

    if (!locationMatch) return false;

    // Check template type filter (muscle groups)
    const templateMuscles = TEMPLATE_TYPE_MUSCLES[templateType];
    const exerciseMuscles = e.primaryMuscleGroups || (e.primaryMuscleGroup ? [e.primaryMuscleGroup] : []);

    // Check if any of the exercise's muscles match the template type
    const muscleMatch = exerciseMuscles.some(muscle => templateMuscles.includes(muscle));

    return muscleMatch;
  });

  const selectedExerciseObjects = selectedExercises
    .map(id => exercises.find(e => e.id === id))
    .filter(Boolean) as Exercise[];

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {existingTemplate ? 'Edit Template' : 'New Template'}
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
        {/* Name */}
        <Card style={styles.section}>
          <Text style={styles.label}>Template Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Upper Body"
            placeholderTextColor={colors.textTertiary}
          />
        </Card>

        {/* Template Type */}
        <Card style={styles.section}>
          <Text style={styles.label}>Workout Type</Text>
          <View style={styles.optionsRow}>
            {ALL_TEMPLATE_TYPES.map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.option,
                  templateType === type && styles.optionSelected,
                ]}
                onPress={() => setTemplateType(type)}
              >
                <Text style={styles.typeIcon}>
                  {type === 'push' ? '💪' : type === 'pull' ? '🏋️' : '🦵'}
                </Text>
                <Text
                  style={[
                    styles.optionText,
                    templateType === type && styles.optionTextSelected,
                  ]}
                >
                  {TEMPLATE_TYPE_DISPLAY_NAMES[type]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Location */}
        <Card style={styles.section}>
          <Text style={styles.label}>Location</Text>
          <View style={styles.optionsRow}>
            {locations.map(location => (
              <TouchableOpacity
                key={location.id}
                style={[
                  styles.option,
                  locationId === location.id && styles.optionSelected,
                ]}
                onPress={() => {
                  setLocationId(location.id);
                  // Optionally clear exercises when location changes
                  // setSelectedExercises([]);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    locationId === location.id && styles.optionTextSelected,
                  ]}
                >
                  {location.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Selected Exercises */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>Exercises ({selectedExercises.length})</Text>
            <TouchableOpacity onPress={() => setShowExercisePicker(!showExercisePicker)}>
              <Text style={styles.addText}>
                {showExercisePicker ? 'Done' : '+ Add'}
              </Text>
            </TouchableOpacity>
          </View>

          {selectedExerciseObjects.length > 0 && (
            <Card padding="none">
              {selectedExerciseObjects.map((exercise, index) => (
                <View
                  key={exercise.id}
                  style={[
                    styles.selectedExercise,
                    index === 0 && styles.exerciseFirst,
                    index === selectedExerciseObjects.length - 1 && styles.exerciseLast,
                    index < selectedExerciseObjects.length - 1 && styles.exerciseBorder,
                  ]}
                >
                  <View style={styles.exerciseNumber}>
                    <Text style={styles.numberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                  </View>
                  <View style={styles.reorderButtons}>
                    <TouchableOpacity
                      onPress={() => moveExercise(index, 'up')}
                      disabled={index === 0}
                    >
                      <Text style={[styles.reorderText, index === 0 && styles.reorderDisabled]}>↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveExercise(index, 'down')}
                      disabled={index === selectedExerciseObjects.length - 1}
                    >
                      <Text style={[styles.reorderText, index === selectedExerciseObjects.length - 1 && styles.reorderDisabled]}>↓</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => toggleExercise(exercise.id)}>
                    <Text style={styles.removeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          )}
        </View>

        {/* Exercise Picker */}
        {showExercisePicker && (
          <Card style={styles.section}>
            <View style={styles.pickerHeader}>
              <Text style={styles.label}>
                {showAllExercises ? 'All Exercises' : 'Filtered Exercises'} ({filteredExercises.length})
              </Text>
              <TouchableOpacity onPress={() => setShowAllExercises(!showAllExercises)}>
                <Text style={styles.showAllText}>
                  {showAllExercises ? 'Show Filtered' : 'Show All'}
                </Text>
              </TouchableOpacity>
            </View>
            {filteredExercises.map(exercise => {
              const isSelected = selectedExercises.includes(exercise.id);
              return (
                <TouchableOpacity
                  key={exercise.id}
                  style={styles.pickerItem}
                  onPress={() => toggleExercise(exercise.id)}
                >
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                    <Text style={styles.exerciseMuscle}>
                      {exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
                        ? exercise.primaryMuscleGroups.map(m => MUSCLE_GROUP_DISPLAY_NAMES[m]).join(', ')
                        : exercise.primaryMuscleGroup
                        ? MUSCLE_GROUP_DISPLAY_NAMES[exercise.primaryMuscleGroup]
                        : 'Unknown'}
                    </Text>
                  </View>
                  <Text style={[styles.checkmark, isSelected && styles.checkmarkSelected]}>
                    {isSelected ? '✓' : '○'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Card>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    backgroundColor: colors.background,
  },
  cancelText: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  saveText: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  content: {
    padding: spacing.base,
    paddingBottom: 120,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addText: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  showAllText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  input: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.size.md,
    color: colors.text,
    marginTop: spacing.md,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  option: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
  },
  optionSelected: {
    backgroundColor: colors.primary,
  },
  typeIcon: {
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  optionText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  optionTextSelected: {
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  selectedExercise: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  exerciseFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  exerciseLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  exerciseBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  exerciseNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  numberText: {
    fontSize: typography.size.xs,
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
  reorderButtons: {
    flexDirection: 'row',
    marginRight: spacing.md,
  },
  reorderText: {
    fontSize: typography.size.lg,
    color: colors.primary,
    paddingHorizontal: spacing.sm,
  },
  reorderDisabled: {
    opacity: 0.3,
  },
  removeText: {
    fontSize: typography.size.md,
    color: colors.error,
    paddingLeft: spacing.sm,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  checkmark: {
    fontSize: typography.size.lg,
    color: colors.textTertiary,
  },
  checkmarkSelected: {
    color: colors.success,
  },
});

export default CreateTemplateScreen;
