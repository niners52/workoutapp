import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card, NumberInput } from '../components/common';
import { useData } from '../contexts/DataContext';
import { useWorkout } from '../contexts/WorkoutContext';
import { getLastSetsForExercise } from '../services/storage';
import { WorkoutSet, Exercise } from '../types';
import { RootStackParamList } from '../navigation/types';

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
  const { exercises, templates, userSettings } = useData();
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
  } = useWorkout();

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [reps, setReps] = useState(8);
  const [weight, setWeight] = useState(0);
  const [exerciseHistories, setExerciseHistories] = useState<Record<string, ExerciseHistory>>({});
  const [restTimerModalVisible, setRestTimerModalVisible] = useState(false);
  const [customRestTime, setCustomRestTime] = useState(userSettings?.restTimerSeconds || 90);

  // Load history for all exercises when workout starts
  useEffect(() => {
    const loadHistories = async () => {
      if (!activeWorkout) return;

      const histories: Record<string, ExerciseHistory> = {};
      for (const exerciseId of activeWorkout.exerciseIds) {
        const lastSets = await getLastSetsForExercise(exerciseId, 10);
        histories[exerciseId] = {
          exerciseId,
          sets: lastSets,
          date: lastSets.length > 0 ? lastSets[0].loggedAt : null,
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

  const handleLogSet = async () => {
    if (!selectedExerciseId) return;

    await logSet(reps, weight, selectedExerciseId);

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
            await finishWorkout();
            navigation.goBack();
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
          <TouchableOpacity onPress={handleCancelWorkout}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
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
                onOpenRestTimer={() => setRestTimerModalVisible(true)}
                weight={weight}
                setWeight={setWeight}
                reps={reps}
                setReps={setReps}
                restTimerSeconds={customRestTime}
              />
            );
          })}

          {/* Add Exercise Button */}
          <TouchableOpacity
            style={styles.addExerciseButton}
            onPress={handleAddExercise}
          >
            <Text style={styles.addExerciseText}>+ Add Exercise</Text>
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
      </View>
    </SafeAreaView>
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
  onOpenRestTimer: () => void;
  weight: number;
  setWeight: (w: number) => void;
  reps: number;
  setReps: (r: number) => void;
  restTimerSeconds: number;
}

function ExerciseCard({
  exercise,
  currentSets,
  history,
  isExpanded,
  onToggle,
  onLogSet,
  onDeleteSet,
  onOpenRestTimer,
  weight,
  setWeight,
  reps,
  setReps,
  restTimerSeconds,
}: ExerciseCardProps) {
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
        <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      {/* Expanded Content */}
      {isExpanded && (
        <View style={styles.exerciseContent}>
          {/* Last Session History */}
          {history && history.sets.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.historyTitle}>
                Last session ({history.date ? format(new Date(history.date), 'MMM d') : 'N/A'})
              </Text>
              <View style={styles.historyRow}>
                {history.sets.slice(0, 5).map((set, idx) => (
                  <Text key={set.id} style={styles.historySet}>
                    {set.weight}×{set.reps}
                    {idx < Math.min(history.sets.length, 5) - 1 ? '  ' : ''}
                  </Text>
                ))}
                {history.sets.length > 5 && (
                  <Text style={styles.historyMore}>+{history.sets.length - 5} more</Text>
                )}
              </View>
            </View>
          )}

          {/* Current Session Sets */}
          {currentSets.length > 0 && (
            <View style={styles.currentSetsSection}>
              <Text style={styles.currentSetsTitle}>This session</Text>
              {currentSets.map((set, index) => (
                <View key={set.id} style={styles.currentSetRow}>
                  <Text style={styles.currentSetNumber}>Set {index + 1}</Text>
                  <Text style={styles.currentSetDetail}>
                    {set.weight} lbs × {set.reps} reps
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
            <View style={styles.inputRow}>
              <NumberInput
                value={weight}
                onChangeValue={setWeight}
                label="Weight (lbs)"
                step={5}
                min={0}
                max={1000}
              />
              <NumberInput
                value={reps}
                onChangeValue={setReps}
                label="Reps"
                step={1}
                min={1}
                max={100}
              />
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
  expandIcon: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
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
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
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
});

export default ActiveWorkoutScreen;
