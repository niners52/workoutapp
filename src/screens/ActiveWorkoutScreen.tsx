import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Platform,
  Animated,
  Switch,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, startOfWeek } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card, NumberInput, SearchBar } from '../components/common';
import { useData } from '../contexts/DataContext';
import { useWorkout } from '../contexts/WorkoutContext';
import { getLastWorkoutForExercise } from '../services/workoutService';
import { WorkoutSet, Exercise, Equipment, MUSCLE_GROUP_DISPLAY_NAMES, WorkoutLocation, EQUIPMENT_DISPLAY_NAMES, CABLE_ACCESSORY_DISPLAY_NAMES, UnitSystem } from '../types';
import { RootStackParamList } from '../navigation/types';
import { formatWeight, formatWeightValue, weightUnit, weightIncrement, inputToLbs, displayWeight } from '../services/units';
import { checkForMilestone, formatMilestoneLabel, milestoneEmoji, PRCheckResult, formatPRLabel } from '../services/personalRecords';
import { getExerciseFatigueWarnings, ExerciseFatigueSignal } from '../services/fatigueDetection';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Cross-platform alert helper
const showAlert = (
  title: string,
  message: string,
  buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[]
) => {
  if (Platform.OS === 'web') {
    const confirmed = window.confirm(`${title}\n\n${message}`);
    if (confirmed) {
      const confirmButton = buttons.find(b => b.style !== 'cancel');
      confirmButton?.onPress?.();
    }
  } else {
    Alert.alert(title, message, buttons);
  }
};

interface ExerciseHistory {
  exerciseId: string;
  sets: WorkoutSet[];
  date: string | null;
}

