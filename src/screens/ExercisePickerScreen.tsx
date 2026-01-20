import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { SearchBar, Button } from '../components/common';
import { useData } from '../contexts/DataContext';
import { useWorkout } from '../contexts/WorkoutContext';
import { Exercise, MUSCLE_GROUP_DISPLAY_NAMES } from '../types';
import { RootStackParamList } from '../navigation/types';

type ExercisePickerRouteProp = RouteProp<RootStackParamList, 'ExercisePicker'>;

export function ExercisePickerScreen() {
  const navigation = useNavigation();
  const route = useRoute<ExercisePickerRouteProp>();
  const { exercises } = useData();
  const { addExerciseToWorkout, setCurrentExercise, activeWorkout } = useWorkout();

  const [searchQuery, setSearchQuery] = useState('');

  const filteredExercises = useMemo(() => {
    if (!searchQuery) return exercises;

    const query = searchQuery.toLowerCase();
    return exercises.filter(
      e =>
        e.name.toLowerCase().includes(query) ||
        MUSCLE_GROUP_DISPLAY_NAMES[e.primaryMuscleGroup].toLowerCase().includes(query)
    );
  }, [exercises, searchQuery]);

  // Group by muscle group
  const groupedExercises = useMemo(() => {
    const groups: { [key: string]: Exercise[] } = {};

    filteredExercises.forEach(exercise => {
      const group = MUSCLE_GROUP_DISPLAY_NAMES[exercise.primaryMuscleGroup];
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
            {MUSCLE_GROUP_DISPLAY_NAMES[exercise.primaryMuscleGroup]} • {exercise.equipment}
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
});

export default ExercisePickerScreen;
