import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { SearchBar, Button } from '../components/common';
import { useData } from '../contexts/DataContext';
import { useWorkout } from '../contexts/WorkoutContext';
import { Exercise, MUSCLE_GROUP_DISPLAY_NAMES } from '../types';
import { RootStackParamList } from '../navigation/types';

type ExercisePickerRouteProp = RouteProp<RootStackParamList, 'ExercisePicker'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function ExercisePickerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ExercisePickerRouteProp>();
  const { exercises } = useData();
  const { addExerciseToWorkout, setCurrentExercise, activeWorkout } = useWorkout();

  const [searchQuery, setSearchQuery] = useState('');

  // Helper to get primary muscles display
  const getPrimaryMusclesText = (exercise: Exercise): string => {
    if (exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0) {
      return exercise.primaryMuscleGroups.map(m => MUSCLE_GROUP_DISPLAY_NAMES[m]).join(', ');
    }
    return exercise.primaryMuscleGroup ? MUSCLE_GROUP_DISPLAY_NAMES[exercise.primaryMuscleGroup] : 'Unknown';
  };

  const filteredExercises = useMemo(() => {
    if (!searchQuery) return exercises;

    const query = searchQuery.toLowerCase();
    return exercises.filter(
      e =>
        e.name.toLowerCase().includes(query) ||
        getPrimaryMusclesText(e).toLowerCase().includes(query)
    );
  }, [exercises, searchQuery]);

  // Group by first primary muscle group
  const groupedExercises = useMemo(() => {
    const groups: { [key: string]: Exercise[] } = {};

    filteredExercises.forEach(exercise => {
      // Use first primary muscle for grouping
      const firstMuscle = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
        ? exercise.primaryMuscleGroups[0]
        : exercise.primaryMuscleGroup;
      const group = firstMuscle ? MUSCLE_GROUP_DISPLAY_NAMES[firstMuscle] : 'Unknown';
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(exercise);
    });

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredExercises]);

  const handleSelectExercise = (exercise: Exercise) => {
    addExerciseToWorkout(exercise.id);
    setCurrentExercise(exercise.id);
    navigation.goBack();
  };

  const renderExercise = ({ item: exercise }: { item: Exercise }) => {
    const isInWorkout = activeWorkout?.exerciseIds.includes(exercise.id);

    return (
      <TouchableOpacity
        style={styles.exerciseItem}
        onPress={() => handleSelectExercise(exercise)}
        activeOpacity={0.7}
      >
        <View style={styles.exerciseInfo}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <Text style={styles.exerciseDetail}>
            {getPrimaryMusclesText(exercise)} • {exercise.equipment}
          </Text>
        </View>
        {isInWorkout && (
          <Text style={styles.inWorkoutBadge}>In Workout</Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Exercise</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search exercises..."
          />
        </View>

        {/* Create Custom Exercise Button */}
        <TouchableOpacity
          style={styles.createCustomButton}
          onPress={() => navigation.navigate('AddExercise')}
          activeOpacity={0.7}
        >
          <Text style={styles.createCustomText}>+ Create Custom Exercise</Text>
        </TouchableOpacity>

        {/* Exercise List */}
        <FlatList
          data={filteredExercises}
          keyExtractor={item => item.id}
          renderItem={renderExercise}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  cancelText: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  placeholder: {
    width: 50,
  },
  searchContainer: {
    padding: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingVertical: spacing.sm,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    borderRadius: borderRadius.md,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  exerciseDetail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inWorkoutBadge: {
    fontSize: typography.size.xs,
    color: colors.success,
    fontWeight: typography.weight.medium,
  },
  separator: {
    height: spacing.sm,
  },
  createCustomButton: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  createCustomText: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
});

export default ExercisePickerScreen;
