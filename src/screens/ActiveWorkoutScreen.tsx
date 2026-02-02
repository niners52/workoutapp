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
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card, NumberInput } from '../components/common';
import { useData } from '../contexts/DataContext';
import { useWorkout } from '../contexts/WorkoutContext';
import { getLastWorkoutForExercise } from '../services/workoutService';
import { WorkoutSet, Exercise, MUSCLE_GROUP_DISPLAY_NAMES, WorkoutLocation, EQUIPMENT_DISPLAY_NAMES, UnitSystem } from '../types';
import { RootStackParamList } from '../navigation/types';
import { formatWeight, formatWeightValue, weightUnit, weightIncrement, inputToLbs, displayWeight } from '../services/units';
import { checkForPR, PRCheckResult, prEmoji, formatPRLabel } from '../services/personalRecords';

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

export function ActiveWorkoutScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { exercises, templates, userSettings, locations, workouts, sets } = useData();
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
  } = useWorkout();

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [reps, setReps] = useState(8);
  const [weight, setWeight] = useState(0);
  const [exerciseHistories, setExerciseHistories] = useState<Record<string, ExerciseHistory>>({});
  const [restTimerModalVisible, setRestTimerModalVisible] = useState(false);
  const [customRestTime, setCustomRestTime] = useState(userSettings?.restTimerSeconds || 90);
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [exerciseToSwap, setExerciseToSwap] = useState<Exercise | null>(null);
  const [suggestModalVisible, setSuggestModalVisible] = useState(false);
  const [suggestStep, setSuggestStep] = useState<'location' | 'exercises'>('location');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [prCelebration, setPrCelebration] = useState<{ exerciseId: string; type: string; emoji: string } | null>(null);
  const prAnimValue = useRef(new Animated.Value(0)).current;

  // Get units from settings
  const units = userSettings?.units || 'imperial';

  // Load history for all exercises when workout starts
  useEffect(() => {
    const loadHistories = async () => {
      if (!activeWorkout) return;

      const histories: Record<string, ExerciseHistory> = {};
      for (const exerciseId of activeWorkout.exerciseIds) {
        const lastWorkout = await getLastWorkoutForExercise(exerciseId);
        histories[exerciseId] = {
          exerciseId,
          sets: lastWorkout?.sets || [],
          date: lastWorkout?.date || null,
        };
      }
      setExerciseHistories(histories);
    };

    loadHistories();
  }, [activeWorkout?.exerciseIds.length]);

  // Initialize weight/reps from history when selecting exercise
  useEffect(() => {
    if (selectedExerciseId && exerciseHistories[selectedExerciseId]) {
      const history = exerciseHistories[selectedExerciseId];
      if (history.sets.length > 0) {
        setWeight(history.sets[0].weight);
        setReps(history.sets[0].reps);
      }
    }
  }, [selectedExerciseId, exerciseHistories]);

  if (!isWorkoutActive || !activeWorkout) {
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

  const showPRCelebration = (exerciseId: string, prResult: PRCheckResult) => {
    // Priority: weight > e1rm > volume > reps
    let prType: string;
    if (prResult.isWeightPR) {
      prType = 'weight';
    } else if (prResult.isE1rmPR) {
      prType = 'e1rm';
    } else if (prResult.isVolumePR) {
      prType = 'volume';
    } else if (prResult.isRepPR) {
      prType = 'reps';
    } else {
      return;
    }

    setPrCelebration({ exerciseId, type: prType, emoji: prEmoji(prType as any) });

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

    // Check for PR before logging (compare against all previous sets)
    const prResult = checkForPR(
      { exerciseId: selectedExerciseId, weight, reps, workoutId: activeWorkout.workout.id },
      sets.filter(s => s.exerciseId === selectedExerciseId),
      workoutDates
    );

    await logSet(reps, weight, selectedExerciseId);

    // Show PR celebration if any PR was set
    if (prResult.isPR) {
      showPRCelebration(selectedExerciseId, prResult);
    }

    // Don't collapse - keep exercise expanded so user can continue logging
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
    showAlert(
      'Finish Workout',
      'Are you sure you want to finish this workout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finish',
          onPress: async () => {
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

            const startedAt = activeWorkout.workout.startedAt;
            const completedAt = new Date().toISOString();
            const totalSets = activeWorkout.sets.length;

            await finishWorkout();

            navigation.replace('WorkoutSummary', {
              workoutId: activeWorkout.workout.id,
              startedAt,
              completedAt,
              totalSets,
              muscleGroupSets,
            });
          },
        },
      ]
    );
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
            navigation.goBack();
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
    setSwapModalVisible(true);
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

  const handleSwapExercise = (newExercise: Exercise) => {
    if (!exerciseToSwap) return;
    swapExercise(exerciseToSwap.id, newExercise.id);
    setSwapModalVisible(false);
    setExerciseToSwap(null);
    // Expand the new exercise
    setSelectedExerciseId(newExercise.id);
  };

  // Get exercises with the same muscle group for swap options
  const getSwapOptions = (exercise: Exercise): Exercise[] => {
    // Get primary muscles for current exercise (support both array and deprecated single field)
    const currentPrimaryMuscles = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
      ? exercise.primaryMuscleGroups
      : exercise.primaryMuscleGroup
      ? [exercise.primaryMuscleGroup]
      : [];

    return exercises.filter(e => {
      if (e.id === exercise.id) return false;
      if (activeWorkout.exerciseIds.includes(e.id)) return false;

      // Get primary muscles for potential swap exercise
      const ePrimaryMuscles = e.primaryMuscleGroups && e.primaryMuscleGroups.length > 0
        ? e.primaryMuscleGroups
        : e.primaryMuscleGroup
        ? [e.primaryMuscleGroup]
        : [];

      // Check if any primary muscles overlap
      return currentPrimaryMuscles.some(m => ePrimaryMuscles.includes(m));
    });
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

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
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
              onPress={() => navigation.navigate('MainTabs', { screen: 'Analytics' })}
            >
              <Text style={styles.analyticsText}>📊</Text>
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

          {activeWorkout.exerciseIds.map((exerciseId, index) => {
            const exercise = exercises.find(e => e.id === exerciseId);
            const currentSets = getSetsForExercise(exerciseId);
            const history = exerciseHistories[exerciseId];
            const isExpanded = selectedExerciseId === exerciseId;

            if (!exercise) return null;

            const swapOptions = getSwapOptions(exercise);

            return (
              <ExerciseCard
                key={exerciseId}
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
                onViewHistory={(exerciseId) => navigation.navigate('ExerciseHistory', { exerciseId })}
                hasSwapOptions={swapOptions.length > 0}
                weight={weight}
                setWeight={setWeight}
                reps={reps}
                setReps={setReps}
                restTimerSeconds={customRestTime}
                units={units}
                prCelebration={prCelebration}
                prAnimValue={prAnimValue}
              />
            );
          })}

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
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setSwapModalVisible(false)}
          >
            <View style={[styles.modalContent, styles.swapModalContent]}>
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
                )} exercises
              </Text>

              <ScrollView style={styles.swapList}>
                {exerciseToSwap && getSwapOptions(exerciseToSwap).map(exercise => (
                  <TouchableOpacity
                    key={exercise.id}
                    style={styles.swapOption}
                    onPress={() => handleSwapExercise(exercise)}
                  >
                    <Text style={styles.swapOptionName}>{exercise.name}</Text>
                    <Text style={styles.swapOptionEquipment}>{exercise.equipment}</Text>
                  </TouchableOpacity>
                ))}
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
      </View>
    </SafeAreaView>
  );
}

