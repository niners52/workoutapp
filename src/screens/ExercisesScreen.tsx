import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { SearchBar, Button } from '../components/common';
import { useData } from '../contexts/DataContext';
import { Exercise, MUSCLE_GROUP_DISPLAY_NAMES, PrimaryMuscleGroup } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface ExerciseSection {
  title: string;
  data: Exercise[];
}

export function ExercisesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { exercises } = useData();
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
        getPrimaryMusclesText(e).toLowerCase().includes(query) ||
        e.equipment.toLowerCase().includes(query)
    );
  }, [exercises, searchQuery]);

  // Group by first primary muscle group
  const sections: ExerciseSection[] = useMemo(() => {
    const groups: { [key: string]: Exercise[] } = {};

    filteredExercises.forEach(exercise => {
      // Use first primary muscle for grouping
      const firstMuscle = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
        ? exercise.primaryMuscleGroups[0]
        : exercise.primaryMuscleGroup;
      const groupName = firstMuscle ? MUSCLE_GROUP_DISPLAY_NAMES[firstMuscle] : 'Unknown';
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(exercise);
    });

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({
        title,
        data: data.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [filteredExercises]);

  const handleExercisePress = (exercise: Exercise) => {
    navigation.navigate('ExerciseDetail', { exerciseId: exercise.id });
  };

  const handleAddExercise = () => {
    navigation.navigate('AddExercise');
  };

  const renderExercise = ({ item: exercise }: { item: Exercise }) => (
    <TouchableOpacity
      style={styles.exerciseItem}
      onPress={() => handleExercisePress(exercise)}
      activeOpacity={0.7}
    >
      <View style={styles.exerciseInfo}>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        <Text style={styles.exerciseDetail}>
          {exercise.equipment} • {exercise.location === 'both' ? 'Gym & Home' : exercise.location}
        </Text>
      </View>
      {exercise.isCustom && (
        <Text style={styles.customBadge}>Custom</Text>
      )}
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const renderSectionHeader = ({ section }: { section: ExerciseSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>{section.data.length}</Text>
    </View>
  );

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Exercises</Text>
          <TouchableOpacity onPress={handleAddExercise}>
            <Text style={styles.addText}>+ Add</Text>
          </TouchableOpacity>
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
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderExercise}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.listContent}
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
  },
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  addText: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: typography.size.md,
    color: colors.text,
  },
  exerciseDetail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  customBadge: {
    fontSize: typography.size.xs,
    color: colors.primary,
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  chevron: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
  },
});

export default ExercisesScreen;