export function ActiveWorkoutScreen({ embedded }: { embedded?: boolean } = {}) {
  const navigation = useNavigation<NavigationProp>();
  const { exercises, templates, userSettings, locations, workouts, sets, getActiveRoutine, updateExercise } = useData();
  const {
    activeWorkout,
    isWorkoutActive,
    restTimer,
    logSet,
    removeSet,
    finishWorkout,
    cancelWorkout,
    startRestTimer,
    stopRestTimer,
    getSetsForExercise,
    addExerciseToWorkout,
    removeExerciseFromWorkout,
    swapExercise,
    reorderExercises,
  } = useWorkout();

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [reps, setReps] = useState(8);
  const [weight, setWeight] = useState(0);
  const [exerciseHistories, setExerciseHistories] = useState<Record<string, ExerciseHistory>>({});
  const [restTimerModalVisible, setRestTimerModalVisible] = useState(false);
  const [customRestTime, setCustomRestTime] = useState(userSettings?.restTimerSeconds || 90);
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [exerciseToSwap, setExerciseToSwap] = useState<Exercise | null>(null);
  const [swapSearchQuery, setSwapSearchQuery] = useState('');
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [suggestModalVisible, setSuggestModalVisible] = useState(false);
  const [suggestStep, setSuggestStep] = useState<'location' | 'exercises'>('location');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [prCelebration, setPrCelebration] = useState<{ exerciseId: string; emoji: string; label: string } | null>(null);
  const prAnimValue = useRef(new Animated.Value(0)).current;
  const [sessionPRs, setSessionPRs] = useState<Map<string, { prResult: PRCheckResult; isMilestone: boolean; milestoneLabel?: string }>>(new Map());
  const [fatigueWarnings, setFatigueWarnings] = useState<Map<string, ExerciseFatigueSignal>>(new Map());

  // Edit exercise modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [editName, setEditName] = useState('');
  const [editUnilateral, setEditUnilateral] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editTargetSets, setEditTargetSets] = useState(3);
  const [editTargetSetsPermanent, setEditTargetSetsPermanent] = useState(false);
  // Brief "Saved" toast shown after a successful exercise edit so the user knows
  // the write went through (the modal closes immediately, otherwise no feedback).
  const [editSavedToast, setEditSavedToast] = useState(false);
  const [editEquipment, setEditEquipment] = useState<Equipment>('barbell');
  // Per-exercise target set overrides for this workout only
  const [targetSetOverrides, setTargetSetOverrides] = useState<Record<string, number>>({});

  // Get units from settings
  const units = userSettings?.units || 'imperial';

  // Load history for all exercises when workout starts
  useEffect(() => {
    const loadHistories = async () => {
      if (!activeWorkout) return;

      // When NOT on deload, exclude deload workouts so "last time" shows normal sessions
      // When ON deload, also exclude deload workouts so we show what to base deload % on
      const deloadWorkoutIds = new Set(
        workouts.filter(w => w.isDeload).map(w => w.id)
      );

      const histories: Record<string, ExerciseHistory> = {};
      for (const exerciseId of activeWorkout.exerciseIds) {
        const lastWorkout = await getLastWorkoutForExercise(
          exerciseId,
          deloadWorkoutIds.size > 0 ? deloadWorkoutIds : undefined
        );
        histories[exerciseId] = {
          exerciseId,
          sets: lastWorkout?.sets || [],
          date: lastWorkout?.date || null,
        };
      }
      setExerciseHistories(histories);

      // Compute fatigue warnings for exercises in this workout
      if (userSettings.fatigueDetectionEnabled !== false && !userSettings.isOnDeload) {
        const warnings = getExerciseFatigueWarnings(
          activeWorkout.exerciseIds,
          workouts, sets, exercises, userSettings
        );
        setFatigueWarnings(warnings);
      }
    };

    loadHistories();
  }, [activeWorkout?.exerciseIds.length]);

  // Initialize weight/reps when selecting exercise or after logging a set
  // Priority: 1) Last set logged THIS session, 2) History from previous sessions
  useEffect(() => {
    if (!selectedExerciseId) return;

    // First check if there are sets logged for this exercise in the current workout
    const currentSets = getSetsForExercise(selectedExerciseId);
    if (currentSets.length > 0) {
      // Use the most recently logged set from this session
      const lastSet = currentSets[currentSets.length - 1];
      setWeight(lastSet.weight);
      setReps(lastSet.reps);
      return;
    }

    // Fall back to history from previous sessions
    const history = exerciseHistories[selectedExerciseId];
    if (history && history.sets.length > 0) {
      let suggestedWeight = history.sets[0].weight;
      if (userSettings?.isOnDeload) {
        const pct = (userSettings.deloadPercentage ?? 50) / 100;
        suggestedWeight = Math.round((suggestedWeight * pct) / 5) * 5 || suggestedWeight * pct;
      }
      setWeight(suggestedWeight);
      setReps(history.sets[0].reps);
    }
  }, [selectedExerciseId, exerciseHistories, activeWorkout?.sets.length]);

  if (!isWorkoutActive || !activeWorkout) {
    if (embedded) return null;
    return (
      <SafeAreaView style={commonStyles.safeArea}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No active workout</Text>
          <Button
            title="Start Workout"
            onPress={() => navigation.navigate('StartWorkout')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const template = activeWorkout.workout.templateId
    ? templates.find(t => t.id === activeWorkout.workout.templateId)
    : null;

  // Build workoutDates map for PR calculation
  const workoutDates = new Map<string, string>();
  workouts.forEach(w => {
    workoutDates.set(w.id, w.completedAt || w.startedAt);
  });

  const showMilestoneCelebration = (exerciseId: string, milestoneResult: { reason: any; prResult: PRCheckResult }) => {
    const label = milestoneResult.reason
      ? formatMilestoneLabel(milestoneResult.reason, units)
      : 'New PR!';
    const emoji = milestoneResult.reason
      ? milestoneEmoji(milestoneResult.reason)
      : '🎉';

    setPrCelebration({ exerciseId, emoji, label });

    // Animate in
    Animated.sequence([
      Animated.timing(prAnimValue, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(prAnimValue, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      setPrCelebration(null);
    });
  };

  const handleLogSet = async () => {
    if (!selectedExerciseId) return;

    // Check for milestone/PR before logging (compare against all previous sets,
    // including sets already logged in the current active workout — DataContext's
    // `sets` is only refreshed on app load, so it doesn't include the in-progress workout)
    const currentWorkoutSets = activeWorkout.sets ?? [];
    const previousSetsForPRCheck = [
      ...sets.filter(s => s.workoutId !== activeWorkout.workout.id && s.exerciseId === selectedExerciseId),
      ...currentWorkoutSets.filter(s => s.exerciseId === selectedExerciseId),
    ];
    const milestoneResult = checkForMilestone(
      { exerciseId: selectedExerciseId, weight, reps, workoutId: activeWorkout.workout.id },
      previousSetsForPRCheck,
      workoutDates,
      units
    );

    // Compute expected set count before async logSet (state may not update immediately)
    const currentExercise = exercises.find(e => e.id === selectedExerciseId);
    const baseTarget = userSettings?.defaultTargetSets ?? 3;
    const targetSets =
      targetSetOverrides[selectedExerciseId]
      ?? currentExercise?.targetSets
      ?? (currentExercise?.isUnilateral ? baseTarget * 2 : baseTarget);
    const currentSetCount = getSetsForExercise(selectedExerciseId).length;
    const willComplete = currentSetCount + 1 >= targetSets;
    const exerciseToMove = selectedExerciseId;

    await logSet(reps, weight, selectedExerciseId);

    // Track PR in session map (keyed by set ID for badge display)
    if (milestoneResult.prResult.isPR) {
      const updatedSets = getSetsForExercise(selectedExerciseId);
      const newSetId = updatedSets[updatedSets.length - 1]?.id;
      if (newSetId) {
        setSessionPRs(prev => new Map(prev).set(newSetId, {
          prResult: milestoneResult.prResult,
          isMilestone: milestoneResult.isMilestone,
          milestoneLabel: milestoneResult.reason
            ? formatMilestoneLabel(milestoneResult.reason, units)
            : undefined,
        }));
      }

      // Only show animated celebration for milestones
      if (milestoneResult.isMilestone && userSettings?.milestoneCelebrationsEnabled !== false) {
        showMilestoneCelebration(selectedExerciseId, milestoneResult);
      }
    }

    // Auto-reorder: move completed exercise to bottom if setting enabled
    if (willComplete && userSettings?.moveCompletedToBottom !== false) {
      const newOrder = activeWorkout.exerciseIds.filter(id => id !== exerciseToMove);
      newOrder.push(exerciseToMove);
      reorderExercises(newOrder);

      // Auto-advance to next incomplete exercise
      const nextIncomplete = newOrder.find(id => {
        const setCount = getSetsForExercise(id).length;
        // The exercise we just logged won't have the new set yet, so adjust
        const adjusted = id === exerciseToMove ? setCount + 1 : setCount;
        const ex = exercises.find(e => e.id === id);
        const exTarget =
          targetSetOverrides[id]
          ?? ex?.targetSets
          ?? (ex?.isUnilateral ? baseTarget * 2 : baseTarget);
        return adjusted < exTarget;
      });
      if (nextIncomplete) {
        toggleExercise(nextIncomplete);
      }
    }

    // The rest timer will start automatically from logSet
  };

  const handleDeleteSet = (setId: string) => {
    showAlert(
      'Delete Set',
      'Are you sure you want to delete this set?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeSet(setId),
        },
      ]
    );
  };

  const handleFinishWorkout = () => {
    const minSets = userSettings?.minimumSetsPerExercise ?? 3;

    // Check for exercises below minimum sets
    const incompleteExercises = activeWorkout.exerciseIds
      .map(id => {
        const exercise = exercises.find(e => e.id === id);
        const setsLogged = getSetsForExercise(id).length;
        return { exercise, setsLogged };
      })
      .filter(item => item.exercise && item.setsLogged > 0 && item.setsLogged < minSets);

    const doFinish = async () => {
      // Calculate muscle group breakdown before finishing
      const muscleGroupSetsMap = new Map<string, { sets: number; isSecondary: boolean }>();

      activeWorkout.sets.forEach(set => {
        const exercise = exercises.find(e => e.id === set.exerciseId);
        if (!exercise) return;

        // Primary muscle groups
        const primaryMuscleGroups = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
          ? exercise.primaryMuscleGroups
          : exercise.primaryMuscleGroup
          ? [exercise.primaryMuscleGroup]
          : [];

        primaryMuscleGroups.forEach(mg => {
          const existing = muscleGroupSetsMap.get(mg);
          muscleGroupSetsMap.set(mg, {
            sets: (existing?.sets || 0) + 1,
            isSecondary: false,
          });
        });

        // Secondary muscle groups
        (exercise.secondaryMuscleGroups || []).forEach(mg => {
          const existing = muscleGroupSetsMap.get(mg);
          // Only add as secondary if not already primary
          if (!existing || existing.isSecondary) {
            muscleGroupSetsMap.set(mg, {
              sets: (existing?.sets || 0) + 1,
              isSecondary: true,
            });
          }
        });
      });

      const muscleGroupSets = Array.from(muscleGroupSetsMap.entries())
        .map(([muscleGroup, data]) => ({
          muscleGroup,
          sets: data.sets,
          isSecondary: data.isSecondary,
        }))
        .sort((a, b) => {
          // Primary first, then by sets descending
          if (a.isSecondary !== b.isSecondary) {
            return a.isSecondary ? 1 : -1;
          }
          return b.sets - a.sets;
        });

      // Track skipped exercises (template exercises with zero logged sets)
      const loggedExerciseIds = new Set(activeWorkout.sets.map(s => s.exerciseId));
      const skippedExerciseIds = activeWorkout.workout.templateId
        ? activeWorkout.exerciseIds.filter(id => !loggedExerciseIds.has(id))
        : [];

      const startedAt = activeWorkout.workout.startedAt;
      const completedAt = new Date().toISOString();
      const totalSets = activeWorkout.sets.length;

      // Serialize session PRs for navigation
      const sessionPRsForSummary = Array.from(sessionPRs.entries()).map(([setId, data]) => ({
        setId,
        exerciseId: activeWorkout.sets.find(s => s.id === setId)?.exerciseId || '',
        prTypes: data.prResult.records.map(r => r.type),
        isMilestone: data.isMilestone,
        milestoneLabel: data.milestoneLabel,
      })).filter(pr => pr.exerciseId);

      await finishWorkout(skippedExerciseIds);

      if (embedded) {
        navigation.navigate('WorkoutSummary', {
          workoutId: activeWorkout.workout.id,
          startedAt,
          completedAt,
          totalSets,
          muscleGroupSets,
          sessionPRs: sessionPRsForSummary.length > 0 ? sessionPRsForSummary : undefined,
        });
      } else {
        navigation.replace('WorkoutSummary', {
          workoutId: activeWorkout.workout.id,
          startedAt,
          completedAt,
          totalSets,
          muscleGroupSets,
          sessionPRs: sessionPRsForSummary.length > 0 ? sessionPRsForSummary : undefined,
        });
      }
    };

    // Show warning if any exercises are below minimum
    if (incompleteExercises.length > 0) {
      const exerciseList = incompleteExercises
        .map(item => `• ${item.exercise!.name}: ${item.setsLogged} set${item.setsLogged !== 1 ? 's' : ''}`)
        .join('\n');

      showAlert(
        'Incomplete Exercises',
        `The following exercises have fewer than ${minSets} sets:\n\n${exerciseList}\n\nFinish anyway?`,
        [
          { text: 'Keep Going', style: 'cancel' },
          { text: 'Finish Anyway', onPress: doFinish },
        ]
      );
    } else {
      showAlert(
        'Finish Workout',
        'Are you sure you want to finish this workout?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Finish', onPress: doFinish },
        ]
      );
    }
  };

  const handleCancelWorkout = () => {
    showAlert(
      'Cancel Workout',
      'Your progress will be saved but the workout won\'t be marked as complete.',
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'Cancel Workout',
          style: 'destructive',
          onPress: async () => {
            await cancelWorkout();
            if (!embedded) {
              navigation.goBack();
            }
          },
        },
      ]
    );
  };

  const handleAddExercise = () => {
    navigation.navigate('ExercisePicker', {
      workoutId: activeWorkout.workout.id,
    });
  };

  const handleOpenSuggestModal = () => {
    setSuggestStep('location');
    setSelectedLocationId(null);
    setSuggestModalVisible(true);
  };

  const handleSelectLocation = (locationId: string) => {
    setSelectedLocationId(locationId);
    setSuggestStep('exercises');
  };

  const handleAddSuggestedExercise = async (exerciseId: string) => {
    await addExerciseToWorkout(exerciseId);
    // Keep modal open so user can add more exercises
  };

  // Get exercises for selected location
  const getExercisesForLocation = (locationId: string): Exercise[] => {
    return exercises.filter(exercise => {
      return exercise.locationIds?.includes(locationId);
    }).sort((a, b) => a.name.localeCompare(b.name));
  };

  const handleOpenSwapModal = (exercise: Exercise) => {
    setExerciseToSwap(exercise);
    setSwapSearchQuery('');
    setShowAllExercises(false);
    setSwapModalVisible(true);
  };

  const handleOpenEditModal = (exercise: Exercise) => {
    const baseTarget = userSettings?.defaultTargetSets ?? 3;
    const currentOverride = targetSetOverrides[exercise.id];
    const persistentTarget = exercise.targetSets;
    const effectiveTarget =
      currentOverride
      ?? persistentTarget
      ?? (exercise.isUnilateral ? baseTarget * 2 : baseTarget);
    setEditingExercise(exercise);
    setEditName(exercise.name);
    setEditUnilateral(exercise.isUnilateral ?? false);
    setEditNotes(exercise.notes ?? '');
    setEditTargetSets(effectiveTarget);
    // Default to PERSISTENT save — when a user edits an exercise they almost always
    // want the change to stick across future workouts. Session-only is the opt-out.
    setEditTargetSetsPermanent(true);
    setEditEquipment(exercise.equipment);
    setEditModalVisible(true);
  };

  const handleSaveExerciseEdit = async () => {
    if (!editingExercise) return;
    const baseTarget = userSettings?.defaultTargetSets ?? 3;

    // Determine if any field changed
    const trimmedName = editName.trim();
    const nameChanged = trimmedName.length > 0 && trimmedName !== editingExercise.name;
    const unilateralChanged = editUnilateral !== (editingExercise.isUnilateral ?? false);
    const notesChanged = (editNotes.trim() || undefined) !== (editingExercise.notes || undefined);
    const equipmentChanged = editEquipment !== editingExercise.equipment;

    // The "natural" default for this exercise given its (possibly just-toggled) unilateral state.
    // When the chosen target equals this, we store `undefined` so the exercise falls back to the
    // global default and tracks any future change to UserSettings.defaultTargetSets.
    const defaultForNewUnilateral = editUnilateral ? baseTarget * 2 : baseTarget;

    // If the user picked "permanent", roll the target-sets change into the same updateExercise call.
    const newTargetSets = editTargetSetsPermanent
      ? (editTargetSets === defaultForNewUnilateral ? undefined : editTargetSets)
      : editingExercise.targetSets;
    const targetSetsChanged =
      editTargetSetsPermanent && newTargetSets !== editingExercise.targetSets;

    // Persist exercise changes (name, unilateral, notes, equipment are always permanent;
    // targetSets only when the user opted into "permanent").
    let persisted = false;
    if (nameChanged || unilateralChanged || notesChanged || equipmentChanged || targetSetsChanged) {
      const updatedExercise: Exercise = {
        ...editingExercise,
        name: nameChanged ? trimmedName : editingExercise.name,
        isUnilateral: editUnilateral || undefined,
        notes: editNotes.trim() || undefined,
        equipment: editEquipment,
        targetSets: newTargetSets,
      };
      try {
        await updateExercise(updatedExercise);
        persisted = true;
        console.log('[ActiveWorkout] Exercise saved:', updatedExercise.id, {
          targetSets: updatedExercise.targetSets,
          isUnilateral: updatedExercise.isUnilateral,
        });
      } catch (err) {
        console.log('[ActiveWorkout] Exercise save failed:', err);
        Alert.alert('Save Failed', 'Could not save the exercise. Please try again.');
        return;
      }
    }

    // Handle session-only override behavior.
    if (editTargetSetsPermanent) {
      // Permanent write-through wins — drop any session override so the persistent value applies.
      setTargetSetOverrides(prev => {
        if (!(editingExercise.id in prev)) return prev;
        const next = { ...prev };
        delete next[editingExercise.id];
        return next;
      });
    } else {
      // Workout-only override. Compare against the effective persistent default
      // (exercise.targetSets if set, else the unilateral-aware global default) so we
      // don't keep a redundant override that just mirrors the persistent value.
      const effectiveDefault = editingExercise.targetSets ?? defaultForNewUnilateral;
      if (editTargetSets !== effectiveDefault) {
        setTargetSetOverrides(prev => ({
          ...prev,
          [editingExercise.id]: editTargetSets,
        }));
      } else {
        setTargetSetOverrides(prev => {
          if (!(editingExercise.id in prev)) return prev;
          const next = { ...prev };
          delete next[editingExercise.id];
          return next;
        });
      }
    }

    setEditModalVisible(false);
    setEditingExercise(null);
    // Confirm the write to the user — modal closed too fast to be visible otherwise.
    if (persisted) {
      setEditSavedToast(true);
      setTimeout(() => setEditSavedToast(false), 1500);
    }
  };

  const handleRemoveExercise = (exercise: Exercise) => {
    const currentSets = getSetsForExercise(exercise.id);
    if (currentSets.length > 0) {
      showAlert(
        'Remove Exercise',
        `This will remove "${exercise.name}" and its ${currentSets.length} logged set(s) from this workout.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              // Remove all sets for this exercise first
              currentSets.forEach(set => removeSet(set.id));
              removeExerciseFromWorkout(exercise.id);
              if (selectedExerciseId === exercise.id) {
                setSelectedExerciseId(null);
              }
            },
          },
        ]
      );
    } else {
      removeExerciseFromWorkout(exercise.id);
      if (selectedExerciseId === exercise.id) {
        setSelectedExerciseId(null);
      }
    }
  };

  const handleSwapExercise = async (newExercise: Exercise) => {
    if (!exerciseToSwap) return;
    swapExercise(exerciseToSwap.id, newExercise.id);
    setSwapModalVisible(false);
    setExerciseToSwap(null);

    // Load history for the new exercise (swap doesn't change exerciseIds.length,
    // so the useEffect won't trigger). Exclude deload workouts from "last time" lookup.
    const deloadWorkoutIds = new Set(
      workouts.filter(w => w.isDeload).map(w => w.id)
    );
    const lastWorkout = await getLastWorkoutForExercise(
      newExercise.id,
      deloadWorkoutIds.size > 0 ? deloadWorkoutIds : undefined
    );
    setExerciseHistories(prev => ({
      ...prev,
      [newExercise.id]: {
        exerciseId: newExercise.id,
        sets: lastWorkout?.sets || [],
        date: lastWorkout?.date || null,
      },
    }));

    // Expand the new exercise
    setSelectedExerciseId(newExercise.id);
  };

  // Get exercises organized into smart swap sections
  interface SwapSection {
    title: string;
    exercises: Exercise[];
    collapsed?: boolean;
  }

  const getSwapSections = (exercise: Exercise): SwapSection[] => {
    // Get primary muscles for current exercise
    const currentPrimaryMuscles = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
      ? exercise.primaryMuscleGroups
      : exercise.primaryMuscleGroup
      ? [exercise.primaryMuscleGroup]
      : [];

    // Build exclude set: self + already in workout
    const excludeIds = new Set([exercise.id, ...activeWorkout.exerciseIds]);

    // Get all routine exercise IDs
    const routine = getActiveRoutine();
    const routineExerciseIds = new Set<string>();
    if (routine) {
      for (const day of routine.daySchedule) {
        for (const templateId of day.templateIds) {
          const template = templates.find(t => t.id === templateId);
          if (template) {
            for (const eid of template.exerciseIds) {
              routineExerciseIds.add(eid);
            }
          }
        }
      }
    }

    // Get exercises done this week
    const weekStartsOn = userSettings?.weekStartDay === 'monday' ? 1 : 0;
    const weekStart = startOfWeek(new Date(), { weekStartsOn });
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const doneThisWeek = new Set<string>();
    for (const s of sets) {
      if (s.loggedAt >= weekStartStr) {
        doneThisWeek.add(s.exerciseId);
      }
    }

    // Helper: get primary muscles for an exercise
    const getPrimaryMuscles = (e: Exercise) =>
      e.primaryMuscleGroups && e.primaryMuscleGroups.length > 0
        ? e.primaryMuscleGroups
        : e.primaryMuscleGroup ? [e.primaryMuscleGroup] : [];

    // Helper: shares a primary muscle with the swap target
    const sharesMuscle = (e: Exercise) =>
      getPrimaryMuscles(e).some(m => currentPrimaryMuscles.includes(m));

    // Categorize all available exercises
    const section1: Exercise[] = [];
    const section2: Exercise[] = [];
    const section3: Exercise[] = [];
    const usedIds = new Set<string>();

    for (const e of exercises) {
      if (excludeIds.has(e.id)) continue;

      const inRoutine = routineExerciseIds.has(e.id);
      const notDoneThisWeek = !doneThisWeek.has(e.id);
      const sameMuscle = sharesMuscle(e);

      if (inRoutine && notDoneThisWeek && sameMuscle) {
        section1.push(e);
        usedIds.add(e.id);
      }
    }

    for (const e of exercises) {
      if (excludeIds.has(e.id) || usedIds.has(e.id)) continue;

      const inRoutine = routineExerciseIds.has(e.id);
      const notDoneThisWeek = !doneThisWeek.has(e.id);

      if (inRoutine && notDoneThisWeek) {
        section2.push(e);
        usedIds.add(e.id);
      }
    }

    for (const e of exercises) {
      if (excludeIds.has(e.id) || usedIds.has(e.id)) continue;
      section3.push(e);
    }

    const sections: SwapSection[] = [];
    if (section1.length > 0) {
      sections.push({ title: 'Same Muscle — In Routine', exercises: section1 });
    }
    if (section2.length > 0) {
      sections.push({ title: 'Other Routine Exercises', exercises: section2 });
    }
    if (section3.length > 0) {
      // Collapse section 3 unless there are no other sections
      sections.push({ title: 'All Exercises', exercises: section3, collapsed: sections.length > 0 });
    }

    return sections;
  };

  // Legacy helper for hasSwapOptions check
  const hasAnySwapOptions = (exercise: Exercise): boolean => {
    const excludeIds = new Set([exercise.id, ...activeWorkout.exerciseIds]);
    return exercises.some(e => !excludeIds.has(e.id));
  };

  const toggleExercise = (exerciseId: string) => {
    if (selectedExerciseId === exerciseId) {
      setSelectedExerciseId(null);
    } else {
      setSelectedExerciseId(exerciseId);
      // Load weight/reps from current session or history
      const currentSets = getSetsForExercise(exerciseId);
      if (currentSets.length > 0) {
        const lastSet = currentSets[currentSets.length - 1];
        setWeight(lastSet.weight);
        setReps(lastSet.reps);
      } else if (exerciseHistories[exerciseId]?.sets.length > 0) {
        const lastHistory = exerciseHistories[exerciseId].sets[0];
        setWeight(lastHistory.weight);
        setReps(lastHistory.reps);
      }
    }
  };

  const handleSetRestTimer = (seconds: number) => {
    setCustomRestTime(seconds);
    setRestTimerModalVisible(false);
    startRestTimer(seconds);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate total sets logged
  const totalSetsLogged = activeWorkout.sets.length;

  // Always use SafeAreaView for top inset — embedded mode (TrainScreen tab) still
  // needs safe area since TrainScreen doesn't wrap the active workout in SafeAreaView.
  const wrapperProps = { style: commonStyles.safeArea, edges: ['top'] as const };

  return (
    <SafeAreaView {...wrapperProps}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.workoutTitle}>
              {template?.name || 'Custom Workout'}
            </Text>
            <Text style={styles.workoutTime}>
              Started {format(new Date(activeWorkout.workout.startedAt), 'h:mm a')} • {totalSetsLogged} sets logged
            </Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Progress' })}
            >
              <Ionicons name="stats-chart" size={22} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCancelWorkout}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Rest Timer Banner */}
        {restTimer.isRunning && (
          <TouchableOpacity
            style={styles.timerBanner}
            onPress={stopRestTimer}
          >
            <Text style={styles.timerLabel}>Rest</Text>
            <Text style={styles.timerValue}>
              {formatTime(restTimer.secondsRemaining)}
            </Text>
            <Text style={styles.timerDismiss}>Tap to dismiss</Text>
          </TouchableOpacity>
        )}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Exercise List */}
          <Text style={styles.sectionTitle}>Exercises</Text>

          {(() => {
            const baseTargetSets = userSettings?.defaultTargetSets ?? 3;

            // Sort exercises: incomplete first (in template order), then completed (in template order)
            const incomplete: string[] = [];
            const completed: string[] = [];
            for (const id of activeWorkout.exerciseIds) {
              const ex = exercises.find(e => e.id === id);
              const target =
                targetSetOverrides[id]
                ?? ex?.targetSets
                ?? (ex?.isUnilateral ? baseTargetSets * 2 : baseTargetSets);
              if (getSetsForExercise(id).length >= target) {
                completed.push(id);
              } else {
                incomplete.push(id);
              }
            }
            const sortedIds = [...incomplete, ...completed];

            return sortedIds.map((exerciseId, index) => {
              const exercise = exercises.find(e => e.id === exerciseId);
              const currentSets = getSetsForExercise(exerciseId);
              const history = exerciseHistories[exerciseId];
              const isExpanded = selectedExerciseId === exerciseId;
              const targetSets =
                targetSetOverrides[exerciseId]
                ?? exercise?.targetSets
                ?? (exercise?.isUnilateral ? baseTargetSets * 2 : baseTargetSets);
              const exerciseComplete = currentSets.length >= targetSets;

              if (!exercise) return null;

              // Show "Completed" separator once, right before the first completed exercise
              const showSeparator = exerciseComplete && index === incomplete.length && completed.length > 0;

              return (
                <React.Fragment key={exerciseId}>
                  {showSeparator && (
                    <View style={styles.completedSeparator}>
                      <View style={styles.completedSeparatorLine} />
                      <Text style={styles.completedSeparatorText}>Completed</Text>
                      <View style={styles.completedSeparatorLine} />
                    </View>
                  )}
                  <ExerciseCard
                    exercise={exercise}
                    currentSets={currentSets}
                    history={history}
                    isExpanded={isExpanded}
                    onToggle={() => toggleExercise(exerciseId)}
                    onLogSet={handleLogSet}
                    onDeleteSet={handleDeleteSet}
                    onRemove={() => handleRemoveExercise(exercise)}
                    onOpenRestTimer={() => setRestTimerModalVisible(true)}
                    onSwap={() => handleOpenSwapModal(exercise)}
                    onEdit={() => handleOpenEditModal(exercise)}
                    onViewHistory={(exerciseId) => navigation.navigate('ExerciseHistory', { exerciseId })}
                    hasSwapOptions={hasAnySwapOptions(exercise)}
                    weight={weight}
                    setWeight={setWeight}
                    reps={reps}
                    setReps={setReps}
                    restTimerSeconds={customRestTime}
                    units={units}
                    prCelebration={prCelebration}
                    prAnimValue={prAnimValue}
                    sessionPRs={sessionPRs}
                    fatigueWarning={fatigueWarnings.get(exerciseId)}
                    targetSets={targetSets}
                    isComplete={exerciseComplete}
                    isOnDeload={userSettings?.isOnDeload}
                    deloadPercentage={userSettings?.deloadPercentage}
                  />
                </React.Fragment>
              );
            });
          })()}

          {/* Remaining Exercises Summary */}
          {(() => {
            const remainingExercises = activeWorkout.exerciseIds
              .map(id => ({
                exercise: exercises.find(e => e.id === id),
                setsLogged: getSetsForExercise(id).length,
              }))
              .filter(item => item.exercise && item.setsLogged === 0);

            if (remainingExercises.length === 0) return null;

            // Get unique muscle groups from remaining exercises
            const remainingMuscles = new Set<string>();
            remainingExercises.forEach(item => {
              if (item.exercise) {
                const primaryMuscles = item.exercise.primaryMuscleGroups?.length
                  ? item.exercise.primaryMuscleGroups
                  : item.exercise.primaryMuscleGroup
                  ? [item.exercise.primaryMuscleGroup]
                  : [];
                primaryMuscles.forEach(m => remainingMuscles.add(MUSCLE_GROUP_DISPLAY_NAMES[m] || m));
              }
            });

            return (
              <Card style={styles.remainingCard}>
                <Text style={styles.remainingTitle}>
                  {remainingExercises.length} exercise{remainingExercises.length !== 1 ? 's' : ''} remaining
                </Text>
                <View style={styles.remainingList}>
                  {remainingExercises.map(item => (
                    <TouchableOpacity
                      key={item.exercise!.id}
                      style={styles.remainingItem}
                      onPress={() => toggleExercise(item.exercise!.id)}
                    >
                      <Text style={styles.remainingItemText}>{item.exercise!.name}</Text>
                      <Text style={styles.remainingItemArrow}>→</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {remainingMuscles.size > 0 && (
                  <Text style={styles.remainingMuscles}>
                    Still to hit: {Array.from(remainingMuscles).join(', ')}
                  </Text>
                )}
              </Card>
            );
          })()}

          {/* Add Exercise Button */}
          <TouchableOpacity
            style={styles.addExerciseButton}
            onPress={handleAddExercise}
          >
            <Text style={styles.addExerciseText}>+ Add Exercise</Text>
          </TouchableOpacity>

          {/* Suggested Exercises Button */}
          <TouchableOpacity
            style={styles.suggestExerciseButton}
            onPress={handleOpenSuggestModal}
          >
            <Text style={styles.suggestExerciseText}>Suggested Exercises</Text>
          </TouchableOpacity>

          {/* Spacer for button */}
          <View style={styles.buttonSpacer} />
        </ScrollView>

        {/* Finish Button */}
        <View style={styles.footer}>
          <Button
            title="Finish Workout"
            onPress={handleFinishWorkout}
            fullWidth
          />
        </View>

        {/* Rest Timer Modal */}
        <Modal
          visible={restTimerModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setRestTimerModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setRestTimerModalVisible(false)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Set Rest Timer</Text>

              <View style={styles.timerOptions}>
                {[30, 60, 90, 120, 180].map(seconds => (
                  <TouchableOpacity
                    key={seconds}
                    style={[
                      styles.timerOption,
                      customRestTime === seconds && styles.timerOptionSelected,
                    ]}
                    onPress={() => handleSetRestTimer(seconds)}
                  >
                    <Text
                      style={[
                        styles.timerOptionText,
                        customRestTime === seconds && styles.timerOptionTextSelected,
                      ]}
                    >
                      {formatTime(seconds)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Button
                title="Start Timer"
                onPress={() => handleSetRestTimer(customRestTime)}
                fullWidth
                style={styles.startTimerButton}
              />
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Swap Exercise Modal */}
        <Modal
          visible={swapModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setSwapModalVisible(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setSwapModalVisible(false)}
          >
            <View style={[styles.modalContent, styles.swapModalContent]} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>
                Swap {exerciseToSwap?.name}
              </Text>
              <Text style={styles.swapModalSubtitle}>
                {exerciseToSwap && (
                  exerciseToSwap.primaryMuscleGroups && exerciseToSwap.primaryMuscleGroups.length > 0
                    ? exerciseToSwap.primaryMuscleGroups.map(m => MUSCLE_GROUP_DISPLAY_NAMES[m]).join(', ')
                    : exerciseToSwap.primaryMuscleGroup
                    ? MUSCLE_GROUP_DISPLAY_NAMES[exerciseToSwap.primaryMuscleGroup]
                    : 'Unknown'
                )}
              </Text>

              <View style={styles.swapSearchContainer}>
                <SearchBar
                  value={swapSearchQuery}
                  onChangeText={setSwapSearchQuery}
                  placeholder="Search exercises..."
                />
              </View>

              <ScrollView
                style={styles.swapList}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {exerciseToSwap && (() => {
                  const sections = getSwapSections(exerciseToSwap);

                  // When searching, flatten all sections and filter by name
                  if (swapSearchQuery) {
                    const query = swapSearchQuery.toLowerCase();
                    const allExercises = sections.flatMap(s => s.exercises);
                    const filtered = allExercises.filter(e =>
                      e.name.toLowerCase().includes(query)
                    );
                    return filtered.map(exercise => (
                      <TouchableOpacity
                        key={exercise.id}
                        style={styles.swapOption}
                        onPress={() => handleSwapExercise(exercise)}
                      >
                        <Text style={styles.swapOptionName}>{exercise.name}</Text>
                        <Text style={styles.swapOptionEquipment}>
                          {EQUIPMENT_DISPLAY_NAMES[exercise.equipment] || exercise.equipment}
                        </Text>
                      </TouchableOpacity>
                    ));
                  }

                  // Sectioned view
                  return sections.map(section => (
                    <View key={section.title}>
                      <Text style={styles.swapSectionHeader}>{section.title}</Text>
                      {section.collapsed && !showAllExercises ? (
                        <TouchableOpacity
                          style={styles.showAllButton}
                          onPress={() => setShowAllExercises(true)}
                        >
                          <Text style={styles.showAllText}>
                            Show all exercises ({section.exercises.length})
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        section.exercises.map(exercise => (
                          <TouchableOpacity
                            key={exercise.id}
                            style={styles.swapOption}
                            onPress={() => handleSwapExercise(exercise)}
                          >
                            <Text style={styles.swapOptionName}>{exercise.name}</Text>
                            <Text style={styles.swapOptionEquipment}>
                              {EQUIPMENT_DISPLAY_NAMES[exercise.equipment] || exercise.equipment}
                            </Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  ));
                })()}
              </ScrollView>

              <Button
                title="Cancel"
                onPress={() => setSwapModalVisible(false)}
                variant="secondary"
                fullWidth
                style={styles.cancelSwapButton}
              />
            </View>
          </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>

        {/* Suggested Exercises Modal */}
        <Modal
          visible={suggestModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setSuggestModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setSuggestModalVisible(false)}
          >
            <View style={[styles.modalContent, styles.suggestModalContent]}>
              {suggestStep === 'location' ? (
                <>
                  <Text style={styles.modalTitle}>Select Location</Text>
                  <Text style={styles.suggestModalSubtitle}>
                    Choose where you're working out
                  </Text>

                  <ScrollView style={styles.locationList}>
                    {locations.map(location => (
                      <TouchableOpacity
                        key={location.id}
                        style={styles.locationOption}
                        onPress={() => handleSelectLocation(location.id)}
                      >
                        <Text style={styles.locationOptionName}>{location.name}</Text>
                        <Text style={styles.locationOptionChevron}>›</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Button
                    title="Cancel"
                    onPress={() => setSuggestModalVisible(false)}
                    variant="secondary"
                    fullWidth
                    style={styles.cancelSuggestButton}
                  />
                </>
              ) : (
                <>
                  <View style={styles.suggestHeader}>
                    <TouchableOpacity onPress={() => setSuggestStep('location')}>
                      <Text style={styles.suggestBackButton}>‹ Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>
                      {locations.find(l => l.id === selectedLocationId)?.name}
                    </Text>
                  </View>
                  <Text style={styles.suggestModalSubtitle}>
                    Tap an exercise to add it to your workout
                  </Text>

                  <ScrollView style={styles.suggestExerciseList}>
                    {selectedLocationId && getExercisesForLocation(selectedLocationId).map(exercise => {
                      const isInWorkout = activeWorkout.exerciseIds.includes(exercise.id);
                      return (
                        <TouchableOpacity
                          key={exercise.id}
                          style={[
                            styles.suggestExerciseOption,
                            isInWorkout && styles.suggestExerciseOptionAdded,
                          ]}
                          onPress={() => !isInWorkout && handleAddSuggestedExercise(exercise.id)}
                          disabled={isInWorkout}
                        >
                          <View style={styles.suggestExerciseLeft}>
                            <Text style={styles.suggestExerciseName}>{exercise.name}</Text>
                            <Text style={styles.suggestExerciseMeta}>
                              {EQUIPMENT_DISPLAY_NAMES[exercise.equipment]}
                              {exercise.primaryMuscleGroups?.length
                                ? ' • ' + exercise.primaryMuscleGroups.map(m => MUSCLE_GROUP_DISPLAY_NAMES[m]).join(', ')
                                : exercise.primaryMuscleGroup
                                ? ' • ' + MUSCLE_GROUP_DISPLAY_NAMES[exercise.primaryMuscleGroup]
                                : ''}
                            </Text>
                          </View>
                          {isInWorkout ? (
                            <View style={styles.addedBadge}>
                              <Text style={styles.addedBadgeText}>Added</Text>
                            </View>
                          ) : (
                            <Text style={styles.addExerciseIcon}>+</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    {selectedLocationId && getExercisesForLocation(selectedLocationId).length === 0 && (
                      <Text style={styles.noExercisesText}>
                        No exercises found for this location
                      </Text>
                    )}
                  </ScrollView>

                  <Button
                    title="Done"
                    onPress={() => setSuggestModalVisible(false)}
                    fullWidth
                    style={styles.doneSuggestButton}
                  />
                </>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Edit Exercise Modal */}
        <Modal
          visible={editModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setEditModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setEditModalVisible(false)}
          >
            <View style={[styles.modalContent, styles.editModalContent]} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>Edit Exercise</Text>

              {/* Name */}
              <View style={styles.editNameSection}>
                <Text style={styles.editLabel}>Name</Text>
                <TextInput
                  style={styles.editNameInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Exercise name"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>

              {/* Unilateral Toggle */}
              <View style={styles.editRow}>
                <View style={styles.editRowLeft}>
                  <Text style={styles.editLabel}>Unilateral (Single Limb)</Text>
                  <Text style={styles.editHint}>Doubles target sets (e.g., 3 per side = 6 total)</Text>
                </View>
                <Switch
                  value={editUnilateral}
                  onValueChange={(val) => {
                    setEditUnilateral(val);
                    // Auto-adjust target sets when toggling unilateral
                    const baseTarget = userSettings?.defaultTargetSets ?? 3;
                    if (val && !editingExercise?.isUnilateral) {
                      setEditTargetSets(prev => prev * 2);
                    } else if (!val && editingExercise?.isUnilateral) {
                      setEditTargetSets(prev => Math.max(1, Math.floor(prev / 2)));
                    }
                  }}
                  trackColor={{ false: colors.backgroundTertiary, true: colors.primary }}
                />
              </View>

              {/* Target Sets */}
              <View style={styles.editRow}>
                <View style={styles.editRowLeft}>
                  <Text style={styles.editLabel}>Target Sets</Text>
                  <Text style={styles.editHint}>
                    {editTargetSetsPermanent ? 'Applies to future workouts' : 'This workout only'}
                  </Text>
                </View>
                <View style={styles.editTargetSetsControl}>
                  <TouchableOpacity
                    style={styles.editTargetSetsButton}
                    onPress={() => setEditTargetSets(prev => Math.max(1, prev - 1))}
                  >
                    <Text style={styles.editTargetSetsButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.editTargetSetsValue}>{editTargetSets}</Text>
                  <TouchableOpacity
                    style={styles.editTargetSetsButton}
                    onPress={() => setEditTargetSets(prev => prev + 1)}
                  >
                    <Text style={styles.editTargetSetsButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Permanent toggle for target sets */}
              <TouchableOpacity
                style={styles.editPermanentRow}
                onPress={() => setEditTargetSetsPermanent(prev => !prev)}
              >
                <View style={[
                  styles.editCheckbox,
                  editTargetSetsPermanent && styles.editCheckboxChecked,
                ]}>
                  {editTargetSetsPermanent && <Text style={styles.editCheckboxCheck}>✓</Text>}
                </View>
                <Text style={styles.editPermanentText}>Apply target sets to future workouts</Text>
              </TouchableOpacity>

              {/* Equipment */}
              <View style={styles.editRow}>
                <Text style={styles.editLabel}>Equipment</Text>
                <Text style={styles.editEquipmentValue}>{EQUIPMENT_DISPLAY_NAMES[editEquipment]}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.editEquipmentScroll}>
                {(['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell', 'other'] as Equipment[]).map(eq => (
                  <TouchableOpacity
                    key={eq}
                    style={[
                      styles.editEquipmentOption,
                      editEquipment === eq && styles.editEquipmentOptionSelected,
                    ]}
                    onPress={() => setEditEquipment(eq)}
                  >
                    <Text style={[
                      styles.editEquipmentOptionText,
                      editEquipment === eq && styles.editEquipmentOptionTextSelected,
                    ]}>
                      {EQUIPMENT_DISPLAY_NAMES[eq]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Notes */}
              <View style={styles.editNotesSection}>
                <Text style={styles.editLabel}>Notes</Text>
                <TextInput
                  style={styles.editNotesInput}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="Cable height, bench angle, grip width, etc."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Save / Cancel */}
              <View style={styles.editButtonRow}>
                <TouchableOpacity
                  style={styles.editCancelButton}
                  onPress={() => setEditModalVisible(false)}
                >
                  <Text style={styles.editCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editSaveButton}
                  onPress={handleSaveExerciseEdit}
                >
                  <Text style={styles.editSaveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Brief save confirmation — appears at the top for ~1.5s after an edit persists */}
        {editSavedToast && (
          <View style={styles.editSavedToast} pointerEvents="none">
            <Text style={styles.editSavedToastText}>Exercise updated ✓</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// Previous Set Indicator Component
interface PreviousSetIndicatorProps {
  currentSets: WorkoutSet[];
  history: ExerciseHistory | undefined;
  units: UnitSystem;
  isOnDeload?: boolean;
  deloadPercentage?: number;
}

function PreviousSetIndicator({ currentSets, history, units, isOnDeload, deloadPercentage }: PreviousSetIndicatorProps) {
  // Determine what to show: last set from current session, or last set from previous session
  const lastCurrentSet = currentSets.length > 0 ? currentSets[currentSets.length - 1] : null;
  const lastHistorySet = history?.sets?.[0];

  if (lastCurrentSet) {
    // Show previous set from current session
    return (
      <View style={styles.previousSetContainer}>
        <Text style={styles.previousSetLabel}>Previous set:</Text>
        <Text style={styles.previousSetValue}>
          {formatWeight(lastCurrentSet.weight, units)} × {lastCurrentSet.reps} reps
        </Text>
      </View>
    );
  }

  if (lastHistorySet) {
    // Show last set from previous workout
    const historyDate = history?.date ? format(new Date(history.date), 'MMM d') : '';
    if (isOnDeload) {
      const pct = (deloadPercentage ?? 50) / 100;
      const deloadWeight = Math.round((lastHistorySet.weight * pct) / 5) * 5 || lastHistorySet.weight * pct;
      return (
        <View style={styles.previousSetContainer}>
          <Text style={styles.previousSetLabel}>Last time ({historyDate}):</Text>
          <Text style={styles.previousSetValue}>
            {formatWeight(lastHistorySet.weight, units)} × {lastHistorySet.reps} reps
          </Text>
          <Text style={styles.deloadSuggestion}>
            Deload: {formatWeight(deloadWeight, units)} ({deloadPercentage ?? 50}%)
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.previousSetContainer}>
        <Text style={styles.previousSetLabel}>Last time ({historyDate}):</Text>
        <Text style={styles.previousSetValue}>
          {formatWeight(lastHistorySet.weight, units)} × {lastHistorySet.reps} reps
        </Text>
      </View>
    );
  }

  // No previous data - first time doing this exercise
  return (
    <View style={styles.previousSetContainer}>
      <Text style={styles.previousSetLabel}>First time logging this exercise</Text>
    </View>
  );
}

interface ExerciseCardProps {
  exercise: Exercise;
  currentSets: WorkoutSet[];
  history: ExerciseHistory | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  onLogSet: () => void;
  onDeleteSet: (setId: string) => void;
  onRemove: () => void;
  onOpenRestTimer: () => void;
  onSwap: () => void;
  onEdit: () => void;
  onViewHistory: (exerciseId: string) => void;
  hasSwapOptions: boolean;
  weight: number;
  setWeight: (w: number) => void;
  reps: number;
  setReps: (r: number) => void;
  restTimerSeconds: number;
  units: UnitSystem;
  prCelebration: { exerciseId: string; emoji: string; label: string } | null;
  prAnimValue: Animated.Value;
  sessionPRs: Map<string, { prResult: PRCheckResult; isMilestone: boolean; milestoneLabel?: string }>;
  fatigueWarning?: ExerciseFatigueSignal;
  targetSets: number;
  isComplete: boolean;
  isOnDeload?: boolean;
  deloadPercentage?: number;
}

function ExerciseCard({
  exercise,
  currentSets,
  history,
  isExpanded,
  onToggle,
  onLogSet,
  onDeleteSet,
  onRemove,
  onOpenRestTimer,
  onSwap,
  onEdit,
  onViewHistory,
  hasSwapOptions,
  weight,
  setWeight,
  reps,
  setReps,
  restTimerSeconds,
  units,
  prCelebration,
  prAnimValue,
  sessionPRs,
  fatigueWarning,
  targetSets,
  isComplete,
  isOnDeload,
  deloadPercentage,
}: ExerciseCardProps) {
  const showPR = prCelebration?.exerciseId === exercise.id;
  const setCount = currentSets.length;
  const setLabel = setCount === 0
    ? `0 of ${targetSets} sets`
    : setCount >= targetSets
    ? `${setCount} sets \u2713`
    : `Set ${setCount} of ${targetSets}`;
  return (
    <Card style={{...styles.exerciseCard, ...(isComplete ? styles.exerciseCardComplete : undefined)}} padding="none">
      {/* Exercise Header - Always visible */}
      <TouchableOpacity
        style={styles.exerciseHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.exerciseHeaderLeft}>
          <Text style={[styles.exerciseName, isComplete && styles.exerciseNameComplete]}>{exercise.name}</Text>
          {exercise.cableAccessory && (
            <Text style={styles.exerciseAccessory}>{CABLE_ACCESSORY_DISPLAY_NAMES[exercise.cableAccessory]}</Text>
          )}
          {exercise.notes && (
            <Text style={styles.exerciseNotes} numberOfLines={1}>{exercise.notes}</Text>
          )}
          <Text style={[styles.exerciseSets, isComplete && styles.exerciseSetsComplete]}>
            {setLabel}
          </Text>
        </View>
        <View style={styles.exerciseHeaderRight}>
          {hasSwapOptions && (
            <TouchableOpacity
              style={styles.swapButton}
              onPress={(e) => {
                e.stopPropagation?.();
                onSwap();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.swapButtonText}>Swap</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.editButton}
            onPress={(e) => {
              e.stopPropagation?.();
              onEdit();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="pencil" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={(e) => {
              e.stopPropagation?.();
              onRemove();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.removeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
        </View>
      </TouchableOpacity>

      {/* Fatigue Warning Banner */}
      {fatigueWarning && !showPR && (
        <View style={styles.fatigueBanner}>
          <Ionicons name="trending-down-outline" size={14} color={colors.warning} />
          <Text style={styles.fatigueBannerText}>{fatigueWarning.message}</Text>
        </View>
      )}

      {/* PR Celebration Banner */}
      {showPR && (
        <Animated.View
          style={[
            styles.prBanner,
            { opacity: prAnimValue, transform: [{ scale: prAnimValue.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
          ]}
        >
          <Text style={styles.prBannerText}>
            {prCelebration.emoji} {prCelebration.label}
          </Text>
        </Animated.View>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <View style={styles.exerciseContent}>
          {/* Last Session History */}
          {history && history.sets.length > 0 && (
            <TouchableOpacity
              style={styles.historySection}
              onPress={() => onViewHistory(exercise.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.historyTitle}>
                Last session ({history.date ? format(new Date(history.date), 'MMM d') : 'N/A'})
                {' '}
                <Text style={styles.viewHistoryLink}>View all →</Text>
              </Text>
              <View style={styles.historyRow}>
                {history.sets.slice(0, 5).map((set, idx) => (
                  <Text key={set.id} style={styles.historySet}>
                    {formatWeightValue(set.weight, units)}×{set.reps}
                    {idx < Math.min(history.sets.length, 5) - 1 ? '  ' : ''}
                  </Text>
                ))}
                {history.sets.length > 5 && (
                  <Text style={styles.historyMore}>+{history.sets.length - 5} more</Text>
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* Current Session Sets */}
          {currentSets.length > 0 && (
            <View style={styles.currentSetsSection}>
              <Text style={styles.currentSetsTitle}>This session</Text>
              {currentSets.map((set, index) => {
                const prData = sessionPRs.get(set.id);
                return (
                  <View key={set.id} style={styles.currentSetRow}>
                    <Text style={styles.currentSetNumber}>Set {index + 1}</Text>
                    <Text style={styles.currentSetDetail}>
                      {formatWeight(set.weight, units)} × {set.reps} reps
                    </Text>
                    {prData && (
                      <View style={[styles.prBadge, prData.isMilestone && styles.prBadgeMilestone]}>
                        <Text style={[styles.prBadgeText, prData.isMilestone && styles.prBadgeTextMilestone]}>
                          {prData.isMilestone ? '🏆 PR' : '🏅 PR'}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => onDeleteSet(set.id)}>
                      <Text style={styles.deleteText}>×</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Input Section */}
          <View style={styles.inputSection}>
            {/* Previous Set Indicator */}
            <PreviousSetIndicator
              currentSets={currentSets}
              history={history}
              units={units}
              isOnDeload={isOnDeload}
              deloadPercentage={deloadPercentage}
            />

            <View style={styles.inputRow}>
              <View style={{ flex: 1 }}>
                <NumberInput
                  value={displayWeight(weight, units)}
                  onChangeValue={(v) => setWeight(inputToLbs(v, units))}
                  label={`Weight (${weightUnit(units)})`}
                  step={weightIncrement(units)}
                  min={0}
                  max={units === 'metric' ? 500 : 1000}
                  allowDecimals
                />
              </View>
              <View style={{ flex: 1 }}>
                <NumberInput
                  value={reps}
                  onChangeValue={setReps}
                  label="Reps"
                  step={1}
                  min={1}
                  max={100}
                />
              </View>
            </View>

            <View style={styles.actionRow}>
              <Button
                title="Log Set"
                onPress={onLogSet}
                style={styles.logButton}
              />
              <TouchableOpacity
                style={styles.timerButton}
                onPress={onOpenRestTimer}
              >
                <View style={styles.timerButtonContent}>
                  <Ionicons name="timer-outline" size={16} color={colors.text} />
                  <Text style={styles.timerButtonText}>Rest</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: typography.size.lg,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerButton: {
    padding: spacing.xs,
  },
  workoutTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  workoutTime: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cancelText: {
    fontSize: typography.size.md,
    color: colors.error,
  },
  timerBanner: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerLabel: {
    fontSize: typography.size.sm,
    color: colors.text,
    opacity: 0.8,
    marginRight: spacing.sm,
  },
  timerValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  timerDismiss: {
    fontSize: typography.size.xs,
    color: colors.text,
    opacity: 0.6,
    marginLeft: spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  exerciseCard: {
    marginBottom: spacing.md,
  },
  exerciseCardComplete: {
    opacity: 0.7,
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
  exerciseHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  exerciseName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  exerciseNameComplete: {
    color: colors.textSecondary,
  },
  exerciseAccessory: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 1,
  },
  exerciseNotes: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 1,
  },
  exerciseSets: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  exerciseSetsComplete: {
    color: colors.success,
  },
  completedSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
    gap: spacing.sm,
  },
  completedSeparatorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
  completedSeparatorText: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  prBanner: {
    backgroundColor: colors.success,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    alignItems: 'center',
  },
  prBannerText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  fatigueBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.base,
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
  },
  fatigueBannerText: {
    fontSize: typography.size.xs,
    color: colors.warning,
    flex: 1,
  },
  swapButton: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  swapButtonText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  removeButton: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  removeButtonText: {
    fontSize: typography.size.sm,
    color: colors.error,
    fontWeight: typography.weight.medium,
  },
  expandIcon: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  exerciseContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    padding: spacing.base,
  },
  historySection: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
  },
  historyTitle: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  viewHistoryLink: {
    color: colors.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  historyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  historySet: {
    fontSize: typography.size.sm,
    color: colors.text,
  },
  historyMore: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  currentSetsSection: {
    marginBottom: spacing.md,
  },
  currentSetsTitle: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  currentSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  currentSetNumber: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    width: 50,
  },
  currentSetDetail: {
    flex: 1,
    fontSize: typography.size.base,
    color: colors.text,
  },
  prBadge: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    marginRight: spacing.xs,
  },
  prBadgeMilestone: {
    backgroundColor: colors.primary + '30',
  },
  prBadgeText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  prBadgeTextMilestone: {
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  deleteText: {
    fontSize: typography.size.lg,
    color: colors.error,
    paddingHorizontal: spacing.sm,
  },
  inputSection: {
    marginTop: spacing.sm,
  },
  previousSetContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '20',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  deloadSuggestion: {
    width: '100%',
    textAlign: 'center',
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.success,
    marginTop: 2,
  },
  previousSetLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  previousSetValue: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logButton: {
    flex: 1,
  },
  timerButton: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.md,
  },
  timerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timerButtonText: {
    fontSize: typography.size.sm,
    color: colors.text,
  },
  addExerciseButton: {
    padding: spacing.base,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.separator,
    borderStyle: 'dashed',
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
  },
  addExerciseText: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  suggestExerciseButton: {
    padding: spacing.base,
    alignItems: 'center',
    backgroundColor: colors.primaryDim,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
  },
  suggestExerciseText: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  buttonSpacer: {
    height: 80,
  },
  footer: {
    padding: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
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
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  timerOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  timerOption: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    minWidth: 80,
    alignItems: 'center',
  },
  timerOptionSelected: {
    backgroundColor: colors.primary,
  },
  timerOptionText: {
    fontSize: typography.size.md,
    color: colors.text,
  },
  timerOptionTextSelected: {
    fontWeight: typography.weight.semibold,
  },
  startTimerButton: {
    marginTop: spacing.md,
  },
  // Swap modal styles
  swapModalContent: {
    maxHeight: '80%',
  },
  swapModalSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: -spacing.md,
    marginBottom: spacing.md,
  },
  swapSearchContainer: {
    marginBottom: spacing.sm,
  },
  swapSectionHeader: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  showAllButton: {
    paddingVertical: spacing.md,
  },
  showAllText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    textAlign: 'center',
  },
  swapList: {
    maxHeight: 350,
  },
  swapOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  swapOptionName: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.medium,
    flex: 1,
  },
  swapOptionEquipment: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  cancelSwapButton: {
    marginTop: spacing.md,
  },
  // Suggested exercises modal styles
  suggestModalContent: {
    maxHeight: '80%',
  },
  suggestModalSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
  },
  locationList: {
    maxHeight: 300,
  },
  locationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  locationOptionName: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  locationOptionChevron: {
    fontSize: typography.size.xl,
    color: colors.textSecondary,
  },
  cancelSuggestButton: {
    marginTop: spacing.md,
  },
  suggestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  suggestBackButton: {
    fontSize: typography.size.lg,
    color: colors.primary,
    marginRight: spacing.sm,
  },
  suggestExerciseList: {
    maxHeight: 350,
  },
  suggestExerciseOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  suggestExerciseOptionAdded: {
    opacity: 0.5,
  },
  suggestExerciseLeft: {
    flex: 1,
  },
  suggestExerciseName: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  suggestExerciseMeta: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addedBadge: {
    backgroundColor: colors.success + '30',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  addedBadgeText: {
    fontSize: typography.size.xs,
    color: colors.success,
    fontWeight: typography.weight.medium,
  },
  addExerciseIcon: {
    fontSize: typography.size.xl,
    color: colors.primary,
    fontWeight: typography.weight.bold,
  },
  noExercisesText: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.xl,
  },
  doneSuggestButton: {
    marginTop: spacing.md,
  },
  // Remaining exercises styles
  remainingCard: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
  },
  remainingTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.warning,
    marginBottom: spacing.sm,
  },
  remainingList: {
    gap: spacing.xs,
  },
  remainingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
  },
  remainingItemText: {
    fontSize: typography.size.sm,
    color: colors.text,
  },
  remainingItemArrow: {
    fontSize: typography.size.sm,
    color: colors.primary,
  },
  remainingMuscles: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  // Edit button in exercise header
  editButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  // Edit exercise modal styles
  editModalContent: {
    maxHeight: '85%',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  editRowLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  editLabel: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  editHint: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  editTargetSetsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  editTargetSetsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editTargetSetsButtonText: {
    fontSize: typography.size.xl,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  editTargetSetsValue: {
    fontSize: typography.size.xl,
    color: colors.text,
    fontWeight: typography.weight.bold,
    minWidth: 30,
    textAlign: 'center',
  },
  editPermanentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  editCheckbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCheckboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  editCheckboxCheck: {
    color: '#fff',
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  editPermanentText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  editEquipmentValue: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  editEquipmentScroll: {
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  editEquipmentOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
  },
  editEquipmentOptionSelected: {
    backgroundColor: colors.primary,
  },
  editEquipmentOptionText: {
    fontSize: typography.size.sm,
    color: colors.text,
  },
  editEquipmentOptionTextSelected: {
    color: '#fff',
    fontWeight: typography.weight.semibold,
  },
  editNameSection: {
    paddingVertical: spacing.md,
  },
  editNameInput: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
  },
  editNotesSection: {
    paddingVertical: spacing.md,
  },
  editNotesInput: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editButtonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  editCancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
  },
  editCancelButtonText: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  editSaveButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  editSaveButtonText: {
    fontSize: typography.size.md,
    color: '#fff',
    fontWeight: typography.weight.semibold,
  },
  editSavedToast: {
    position: 'absolute',
    top: spacing.lg,
    alignSelf: 'center',
    backgroundColor: colors.success,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  editSavedToastText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
});

export default ActiveWorkoutScreen;