// Previous Set Indicator Component
interface PreviousSetIndicatorProps {
  currentSets: WorkoutSet[];
  history: ExerciseHistory | undefined;
  units: UnitSystem;
}

function PreviousSetIndicator({ currentSets, history, units }: PreviousSetIndicatorProps) {
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
  onViewHistory: (exerciseId: string) => void;
  hasSwapOptions: boolean;
  weight: number;
  setWeight: (w: number) => void;
  reps: number;
  setReps: (r: number) => void;
  restTimerSeconds: number;
  units: UnitSystem;
  prCelebration: { exerciseId: string; type: string; emoji: string } | null;
  prAnimValue: Animated.Value;
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
}: ExerciseCardProps) {
  const showPR = prCelebration?.exerciseId === exercise.id;
  return (
    <Card style={styles.exerciseCard} padding="none">
      {/* Exercise Header - Always visible */}
      <TouchableOpacity
        style={styles.exerciseHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.exerciseHeaderLeft}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <Text style={styles.exerciseSets}>
            {currentSets.length} {currentSets.length === 1 ? 'set' : 'sets'} logged
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

      {/* PR Celebration Banner */}
      {showPR && (
        <Animated.View
          style={[
            styles.prBanner,
            { opacity: prAnimValue, transform: [{ scale: prAnimValue.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
          ]}
        >
          <Text style={styles.prBannerText}>
            {prCelebration.emoji} {formatPRLabel(prCelebration.type as any)}!
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
              {currentSets.map((set, index) => (
                <View key={set.id} style={styles.currentSetRow}>
                  <Text style={styles.currentSetNumber}>Set {index + 1}</Text>
                  <Text style={styles.currentSetDetail}>
                    {formatWeight(set.weight, units)} × {set.reps} reps
                  </Text>
                  <TouchableOpacity onPress={() => onDeleteSet(set.id)}>
                    <Text style={styles.deleteText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Input Section */}
          <View style={styles.inputSection}>
            {/* Previous Set Indicator */}
            <PreviousSetIndicator
              currentSets={currentSets}
              history={history}
              units={units}
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
                <Text style={styles.timerButtonText}>⏱ Rest</Text>
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
  analyticsText: {
    fontSize: typography.size.xl,
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
  exerciseSets: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '20',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
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
    maxHeight: '70%',
  },
  swapModalSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
  },
  swapList: {
    maxHeight: 300,
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
});

export default ActiveWorkoutScreen;
