import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';

// Generate UUID using expo-crypto (uuid library crashes on React Native)
const generateId = () => Crypto.randomUUID();
import * as Haptics from 'expo-haptics';

// Configure notifications to show when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
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
  endTime: number | null; // Unix timestamp when timer should end (for background support)
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
  swapExercise: (oldExerciseId: string, newExerciseId: string) => void;

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
    endTime: null,
  });
  const [lastSessionData, setLastSessionData] = useState<LastSessionData | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const notificationIdRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Load user settings on mount
  useEffect(() => {
    getUserSettings().then(setUserSettings);
  }, []);

  // Request notification permissions on mount
  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS !== 'web') {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        if (existingStatus !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
      }
    };
    requestPermissions();
  }, []);

  // Handle app state changes for background timer support
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to foreground - recalculate timer from endTime
        setRestTimer(prev => {
          if (prev.isRunning && prev.endTime) {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((prev.endTime - now) / 1000));
            if (remaining <= 0) {
              // Timer finished while in background
              playTimerEndSound();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              return { ...prev, isRunning: false, secondsRemaining: 0, endTime: null };
            }
            return { ...prev, secondsRemaining: remaining };
          }
          return prev;
        });
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
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
            // Cancel notification since timer completed in foreground
            if (notificationIdRef.current) {
              Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
              notificationIdRef.current = null;
            }
            return { ...prev, isRunning: false, secondsRemaining: 0, endTime: null };
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
      id: generateId(),
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
    await stopRestTimer();
  }, [activeWorkout, stopRestTimer]);

  const cancelWorkout = useCallback(async () => {
    // Note: We keep the workout and sets in storage even if cancelled
    // The user might want to continue later or review partial data
    setActiveWorkout(null);
    setLastSessionData(null);
    await stopRestTimer();
  }, [stopRestTimer]);

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

  const swapExercise = useCallback((oldExerciseId: string, newExerciseId: string) => {
    if (!activeWorkout) return;

    // Swap the exercise in the exerciseIds array (one-time swap for this session)
    setActiveWorkout(prev => {
      if (!prev) return null;
      const newExerciseIds = prev.exerciseIds.map(id =>
        id === oldExerciseId ? newExerciseId : id
      );
      return {
        ...prev,
        exerciseIds: newExerciseIds,
        // Update currentExerciseId if the swapped exercise was selected
        currentExerciseId: prev.currentExerciseId === oldExerciseId
          ? newExerciseId
          : prev.currentExerciseId,
      };
    });

    // Load last session data for the new exercise
    getLastSetsForExercise(newExerciseId).then(lastSets => {
      setLastSessionData({ exerciseId: newExerciseId, sets: lastSets });
    });
  }, [activeWorkout]);

  const logSet = useCallback(async (reps: number, weight: number, exerciseId?: string) => {
    if (!activeWorkout) return;

    // Use provided exerciseId or fall back to currentExerciseId
    const targetExerciseId = exerciseId || activeWorkout.currentExerciseId;
    if (!targetExerciseId) return;

    const set: WorkoutSet = {
      id: generateId(),
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

  const startRestTimer = useCallback(async (seconds?: number) => {
    const timerSeconds = seconds || userSettings?.restTimerSeconds || 90;
    const endTime = Date.now() + timerSeconds * 1000;

    // Cancel any existing notification
    if (notificationIdRef.current) {
      await Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
    }

    // Schedule notification for when timer ends
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Rest Timer Complete',
          body: 'Time to start your next set!',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: timerSeconds,
        },
      });
      notificationIdRef.current = notificationId;
    } catch (error) {
      console.log('Failed to schedule notification:', error);
    }

    setRestTimer({
      isRunning: true,
      secondsRemaining: timerSeconds,
      totalSeconds: timerSeconds,
      endTime,
    });
  }, [userSettings]);

  const stopRestTimer = useCallback(async () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    // Cancel scheduled notification
    if (notificationIdRef.current) {
      await Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
      notificationIdRef.current = null;
    }
    setRestTimer(prev => ({ ...prev, isRunning: false, endTime: null }));
  }, []);

  const resetRestTimer = useCallback(async () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    // Cancel scheduled notification
    if (notificationIdRef.current) {
      await Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
      notificationIdRef.current = null;
    }
    setRestTimer(prev => ({
      isRunning: false,
      secondsRemaining: prev.totalSeconds,
      totalSeconds: prev.totalSeconds,
      endTime: null,
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
    swapExercise,
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
