import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { SearchBar, Button } from '../components/common';
import { useWorkoutBarPadding } from '../components/workout';
import { useData } from '../contexts/DataContext';
import {
  Exercise,
  Equipment,
  MUSCLE_GROUP_DISPLAY_NAMES,
  PrimaryMuscleGroup,
  ALL_TRACKABLE_MUSCLE_GROUPS,
  CABLE_ACCESSORY_DISPLAY_NAMES,
  MACHINE_WEIGHT_TYPE_DISPLAY_NAMES,
  EQUIPMENT_DISPLAY_NAMES,
  WorkoutSet,
} from '../types';
import { RootStackParamList } from '../navigation/types';
import { getExercisePRSummaries, ExercisePRs } from '../services/personalRecords';
import { getSets } from '../services/storage';
import { matchesAllWords } from '../utils/search';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface ExerciseSection {
  title: string;
  data: Exercise[];
}

export function ExercisesScreen({ embedded }: { embedded?: boolean }) {
  const navigation = useNavigation<NavigationProp>();
  const { exercises, workouts, deleteExercise, sets } = useData();
  const workoutBarPadding = useWorkoutBarPadding();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<PrimaryMuscleGroup | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [prSummaries, setPrSummaries] = useState<Map<string, ExercisePRs>>(new Map());

  // Build workoutDates map for PR calculation
  const workoutDates = useMemo(() => {
    const map = new Map<string, string>();
    workouts.forEach(w => {
      map.set(w.id, w.completedAt || w.startedAt);
    });
    return map;
  }, [workouts]);

  // Load PR summaries for all exercises
  useEffect(() => {
    const loadPRs = async () => {
      const allSets = await getSets();
      const exerciseIds = exercises.map(e => e.id);
      const summaries = getExercisePRSummaries(exerciseIds, allSets, workoutDates);
      setPrSummaries(summaries);
    };
    loadPRs();
  }, [exercises, workoutDates]);

  // Calculate set counts per exercise for identifying duplicates
  const exerciseSetCounts = useMemo(() => {
    const counts = new Map<string, number>();
    sets.forEach(set => {
      counts.set(set.exerciseId, (counts.get(set.exerciseId) || 0) + 1);
    });
    return counts;
  }, [sets]);

  // Most recent loggedAt per exercise — powers the "last performed" label and
  // the staleness sort, so unused exercises are easy to spot and delete.
  const lastPerformed = useMemo(() => {
    const map = new Map<string, number>(); // exerciseId -> epoch ms
    sets.forEach(set => {
      const t = new Date(set.loggedAt).getTime();
      if (!Number.isFinite(t)) return;
      const prev = map.get(set.exerciseId);
      if (prev === undefined || t > prev) map.set(set.exerciseId, t);
    });
    return map;
  }, [sets]);

  type SortMode = 'muscle' | 'stale' | 'recent';
  const [sortMode, setSortMode] = useState<SortMode>('muscle');

  // Find exercises with duplicate names
  const duplicateNames = useMemo(() => {
    const nameCounts = new Map<string, number>();
    exercises.forEach(e => {
      const name = e.name.toLowerCase();
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    });
    const duplicates = new Set<string>();
    nameCounts.forEach((count, name) => {
      if (count > 1) duplicates.add(name);
    });
    return duplicates;
  }, [exercises]);

  // Helper to get primary muscles display
  const getPrimaryMusclesText = (exercise: Exercise): string => {
    if (exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0) {
      return exercise.primaryMuscleGroups.map(m => MUSCLE_GROUP_DISPLAY_NAMES[m]).join(', ');
    }
    return exercise.primaryMuscleGroup ? MUSCLE_GROUP_DISPLAY_NAMES[exercise.primaryMuscleGroup] : 'Unknown';
  };

  // Helper to format equipment details with accessories/weight type
  const getEquipmentText = (exercise: Exercise): string => {
    const equipmentName = EQUIPMENT_DISPLAY_NAMES[exercise.equipment];

    // Add cable accessory if applicable
    if (exercise.equipment === 'cable' && exercise.cableAccessory) {
      return `${equipmentName} - ${CABLE_ACCESSORY_DISPLAY_NAMES[exercise.cableAccessory]}`;
    }

    // Add machine weight type if applicable
    if (exercise.equipment === 'machine' && exercise.machineWeightType) {
      return `${equipmentName} - ${MACHINE_WEIGHT_TYPE_DISPLAY_NAMES[exercise.machineWeightType]}`;
    }

    return equipmentName;
  };

  const filteredExercises = useMemo(() => {
    let result = exercises;

    // Filter by selected muscle group
    if (selectedMuscle) {
      result = result.filter(e => {
        const muscles = e.primaryMuscleGroups || (e.primaryMuscleGroup ? [e.primaryMuscleGroup] : []);
        return muscles.includes(selectedMuscle);
      });
    }

    // Filter by selected equipment
    if (selectedEquipment) {
      result = result.filter(e => e.equipment === selectedEquipment);
    }

    // Filter by search query — every word must appear somewhere across the
    // exercise's name / muscles / equipment ("cable fly" matches
    // "High to Low Cable Fly").
    if (searchQuery) {
      result = result.filter(e =>
        matchesAllWords(
          `${e.name} ${e.baseName ?? ''} ${getPrimaryMusclesText(e)} ${getEquipmentText(e)}`,
          searchQuery,
        )
      );
    }

    return result;
  }, [exercises, searchQuery, selectedMuscle, selectedEquipment]);

  // Group by first primary muscle group — or a single flat list when sorting
  // by last-performed (cleanup mode).
  const sections: ExerciseSection[] = useMemo(() => {
    if (sortMode !== 'muscle') {
      const sorted = [...filteredExercises].sort((a, b) => {
        // Never-performed sits at the "stale" extreme (0), so 'stale' puts it first
        const ta = lastPerformed.get(a.id) ?? 0;
        const tb = lastPerformed.get(b.id) ?? 0;
        return sortMode === 'stale' ? ta - tb : tb - ta;
      });
      return [{
        title: sortMode === 'stale' ? 'Least Recently Performed' : 'Most Recently Performed',
        data: sorted,
      }];
    }

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
  }, [filteredExercises, sortMode, lastPerformed]);

  const handleExercisePress = useCallback((exercise: Exercise) => {
    navigation.navigate('ExerciseDetail', { exerciseId: exercise.id });
  }, [navigation]);

  const handleAddExercise = useCallback(() => {
    navigation.navigate('AddExercise');
  }, [navigation]);

  const handleLongPress = useCallback((exercise: Exercise) => {
    Alert.alert(
      exercise.name,
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Exercise',
          style: 'destructive',
          onPress: () => {
            // Show confirmation dialog
            Alert.alert(
              'Delete Exercise',
              `Are you sure you want to delete "${exercise.name}"? It will be removed from all templates. Historical workout data will be preserved.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteExercise(exercise.id);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [deleteExercise]);

  // Fixed heights for getItemLayout
  const ITEM_HEIGHT = 62; // exerciseItem height
  const SECTION_HEADER_HEIGHT = 38; // sectionHeader height

  const renderExercise = useCallback(({ item: exercise }: { item: Exercise }) => {
    const exercisePRs = prSummaries.get(exercise.id);
    const hasPR = exercisePRs && (exercisePRs.weightPR || exercisePRs.e1rmPR);
    const setCount = exerciseSetCounts.get(exercise.id) || 0;
    const isDuplicate = duplicateNames.has(exercise.name.toLowerCase());
    const lastMs = lastPerformed.get(exercise.id);
    const lastLabel = lastMs
      ? `${formatDistanceToNowStrict(new Date(lastMs), { addSuffix: true })}`
      : 'Never';

    return (
      <TouchableOpacity
        style={styles.exerciseItem}
        onPress={() => handleExercisePress(exercise)}
        onLongPress={() => handleLongPress(exercise)}
        activeOpacity={0.7}
        delayLongPress={500}
      >
        <View style={styles.exerciseInfo}>
          <View style={styles.exerciseNameRow}>
            <Text style={styles.exerciseName}>{exercise.name}</Text>
            {hasPR && (
              <Text style={styles.prBadge}>PR</Text>
            )}
          </View>
          <Text style={styles.exerciseDetail}>
            {getEquipmentText(exercise)} | {getPrimaryMusclesText(exercise)}
          </Text>
          <Text style={[styles.lastPerformed, !lastMs && styles.lastPerformedNever]}>
            {lastLabel}
          </Text>
          {isDuplicate && (
            <Text style={styles.duplicateSubtitle}>
              {setCount > 0 ? `${setCount} sets logged` : 'No sets logged'}
            </Text>
          )}
        </View>
        {exercise.isCustom && (
          <Text style={styles.customBadge}>Custom</Text>
        )}
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  }, [handleExercisePress, handleLongPress, prSummaries, exerciseSetCounts, duplicateNames, lastPerformed]);

  const renderSectionHeader = useCallback(({ section }: { section: ExerciseSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>{section.data.length}</Text>
    </View>
  ), []);

  const content = (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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

      {/* Muscle Group Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          style={[styles.filterChip, !selectedMuscle && styles.filterChipSelected]}
          onPress={() => setSelectedMuscle(null)}
        >
          <Text style={[styles.filterChipText, !selectedMuscle && styles.filterChipTextSelected]}>
            All
          </Text>
        </TouchableOpacity>
        {ALL_TRACKABLE_MUSCLE_GROUPS.map(muscle => (
          <TouchableOpacity
            key={muscle}
            style={[styles.filterChip, selectedMuscle === muscle && styles.filterChipSelected]}
            onPress={() => setSelectedMuscle(selectedMuscle === muscle ? null : muscle)}
          >
            <Text style={[styles.filterChipText, selectedMuscle === muscle && styles.filterChipTextSelected]}>
              {MUSCLE_GROUP_DISPLAY_NAMES[muscle]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Equipment Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          style={[styles.filterChip, !selectedEquipment && styles.filterChipSelected]}
          onPress={() => setSelectedEquipment(null)}
        >
          <Text style={[styles.filterChipText, !selectedEquipment && styles.filterChipTextSelected]}>
            All Equipment
          </Text>
        </TouchableOpacity>
        {(Object.keys(EQUIPMENT_DISPLAY_NAMES) as Equipment[]).map(eq => (
          <TouchableOpacity
            key={eq}
            style={[styles.filterChip, selectedEquipment === eq && styles.filterChipSelected]}
            onPress={() => setSelectedEquipment(selectedEquipment === eq ? null : eq)}
          >
            <Text style={[styles.filterChipText, selectedEquipment === eq && styles.filterChipTextSelected]}>
              {EQUIPMENT_DISPLAY_NAMES[eq]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sort */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {([
          { key: 'muscle' as const, label: 'By Muscle' },
          { key: 'stale' as const, label: 'Least Recent' },
          { key: 'recent' as const, label: 'Most Recent' },
        ]).map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.filterChip, sortMode === opt.key && styles.filterChipSelected]}
            onPress={() => setSortMode(opt.key)}
          >
            <Text style={[styles.filterChipText, sortMode === opt.key && styles.filterChipTextSelected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Exercise List */}
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={renderExercise}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: spacing.xl + workoutBarPadding }]}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={10}
        removeClippedSubviews={true}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </KeyboardAvoidingView>
  );

  if (embedded) return content;

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      {content}
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
    paddingBottom: spacing.sm,
  },
  filterContainer: {
    marginBottom: spacing.sm,
  },
  filterContent: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
    height: 36,
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  filterChipTextSelected: {
    color: colors.text,
    fontWeight: typography.weight.medium,
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
  exerciseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  exerciseName: {
    fontSize: typography.size.md,
    color: colors.text,
  },
  prBadge: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.warning,
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  exerciseDetail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  lastPerformed: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  lastPerformedNever: {
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  duplicateSubtitle: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
    fontStyle: 'italic',
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
