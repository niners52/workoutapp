import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { SearchBar } from '../components/common';
import { useData } from '../contexts/DataContext';
import { Exercise, MUSCLE_GROUP_DISPLAY_NAMES, CABLE_ACCESSORY_DISPLAY_NAMES } from '../types';
import { RootStackParamList } from '../navigation/types';

type MergeExercisePickerRouteProp = RouteProp<RootStackParamList, 'MergeExercisePicker'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function MergeExercisePickerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<MergeExercisePickerRouteProp>();
  const { sourceExerciseId } = route.params;
  const { exercises, sets, mergeExercise } = useData();

  const [searchQuery, setSearchQuery] = useState('');

  const sourceExercise = exercises.find(e => e.id === sourceExerciseId);

  const sourceSetCount = useMemo(() => {
    return sets.filter(s => s.exerciseId === sourceExerciseId).length;
  }, [sets, sourceExerciseId]);

  const getPrimaryMusclesText = (exercise: Exercise): string => {
    if (exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0) {
      return exercise.primaryMuscleGroups.map(m => MUSCLE_GROUP_DISPLAY_NAMES[m]).join(', ');
    }
    return exercise.primaryMuscleGroup ? MUSCLE_GROUP_DISPLAY_NAMES[exercise.primaryMuscleGroup] : 'Unknown';
  };

  const filteredExercises = useMemo(() => {
    let result = exercises.filter(e => e.id !== sourceExerciseId);

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        e =>
          e.name.toLowerCase().includes(query) ||
          getPrimaryMusclesText(e).toLowerCase().includes(query)
      );
    }

    return result;
  }, [exercises, sourceExerciseId, searchQuery]);

  const handleSelectKeeper = (keeper: Exercise) => {
    const setsText = sourceSetCount === 1 ? '1 set' : `${sourceSetCount} sets`;

    Alert.alert(
      'Merge Exercises',
      `Merge "${sourceExercise?.name}" into "${keeper.name}"? All ${setsText} from "${sourceExercise?.name}" will be moved. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          style: 'destructive',
          onPress: async () => {
            await mergeExercise(sourceExerciseId, keeper.id);
            navigation.popToTop();
          },
        },
      ]
    );
  };

  const renderExercise = ({ item: exercise }: { item: Exercise }) => {
    let equipmentText: string = exercise.equipment;
    if (exercise.equipment === 'cable' && exercise.cableAccessory) {
      equipmentText = `Cable (${CABLE_ACCESSORY_DISPLAY_NAMES[exercise.cableAccessory]})`;
    }

    return (
      <TouchableOpacity
        style={styles.exerciseItem}
        onPress={() => handleSelectKeeper(exercise)}
        activeOpacity={0.7}
      >
        <View style={styles.exerciseInfo}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <Text style={styles.exerciseDetail}>
            {getPrimaryMusclesText(exercise)} · {equipmentText}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Merge Into...</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Source info */}
        <View style={styles.sourceInfo}>
          <Text style={styles.sourceLabel}>
            Merging "{sourceExercise?.name}" ({sourceSetCount} sets)
          </Text>
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
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      </KeyboardAvoidingView>
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
  sourceInfo: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  sourceLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  searchContainer: {
    padding: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
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
  separator: {
    height: spacing.sm,
  },
});

export default MergeExercisePickerScreen;
