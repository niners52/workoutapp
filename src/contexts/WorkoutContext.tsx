import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import {
  Workout,
  WorkoutSet,
  Exercise,
  Template,
  UserSettings,
} from '../types';
import {
  addWorkout,
  updateWorkout,
  addSet,
  deleteSet,
  updateSet,
  getSetsByWorkoutId,
  getLastSetsForExercise,
  getExerciseById,
  getTemplateById,
  getUserSettings,
} from '../services/storage';
import { saveWorkoutToHealthKit } from '../services/healthKit';

interface ActiveWorkoutState {
  workout: Workout;
  sets: WorkoutSet[];
  currentExerciseId: string | null;
  currentExerciseIndex: number;
  exerciseIds: string[]; // Ordered list of exercises for this workout
}

interface RestTimerState {
  isRunning: boolean;
  secondsRemaining: number;
  totalSeconds: number;
}

interface LastSessionData {
  exerciseId: string;
  sets: WorkoutSet[];
}

interface WorkoutContextType {
  // Active workout state
  activeWorkout: ActiveWorkoutState | null;
  isWorkoutActive: boolean;

  // Rest timer state
  restTimer: RestTimerState;

  // Last session data for current exercise
  lastSessionData: LastSessionData | null;

  // Workout actions
  startWorkout: (templateId?: string) => Promise<string>;
  finishWorkout: () => Promise<void>;
  cancelWorkout: () => Promise<void>;

  // Exercise actions
  setCurrentExercise: (exerciseId: string) => void;
  addExerciseToWorkout: (exerciseId: string) => void;
  removeExerciseFromWorkout: (exerciseId: string) => void;
  reorderExercises: (exerciseIds: string[]) => void;
  switchTemplate: (templateId: string) => Promise<void>;

  // Set actions
  logSet: (reps: number, weight: number, exerciseId?: string) => Promise<void>;
  removeSet: (setId: string) => Promise<void>;
  editSet: (setId: string, reps: number, weight: number) => Promise<void>;

  // Rest timer actions
  startRestTimer: (seconds?: number) => void;
  stopRestTimer: () => void;
  resetRestTimer: () => void;

  // Utility
  refreshLastSessionData: () => Promise<void>;
  getSetsForExercise: (exerciseId: string) => WorkoutSet[];
}

