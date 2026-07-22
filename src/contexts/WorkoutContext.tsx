import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { liveActivityService } from '../services/liveActivity';
import {
  sendWorkoutStateToWatch,
  sendRestTimerToWatch,
  sendWorkoutEndedToWatch,
  onWatchSetLogged,
  onWatchRequestState,
  isWatchConnectivityAvailable,
  WatchWorkoutState,
} from '../services/watchConnectivity';

// Generate UUID using expo-crypto (uuid library crashes on React Native)
const generateId = () => Crypto.randomUUID();
import * as Haptics from 'expo-haptics';

// Configure notifications to show when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
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
  getLastUsedLocationId,
  getExerciseById,
  getTemplateById,
  getUserSettings,
  getWorkoutById,
  saveActiveWorkoutState,
  getActiveWorkoutState,
  clearActiveWorkoutState,
  upsertExerciseSwap,
} from '../services/storage';
import { saveWorkoutToHealthKit } from '../services/healthKit';
import {
  syncWorkout,
  syncSet,
  syncDeleteSet,
} from '../services/syncService';
import { syncPartnerStatsAfterWorkout } from '../services/partnershipService';

interface ActiveWorkoutState {
  workout: Workout;
  sets: WorkoutSet[];
  currentExerciseId: string | null;
  currentExerciseIndex: number;
  exerciseIds: string[]; // Ordered list of exercises for this workout (mutates on swap)
  originalExerciseIds: string[]; // Snapshot from template at workout start, used for net-swap detection
}

interface RestTimerState {
  isRunning: boolean;
  secondsRemaining: number;
  totalSeconds: number;
  endTime: number | null; // Unix timestamp when timer should end (for background support)
  liveActivityId: string | null; // ID of the Live Activity if running on iOS 16.2+
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
  startWorkout: (templateId?: string, exerciseIdsOverride?: string[], locationId?: string) => Promise<string>;
  finishWorkout: (skippedExerciseIds?: string[]) => Promise<void>;
  cancelWorkout: () => Promise<void>;
  updateActiveWorkoutLocation: (locationId: string) => Promise<void>;

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

