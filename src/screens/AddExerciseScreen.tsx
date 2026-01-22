import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';

// Generate UUID using expo-crypto (uuid library crashes on React Native)
const generateId = () => Crypto.randomUUID();
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import {
  Exercise,
  Equipment,
  PrimaryMuscleGroup,
  ALL_TRACKABLE_MUSCLE_GROUPS,
  MUSCLE_GROUP_DISPLAY_NAMES,
  CableAccessory,
  ALL_CABLE_ACCESSORIES,
  CABLE_ACCESSORY_DISPLAY_NAMES,
} from '../types';
import { RootStackParamList } from '../navigation/types';

type EditExerciseRouteProp = RouteProp<RootStackParamList, 'EditExercise'>;

const EQUIPMENT_OPTIONS: { value: Equipment; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machine' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'other', label: 'Other' },
];


export function AddExerciseScreen() {
  const navigation = useNavigation();
  const route = useRoute<EditExerciseRouteProp>();
  const { addExercise, updateExercise, exercises, locations } = useData();

  // Check if we're in edit mode
  const exerciseId = route.params?.exerciseId;
  const isEditMode = !!exerciseId;
  const existingExercise = isEditMode ? exercises.find(e => e.id === exerciseId) : null;

  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState<Equipment>('dumbbell');
  const [cableAccessory, setCableAccessory] = useState<CableAccessory | undefined>(undefined);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [primaryMuscle, setPrimaryMuscle] = useState<PrimaryMuscleGroup>('chest');
  const [secondaryMuscles, setSecondaryMuscles] = useState<PrimaryMuscleGroup[]>([]);

  // Load existing exercise data in edit mode
  useEffect(() => {
    if (existingExercise) {
      setName(existingExercise.name);
      setEquipment(existingExercise.equipment);
      setCableAccessory(existingExercise.cableAccessory);
      setPrimaryMuscle(existingExercise.primaryMuscleGroup);
      setSecondaryMuscles(existingExercise.secondaryMuscleGroups || []);

      // Handle locationIds
      if (existingExercise.locationIds && existingExercise.locationIds.length > 0) {
        setSelectedLocationIds(existingExercise.locationIds);
      } else if (existingExercise.location) {
        // Fallback to deprecated location field
        if (existingExercise.location === 'both') {
          setSelectedLocationIds(['gym', 'home']);
        } else {
          setSelectedLocationIds([existingExercise.location]);
        }
      }
    }
  }, [existingExercise]);

  // Toggle location selection (multi-select)
  const toggleLocation = (locationId: string) => {
    if (selectedLocationIds.includes(locationId)) {
      setSelectedLocationIds(selectedLocationIds.filter(id => id !== locationId));
    } else {
      setSelectedLocationIds([...selectedLocationIds, locationId]);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter an exercise name');
      return;
    }

    if (selectedLocationIds.length === 0) {
      Alert.alert('Error', 'Please select at least one location');
      return;
    }

    if (isEditMode && existingExercise) {
      // Update existing exercise
      const updatedExercise: Exercise = {
        ...existingExercise,
        name: name.trim(),
        equipment,
        cableAccessory: equipment === 'cable' ? cableAccessory : undefined,
        locationIds: selectedLocationIds,
        primaryMuscleGroup: primaryMuscle,
        secondaryMuscleGroups: secondaryMuscles,
      };

      updateExercise(updatedExercise).then(() => {
        navigation.goBack();
      });
    } else {
      // Create new exercise
      const exercise: Exercise = {
        id: generateId(),
        name: name.trim(),
        equipment,
        cableAccessory: equipment === 'cable' ? cableAccessory : undefined,
        locationIds: selectedLocationIds,
        primaryMuscleGroup: primaryMuscle,
        secondaryMuscleGroups: secondaryMuscles,
        isCustom: true,
      };

      addExercise(exercise).then(() => {
        navigation.goBack();
      });
    }
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
        <Text style={styles.title}>{isEditMode ? 'Edit Exercise' : 'Add Exercise'}</Text>
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
            autoFocus={!isEditMode}
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
                onPress={() => {
                  setEquipment(option.value);
                  // Clear cable accessory when switching away from cable
                  if (option.value !== 'cable') {
                    setCableAccessory(undefined);
                  }
                }}
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

        {/* Cable Accessory - Only show when equipment is cable */}
        {equipment === 'cable' && (
          <Card style={styles.section}>
            <Text style={styles.label}>Cable Accessory (optional)</Text>
            <View style={styles.optionsRow}>
              {ALL_CABLE_ACCESSORIES.map(accessory => (
                <TouchableOpacity
                  key={accessory}
                  style={[
                    styles.option,
                    cableAccessory === accessory && styles.optionSelected,
                  ]}
                  onPress={() => setCableAccessory(cableAccessory === accessory ? undefined : accessory)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      cableAccessory === accessory && styles.optionTextSelected,
                    ]}
                  >
                    {CABLE_ACCESSORY_DISPLAY_NAMES[accessory]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        )}

        {/* Location - Multi-select */}
        <Card style={styles.section}>
          <Text style={styles.label}>Available At (select all that apply)</Text>
          <View style={styles.optionsRow}>
            {locations.sort((a, b) => a.sortOrder - b.sortOrder).map(loc => (
              <TouchableOpacity
                key={loc.id}
                style={[
                  styles.option,
                  selectedLocationIds.includes(loc.id) && styles.optionSelected,
                ]}
                onPress={() => toggleLocation(loc.id)}
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedLocationIds.includes(loc.id) && styles.optionTextSelected,
                  ]}
                >
                  {loc.name}
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
