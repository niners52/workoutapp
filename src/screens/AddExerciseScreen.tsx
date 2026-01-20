import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import {
  Exercise,
  Equipment,
  ExerciseLocation,
  PrimaryMuscleGroup,
  ALL_TRACKABLE_MUSCLE_GROUPS,
  MUSCLE_GROUP_DISPLAY_NAMES,
} from '../types';

const EQUIPMENT_OPTIONS: { value: Equipment; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machine' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'other', label: 'Other' },
];

const LOCATION_OPTIONS: { value: ExerciseLocation; label: string }[] = [
  { value: 'gym', label: 'Gym' },
  { value: 'home', label: 'Home' },
  { value: 'both', label: 'Both' },
];

export function AddExerciseScreen() {
  const navigation = useNavigation();
  const { addExercise } = useData();

  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState<Equipment>('dumbbell');
  const [location, setLocation] = useState<ExerciseLocation>('both');
  const [primaryMuscle, setPrimaryMuscle] = useState<PrimaryMuscleGroup>('chest');
  const [secondaryMuscles, setSecondaryMuscles] = useState<PrimaryMuscleGroup[]>([]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter an exercise name');
      return;
    }

    const exercise: Exercise = {
      id: uuidv4(),
      name: name.trim(),
      equipment,
      location,
      primaryMuscleGroup: primaryMuscle,
      secondaryMuscleGroups: secondaryMuscles,
      isCustom: true,
    };

    await addExercise(exercise);
    navigation.goBack();
  };

  const toggleSecondaryMuscle = (muscle: PrimaryMuscleGroup) => {
    if (muscle === primaryMuscle) return; // Can't be both primary and secondary

    if (secondaryMuscles.includes(muscle)) {
      setSecondaryMuscles(secondaryMuscles.filter(m => m !== muscle));
    } else {
      setSecondaryMuscles([...secondaryMuscles, muscle]);
    }
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add Exercise</Text>
        <TouchableOpacity onPress={handleSave}>
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Name */}
        <Card style={styles.section}>
          <Text style={styles.label}>Exercise Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Dumbbell Bench Press"
            placeholderTextColor={colors.textTertiary}
            autoFocus
          />
        </Card>

        {/* Equipment */}
        <Card style={styles.section}>
          <Text style={styles.label}>Equipment</Text>
          <View style={styles.optionsRow}>
            {EQUIPMENT_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.option,
                  equipment === option.value && styles.optionSelected,
                ]}
                onPress={() => setEquipment(option.value)}
              >
                <Text
                  style={[
                    styles.optionText,
                    equipment === option.value && styles.optionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Location */}
        <Card style={styles.section}>
          <Text style={styles.label}>Location</Text>
          <View style={styles.optionsRow}>
            {LOCATION_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.option,
                  location === option.value && styles.optionSelected,
                ]}
                onPress={() => setLocation(option.value)}
              >
                <Text
                  style={[
                    styles.optionText,
                    location === option.value && styles.optionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Primary Muscle Group */}
        <Card style={styles.section}>
          <Text style={styles.label}>Primary Muscle Group</Text>
          <View style={styles.muscleGrid}>
            {ALL_TRACKABLE_MUSCLE_GROUPS.map(muscle => (
              <TouchableOpacity
                key={muscle}
                style={[
                  styles.muscleOption,
                  primaryMuscle === muscle && styles.muscleOptionSelected,
                ]}
                onPress={() => {
                  setPrimaryMuscle(muscle);
                  // Remove from secondary if it was there
                  setSecondaryMuscles(secondaryMuscles.filter(m => m !== muscle));
                }}
              >
                <Text
                  style={[
                    styles.muscleText,
                    primaryMuscle === muscle && styles.muscleTextSelected,
                  ]}
                >
                  {MUSCLE_GROUP_DISPLAY_NAMES[muscle]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Secondary Muscle Groups */}
        <Card style={styles.section}>
          <Text style={styles.label}>Secondary Muscle Groups (optional)</Text>
          <View style={styles.muscleGrid}>
            {ALL_TRACKABLE_MUSCLE_GROUPS.filter(m => m !== primaryMuscle).map(muscle => (
              <TouchableOpacity
                key={muscle}
                style={[
                  styles.muscleOption,
                  secondaryMuscles.includes(muscle) && styles.muscleOptionSecondary,
                ]}
                onPress={() => toggleSecondaryMuscle(muscle)}
              >
                <Text
                  style={[
                    styles.muscleText,
                    secondaryMuscles.includes(muscle) && styles.muscleTextSecondary,
                  ]}
                >
                  {MUSCLE_GROUP_DISPLAY_NAMES[muscle]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    paddingBottom: spacing.xxl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.size.md,
    color: colors.text,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
  },
  optionSelected: {
    backgroundColor: colors.primary,
  },
  optionText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  optionTextSelected: {
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  muscleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  muscleOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
  },
  muscleOptionSelected: {
    backgroundColor: colors.primary,
  },
  muscleOptionSecondary: {
    backgroundColor: colors.primaryDark,
  },
  muscleText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  muscleTextSelected: {
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  muscleTextSecondary: {
    color: colors.text,
  },
});

export default AddExerciseScreen;