const WorkoutContext = createContext<WorkoutContextType | null>(null);

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkoutState | null>(null);
  const [restTimer, setRestTimer] = useState<RestTimerState>({
    isRunning: false,
    secondsRemaining: 0,
    totalSeconds: 90,
  });
  const [lastSessionData, setLastSessionData] = useState<LastSessionData | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Load user settings on mount
  useEffect(() => {
    getUserSettings().then(setUserSettings);
  }, []);

  // Rest timer logic
  useEffect(() => {
    if (restTimer.isRunning && restTimer.secondsRemaining > 0) {
      timerIntervalRef.current = setInterval(() => {
        setRestTimer(prev => {
          if (prev.secondsRemaining <= 1) {
            // Timer finished
            playTimerEndSound();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return { ...prev, isRunning: false, secondsRemaining: 0 };
          }
          return { ...prev, secondsRemaining: prev.secondsRemaining - 1 };
        });
      }, 1000);

      return () => {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
        }
      };
    }
  }, [restTimer.isRunning, restTimer.secondsRemaining]);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const playTimerEndSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/timer-end.mp3'),
        { shouldPlay: true }
      );
      soundRef.current = sound;
    } catch (error) {
      // Sound file might not exist yet, just use haptics
      console.log('Timer sound not available');
    }
  };

  const startWorkout = useCallback(async (templateId?: string): Promise<string> => {
    const workout: Workout = {
      id: uuidv4(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      templateId: templateId || null,
    };

    await addWorkout(workout);

    let exerciseIds: string[] = [];
    if (templateId) {
      const template = await getTemplateById(templateId);
      if (template) {
        exerciseIds = [...template.exerciseIds];
      }
    }

    // Load last session data for first exercise
    let initialLastSessionData: LastSessionData | null = null;
    if (exerciseIds[0]) {
      const lastSets = await getLastSetsForExercise(exerciseIds[0]);
      initialLastSessionData = { exerciseId: exerciseIds[0], sets: lastSets };
    }

    // Set both states synchronously to avoid race conditions
    setActiveWorkout({
      workout,
      sets: [],
      currentExerciseId: exerciseIds[0] || null,
      currentExerciseIndex: 0,
      exerciseIds,
    });

    if (initialLastSessionData) {
      setLastSessionData(initialLastSessionData);
    }

    return workout.id;
  }, []);

  const finishWorkout = useCallback(async () => {
    if (!activeWorkout) return;

    const completedWorkout: Workout = {
      ...activeWorkout.workout,
      completedAt: new Date().toISOString(),
    };

    await updateWorkout(completedWorkout);

    // Save to Apple Health
    try {
      const startDate = new Date(activeWorkout.workout.startedAt);
      const endDate = new Date();
      // Estimate calories: rough estimate of 5 calories per set
      const estimatedCalories = activeWorkout.sets.length * 5;
      await saveWorkoutToHealthKit(startDate, endDate, estimatedCalories);
    } catch (error) {
      console.log('Failed to save workout to HealthKit:', error);
    }

    setActiveWorkout(null);
    setLastSessionData(null);
    stopRestTimer();
  }, [activeWorkout]);

  const cancelWorkout = useCallback(async () => {
    // Note: We keep the workout and sets in storage even if cancelled
    // The user might want to continue later or review partial data
    setActiveWorkout(null);
    setLastSessionData(null);
    stopRestTimer();
  }, []);

  const setCurrentExercise = useCallback((exerciseId: string) => {
    if (!activeWorkout) return;

    const index = activeWorkout.exerciseIds.indexOf(exerciseId);
    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        currentExerciseId: exerciseId,
        currentExerciseIndex: index >= 0 ? index : prev.currentExerciseIndex,
      };
    });

    // Load last session data
    getLastSetsForExercise(exerciseId).then(lastSets => {
      setLastSessionData({ exerciseId, sets: lastSets });
    });
  }, [activeWorkout]);

  const addExerciseToWorkout = useCallback((exerciseId: string) => {
    if (!activeWorkout) return;

    if (!activeWorkout.exerciseIds.includes(exerciseId)) {
      setActiveWorkout(prev => {
        if (!prev) return null;
        const newExerciseIds = [...prev.exerciseIds, exerciseId];
        return {
          ...prev,
          exerciseIds: newExerciseIds,
          currentExerciseId: prev.currentExerciseId || exerciseId,
        };
      });
    }
  }, [activeWorkout]);

  const removeExerciseFromWorkout = useCallback((exerciseId: string) => {
    if (!activeWorkout) return;

    setActiveWorkout(prev => {
      if (!prev) return null;
      const newExerciseIds = prev.exerciseIds.filter(id => id !== exerciseId);
      const newIndex = Math.min(prev.currentExerciseIndex, newExerciseIds.length - 1);
      return {
        ...prev,
        exerciseIds: newExerciseIds,
        currentExerciseId: newExerciseIds[newIndex] || null,
        currentExerciseIndex: newIndex >= 0 ? newIndex : 0,
      };
    });
  }, [activeWorkout]);

  const reorderExercises = useCallback((exerciseIds: string[]) => {
    if (!activeWorkout) return;

    setActiveWorkout(prev => {
      if (!prev) return null;
      const newIndex = prev.currentExerciseId
        ? exerciseIds.indexOf(prev.currentExerciseId)
        : 0;
      return {
        ...prev,
        exerciseIds,
        currentExerciseIndex: newIndex >= 0 ? newIndex : 0,
      };
    });
  }, [activeWorkout]);

  const switchTemplate = useCallback(async (templateId: string) => {
    if (!activeWorkout) return;

    const template = await getTemplateById(templateId);
    if (!template) return;

    // Keep existing logged exercises, add new ones from template
    const existingWithSets = new Set(
      activeWorkout.sets.map(s => s.exerciseId)
    );

    const newExerciseIds = [
      ...activeWorkout.exerciseIds.filter(id => existingWithSets.has(id)),
      ...template.exerciseIds.filter(id => !existingWithSets.has(id)),
    ];

    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        workout: { ...prev.workout, templateId },
        exerciseIds: newExerciseIds,
      };
    });
  }, [activeWorkout]);

  const logSet = useCallback(async (reps: number, weight: number, exerciseId?: string) => {
    if (!activeWorkout) return;

    // Use provided exerciseId or fall back to currentExerciseId
    const targetExerciseId = exerciseId || activeWorkout.currentExerciseId;
    if (!targetExerciseId) return;

    const set: WorkoutSet = {
      id: uuidv4(),
      workoutId: activeWorkout.workout.id,
      exerciseId: targetExerciseId,
      reps,
      weight,
      loggedAt: new Date().toISOString(),
    };

    await addSet(set);

    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        sets: [...prev.sets, set],
      };
    });

    // Start rest timer automatically
    const timerSeconds = userSettings?.restTimerSeconds || 90;
    startRestTimer(timerSeconds);

    // Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [activeWorkout, userSettings]);

  const removeSet = useCallback(async (setId: string) => {
    if (!activeWorkout) return;

    await deleteSet(setId);

    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        sets: prev.sets.filter(s => s.id !== setId),
      };
    });
  }, [activeWorkout]);

  const editSet = useCallback(async (setId: string, reps: number, weight: number) => {
    if (!activeWorkout) return;

    const existingSet = activeWorkout.sets.find(s => s.id === setId);
    if (!existingSet) return;

    const updatedSet: WorkoutSet = {
      ...existingSet,
      reps,
      weight,
    };

    await updateSet(updatedSet);

    setActiveWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        sets: prev.sets.map(s => s.id === setId ? updatedSet : s),
      };
    });
  }, [activeWorkout]);

  const startRestTimer = useCallback((seconds?: number) => {
    const timerSeconds = seconds || userSettings?.restTimerSeconds || 90;
    setRestTimer({
      isRunning: true,
      secondsRemaining: timerSeconds,
      totalSeconds: timerSeconds,
    });
  }, [userSettings]);

  const stopRestTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    setRestTimer(prev => ({ ...prev, isRunning: false }));
  }, []);

  const resetRestTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    setRestTimer(prev => ({
      isRunning: false,
      secondsRemaining: prev.totalSeconds,
      totalSeconds: prev.totalSeconds,
    }));
  }, []);

  const refreshLastSessionData = useCallback(async () => {
    if (!activeWorkout?.currentExerciseId) return;

    const lastSets = await getLastSetsForExercise(activeWorkout.currentExerciseId);
    setLastSessionData({ exerciseId: activeWorkout.currentExerciseId, sets: lastSets });
  }, [activeWorkout?.currentExerciseId]);

  const getSetsForExercise = useCallback((exerciseId: string): WorkoutSet[] => {
    if (!activeWorkout) return [];
    return activeWorkout.sets.filter(s => s.exerciseId === exerciseId);
  }, [activeWorkout]);

  const value: WorkoutContextType = {
    activeWorkout,
    isWorkoutActive: activeWorkout !== null,
    restTimer,
    lastSessionData,
    startWorkout,
    finishWorkout,
    cancelWorkout,
    setCurrentExercise,
    addExerciseToWorkout,
    removeExerciseFromWorkout,
    reorderExercises,
    switchTemplate,
    logSet,
    removeSet,
    editSet,
    startRestTimer,
    stopRestTimer,
    resetRestTimer,
    refreshLastSessionData,
    getSetsForExercise,
  };

  return (
    <WorkoutContext.Provider value={value}>
      {children}
    </WorkoutContext.Provider>
  );
}

export function useWorkout() {
  const context = useContext(WorkoutContext);
  if (!context) {
    throw new Error('useWorkout must be used within a WorkoutProvider');
  }
  return context;
}