  // Recovery
  recoveredWorkout: boolean;
  dismissRecovery: () => void;

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
    liveActivityId: null,
  });
  const liveActivitySupportedRef = useRef<boolean | null>(null);
  const [lastSessionData, setLastSessionData] = useState<LastSessionData | null>(null);
  const [recoveredWorkout, setRecoveredWorkout] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const notificationIdRef = useRef<string | null>(null);
  const workoutNotificationIdRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastWatchStateSentRef = useRef<number>(0);
  const exerciseNamesRef = useRef<Map<string, string>>(new Map());

  const dismissRecovery = useCallback(() => {
    setRecoveredWorkout(false);
  }, []);

  // Restore active workout state on mount (after app termination)
  useEffect(() => {
    const restore = async () => {
      try {
        const saved = await getActiveWorkoutState();
        if (!saved) {
          // No active workout — clean up any orphaned Live Activities from previous session
          await liveActivityService.endAllActivities();
          return;
        }

        const workout = await getWorkoutById(saved.workout.id);
        if (!workout || workout.completedAt !== null) {
          await clearActiveWorkoutState();
          // Workout is done — clean up any stale Live Activities
          await liveActivityService.endAllActivities();
          return;
        }

        const sets = await getSetsByWorkoutId(saved.workout.id);
        setActiveWorkout({
          workout,
          sets,
          exerciseIds: saved.exerciseIds,
          // Fall back to the (possibly already-swapped) exerciseIds for legacy persisted
          // states that pre-date this field. Net-swap detection won't work for those,
          // but no swap will be falsely recorded either.
          originalExerciseIds: saved.originalExerciseIds ?? saved.exerciseIds,
          currentExerciseId: saved.currentExerciseId,
          currentExerciseIndex: saved.currentExerciseIndex,
        });
        // Don't set recoveredWorkout — the active workout bar already
        // shows the user there's an active workout to resume.
        // Clean up any stale Live Activities (rest timer doesn't survive app restart)
        await liveActivityService.endAllActivities();
      } catch (error) {
        console.log('Failed to restore active workout:', error);
        await clearActiveWorkoutState();
        await liveActivityService.endAllActivities();
      }
    };

    restore();
  }, []);

  // Persist active workout state to AsyncStorage on structural changes
  useEffect(() => {
    if (activeWorkout) {
      saveActiveWorkoutState({
        workout: activeWorkout.workout,
        exerciseIds: activeWorkout.exerciseIds,
        originalExerciseIds: activeWorkout.originalExerciseIds,
        currentExerciseId: activeWorkout.currentExerciseId,
        currentExerciseIndex: activeWorkout.currentExerciseIndex,
      }).catch(e => console.log('Failed to persist active workout:', e));
    }
  }, [
    activeWorkout?.workout.id,
    activeWorkout?.exerciseIds,
    activeWorkout?.originalExerciseIds,
    activeWorkout?.currentExerciseId,
    activeWorkout?.currentExerciseIndex,
  ]);

  // Helper to format seconds as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Update the persistent workout notification
  const updateWorkoutNotification = useCallback(async (
    title: string,
    body: string,
    isTimerActive: boolean = false
  ) => {
    if (Platform.OS === 'web') return;

    try {
      // Cancel existing workout notification
      if (workoutNotificationIdRef.current) {
        await Notifications.dismissNotificationAsync(workoutNotificationIdRef.current);
      }

      // Show new notification (immediate, not scheduled)
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: false,
          sticky: true, // Keep notification visible
          autoDismiss: false,
        },
        trigger: null, // Show immediately
      });
      workoutNotificationIdRef.current = notificationId;
    } catch (error) {
      console.log('Failed to update workout notification:', error);
    }
  }, []);

  // Dismiss the persistent workout notification
  const dismissWorkoutNotification = useCallback(async () => {
    if (workoutNotificationIdRef.current) {
      try {
        await Notifications.dismissNotificationAsync(workoutNotificationIdRef.current);
        workoutNotificationIdRef.current = null;
      } catch (error) {
        console.log('Failed to dismiss workout notification:', error);
      }
    }
  }, []);

  // Load user settings on mount
  useEffect(() => {
    getUserSettings().then(setUserSettings);
  }, []);

  // Check Live Activity support on mount
  useEffect(() => {
    const checkLiveActivitySupport = async () => {
      const supported = await liveActivityService.isSupported();
      liveActivitySupportedRef.current = supported;
      console.log('Live Activities supported:', supported);
    };
    checkLiveActivitySupport();
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

              // End the Live Activity that's stuck at 0:00
              if (prev.liveActivityId) {
                liveActivityService.endTimerWithAlert();
              }

              return { ...prev, isRunning: false, secondsRemaining: 0, endTime: null, liveActivityId: null };
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

  // Rest timer logic - counts down for UI updates, Live Activity handles visual display
  useEffect(() => {
    if (restTimer.isRunning && restTimer.secondsRemaining > 0) {
      timerIntervalRef.current = setInterval(() => {
        setRestTimer(prev => {
          if (prev.secondsRemaining <= 1) {
            // Timer finished
            playTimerEndSound();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // Cancel scheduled notification since timer completed in foreground
            if (notificationIdRef.current) {
              Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
              notificationIdRef.current = null;
            }

            // End the Live Activity with completion state
            if (prev.liveActivityId) {
              liveActivityService.endTimerWithAlert();
            }

            // Send a single completion notification (for devices without Live Activity)
            if (!liveActivitySupportedRef.current) {
              Notifications.scheduleNotificationAsync({
                content: {
                  title: 'Rest Timer Complete',
                  body: 'Time to start your next set!',
                  sound: true,
                },
                trigger: null, // Immediate
              });
            }

            return { ...prev, isRunning: false, secondsRemaining: 0, endTime: null, liveActivityId: null };
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

  const startWorkout = useCallback(async (
    templateId?: string,
    exerciseIdsOverride?: string[],
    locationId?: string,
  ): Promise<string> => {
    // Resolve location: explicit choice wins, otherwise reuse the last location the
    // user trained at so per-location weight history stays meaningful even on the
    // quick-start / repeat paths that don't surface a location picker.
    const resolvedLocationId = locationId ?? (await getLastUsedLocationId());

    const workout: Workout = {
      id: generateId(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      templateId: templateId || null,
      locationId: resolvedLocationId,
      isDeload: userSettings?.isOnDeload || undefined,
    };

    await addWorkout(workout);
    // Fire-and-forget sync to cloud
    syncWorkout(workout).catch(e => console.log('Sync error:', e));

    // Resolve the starting exercise lineup. Explicit overrides win (used by
    // "Create as Workout" from a past session), otherwise pull from the template.
    let exerciseIds: string[] = [];
    if (exerciseIdsOverride?.length) {
      exerciseIds = [...exerciseIdsOverride];
    } else if (templateId) {
      const template = await getTemplateById(templateId);
      if (template) {
        exerciseIds = [...template.exerciseIds];
      }
    }

    // Load last session data for first exercise
    let initialLastSessionData: LastSessionData | null = null;
    if (exerciseIds[0]) {
      const lastSets = await getLastSetsForExercise(exerciseIds[0], 5, resolvedLocationId);
      initialLastSessionData = { exerciseId: exerciseIds[0], sets: lastSets };
    }

    // Set both states synchronously to avoid race conditions
    setActiveWorkout({
      workout,
      sets: [],
      currentExerciseId: exerciseIds[0] || null,
      currentExerciseIndex: 0,
      exerciseIds,
      // Snapshot the starting lineup so swap chains (A→B→C) can collapse to net (A→C)
      // and round-trips (A→B→A) can be removed entirely.
      originalExerciseIds: [...exerciseIds],
    });

    if (initialLastSessionData) {
      setLastSessionData(initialLastSessionData);
    }

    // Show persistent workout notification
    updateWorkoutNotification(
      'Workout in Progress',
      `${exerciseIds.length} exercises • Tap to return`
    );

    return workout.id;
  }, [updateWorkoutNotification]);

  // Reassign the active workout's location mid-session. Persists to storage directly
  // because the auto-persist effect only watches a fixed set of fields (not locationId).
  const updateActiveWorkoutLocation = useCallback(async (locationId: string) => {
    setActiveWorkout(prev => {
      if (!prev) return prev;
      const updatedWorkout = { ...prev.workout, locationId };
      // Fire-and-forget persistence of the new location.
      updateWorkout(updatedWorkout).catch(e => console.log('Failed to persist location:', e));
      saveActiveWorkoutState({
        workout: updatedWorkout,
        exerciseIds: prev.exerciseIds,
        originalExerciseIds: prev.originalExerciseIds,
        currentExerciseId: prev.currentExerciseId,
        currentExerciseIndex: prev.currentExerciseIndex,
      }).catch(e => console.log('Failed to persist active workout location:', e));
      return { ...prev, workout: updatedWorkout };
    });
  }, []);

  const stopRestTimer = useCallback(async () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    // Cancel scheduled notification
    if (notificationIdRef.current) {
      await Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
      notificationIdRef.current = null;
    }
    // Stop the Live Activity
    await liveActivityService.stopTimer();
    setRestTimer(prev => ({ ...prev, isRunning: false, endTime: null, liveActivityId: null }));
  }, []);

  const finishWorkout = useCallback(async (skippedExerciseIds?: string[]) => {
    if (!activeWorkout) return;

    const completedWorkout: Workout = {
      ...activeWorkout.workout,
      completedAt: new Date().toISOString(),
      ...(skippedExerciseIds?.length ? { skippedExerciseIds } : {}),
    };

    await updateWorkout(completedWorkout);
    // Fire-and-forget sync to cloud
    syncWorkout(completedWorkout).catch(e => console.log('Sync error:', e));

    // Fire-and-forget partner stats sync
    const templateType = activeWorkout.workout.templateId
      ? (await getTemplateById(activeWorkout.workout.templateId))?.name || 'Workout'
      : 'Workout';
    syncPartnerStatsAfterWorkout(templateType, activeWorkout.sets.length)
      .catch(e => console.log('Partner stats sync error:', e));

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
    await clearActiveWorkoutState();
    await stopRestTimer();
    await dismissWorkoutNotification();
  }, [activeWorkout, stopRestTimer, dismissWorkoutNotification]);

  const cancelWorkout = useCallback(async () => {
    // Note: We keep the workout and sets in storage even if cancelled
    // The user might want to continue later or review partial data
    setActiveWorkout(null);
    setLastSessionData(null);
    await clearActiveWorkoutState();
    await stopRestTimer();
    await dismissWorkoutNotification();
  }, [stopRestTimer, dismissWorkoutNotification]);

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

    // Persist a net-swap record so the home screen can show "Original → Current" for the week.
    // The slot's "original" comes from the snapshot taken at workout start, so a chain like
    // A→B→C collapses to (original=A, current=C) and a round trip A→B→A removes the row entirely.
    const slotIndex = activeWorkout.exerciseIds.indexOf(oldExerciseId);
    const originalExerciseId =
      slotIndex >= 0 ? activeWorkout.originalExerciseIds[slotIndex] : oldExerciseId;
    if (originalExerciseId) {
      // Stable ID per (workout, slot original) — keeps the upsert idempotent across edits.
      const swapId = `swap-${activeWorkout.workout.id}-${originalExerciseId}`;
      upsertExerciseSwap({
        id: swapId,
        workoutId: activeWorkout.workout.id,
        originalExerciseId,
        currentExerciseId: newExerciseId,
        swappedAt: new Date().toISOString(),
      }).catch(e => console.log('Failed to persist exercise swap:', e));
    }

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
    // Fire-and-forget sync to cloud
    syncSet(set).catch(e => console.log('Sync error:', e));
    syncWorkout(activeWorkout.workout).catch(e => console.log('Sync error:', e));

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
    // Fire-and-forget sync to cloud
    syncDeleteSet(setId).catch(e => console.log('Sync error:', e));

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
    // Fire-and-forget sync to cloud
    syncSet(updatedSet).catch(e => console.log('Sync error:', e));

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

    // Try to start a Live Activity (iOS 16.2+)
    let liveActivityId: string | null = null;
    if (liveActivitySupportedRef.current) {
      liveActivityId = await liveActivityService.startTimer(timerSeconds);
    }

    // Schedule a backup notification for when timer ends
    // This is for: 1) devices without Live Activity support, 2) if app is terminated
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
      liveActivityId,
    });
  }, [userSettings]);

  const resetRestTimer = useCallback(async () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    // Cancel scheduled notification
    if (notificationIdRef.current) {
      await Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
      notificationIdRef.current = null;
    }
    // Stop the Live Activity
    await liveActivityService.stopTimer();
    setRestTimer(prev => ({
      isRunning: false,
      secondsRemaining: prev.totalSeconds,
      totalSeconds: prev.totalSeconds,
      endTime: null,
      liveActivityId: null,
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

  // Build and send Watch workout state (debounced to max once per second)
  const sendWatchState = useCallback(async () => {
    if (!isWatchConnectivityAvailable() || !activeWorkout) return;

    const now = Date.now();
    if (now - lastWatchStateSentRef.current < 1000) return; // Debounce
    lastWatchStateSentRef.current = now;

    const currentExerciseId = activeWorkout.currentExerciseId;
    let exerciseName = 'Unknown Exercise';
    // Real effective target for the Watch display — per-exercise targetSets first,
    // then the unilateral-aware default. Was previously hard-coded to 3, so the
    // Watch showed "of 3" even for 6-set unilateral exercises.
    let watchTargetSets = userSettings?.defaultTargetSets ?? 3;

    if (currentExerciseId) {
      // Check cache first (names only), but always resolve target from storage
      const exercise = await getExerciseById(currentExerciseId);
      if (exercise) {
        exerciseName = exercise.name;
        exerciseNamesRef.current.set(currentExerciseId, exercise.name);
        const base = userSettings?.defaultTargetSets ?? 3;
        watchTargetSets = exercise.targetSets ?? (exercise.isUnilateral ? base * 2 : base);
      } else if (exerciseNamesRef.current.has(currentExerciseId)) {
        exerciseName = exerciseNamesRef.current.get(currentExerciseId) || exerciseName;
      }
    }

    const setsForCurrentExercise = currentExerciseId
      ? activeWorkout.sets.filter(s => s.exerciseId === currentExerciseId)
      : [];
    const lastSet = setsForCurrentExercise[setsForCurrentExercise.length - 1];

    const watchState: WatchWorkoutState = {
      isActive: true,
      exerciseName,
      exerciseIndex: activeWorkout.currentExerciseIndex,
      totalExercises: activeWorkout.exerciseIds.length,
      currentSetNumber: setsForCurrentExercise.length + 1,
      targetSets: watchTargetSets,
      lastWeight: lastSet?.weight || 0,
      lastReps: lastSet?.reps || 0,
      restTimerActive: restTimer.isRunning,
      restTimerRemaining: restTimer.secondsRemaining,
      restTimerTotal: restTimer.totalSeconds,
      unitSystem: userSettings?.units || 'imperial',
    };

    sendWorkoutStateToWatch(watchState);
  }, [activeWorkout, restTimer, userSettings]);

  // Send state to Watch when workout state changes
  useEffect(() => {
    if (activeWorkout) {
      sendWatchState();
    } else if (isWatchConnectivityAvailable()) {
      sendWorkoutEndedToWatch();
    }
  }, [
    activeWorkout?.workout.id,
    activeWorkout?.currentExerciseId,
    activeWorkout?.sets.length,
    activeWorkout?.exerciseIds.length,
  ]);

  // Send rest timer updates to Watch
  useEffect(() => {
    if (!isWatchConnectivityAvailable() || !activeWorkout?.currentExerciseId) return;

    const exerciseName = exerciseNamesRef.current.get(activeWorkout.currentExerciseId) || 'Exercise';
    sendRestTimerToWatch(
      restTimer.secondsRemaining,
      restTimer.totalSeconds,
      exerciseName,
      restTimer.isRunning
    );
  }, [restTimer.secondsRemaining, restTimer.isRunning, activeWorkout?.currentExerciseId]);

  // Subscribe to Watch events
  useEffect(() => {
    if (!isWatchConnectivityAvailable()) return;

    // Handle set logged from Watch
    const unsubSetLogged = onWatchSetLogged(async (data) => {
      if (!activeWorkout) return;

      // Get the exercise at the specified index
      const exerciseId = activeWorkout.exerciseIds[data.exerciseIndex];
      if (!exerciseId) return;

      // Log the set
      await logSet(data.reps, data.weight, exerciseId);
    });

    // Handle Watch requesting current state
    const unsubRequestState = onWatchRequestState(() => {
      sendWatchState();
    });

    return () => {
      unsubSetLogged();
      unsubRequestState();
    };
  }, [activeWorkout, logSet, sendWatchState]);

  const value: WorkoutContextType = {
    activeWorkout,
    isWorkoutActive: activeWorkout !== null,
    restTimer,
    lastSessionData,
    startWorkout,
    finishWorkout,
    cancelWorkout,
    updateActiveWorkoutLocation,
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
    recoveredWorkout,
    dismissRecovery,
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
