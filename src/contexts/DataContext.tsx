import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Exercise,
  Template,
  Workout,
  WorkoutSet,
  UserSettings,
  WorkoutLocation,
  Supplement,
  SupplementIntake,
  PTRoutine,
  PTCompletion,
  Routine,
  BodyMeasurement,
  ExerciseSwap,
  DEFAULT_USER_SETTINGS,
  DEFAULT_LOCATIONS,
} from '../types';
import {
  initializeStorage,
  getExercises,
  getTemplates,
  getLocations,
  getWorkouts,
  getSets,
  getUserSettings,
  getSupplements,
  getSupplementIntakes,
  getRoutines,
  getBodyMeasurements,
  getExerciseSwaps,
  restoreFromBackup,
  getActiveWorkoutState,
} from '../services/storage';
import { initializeHealthKit } from '../services/healthKit';
import { syncWeeklyPlannerReminder } from '../services/weeklyPlannerReminder';
import { supabase } from '../services/supabase';
import {
  syncExercise,
  syncDeleteExercise,
  syncSet,
  syncTemplate,
  syncDeleteTemplate,
  syncLocation,
  syncDeleteLocation,
  syncSupplement,
  syncDeleteSupplement,
  syncSupplementIntake,
  syncDeleteSupplementIntake,
  syncRoutine,
  syncDeleteRoutine,
  syncBodyMeasurement,
  syncDeleteBodyMeasurement,
  syncUserSettings,
  syncManager,
  pullFromCloud,
  getLastCloudPull,
  setLastCloudPull,
  isAuthenticated,
} from '../services/syncService';
import {
  addExercise as addExerciseToStorage,
  updateExercise as updateExerciseInStorage,
  toggleExerciseFavorite as toggleFavoriteInStorage,
  deleteExercise as deleteExerciseFromStorage,
  mergeExercise as mergeExerciseInStorage,
  addTemplate as addTemplateToStorage,
  updateTemplate as updateTemplateInStorage,
  deleteTemplate as deleteTemplateFromStorage,
  addLocation as addLocationToStorage,
  updateLocation as updateLocationInStorage,
  deleteLocation as deleteLocationFromStorage,
  reorderLocations as reorderLocationsInStorage,
  updateUserSettings as updateUserSettingsInStorage,
  addSupplement as addSupplementToStorage,
  updateSupplement as updateSupplementInStorage,
  deleteSupplement as deleteSupplementFromStorage,
  addSupplementIntake as addSupplementIntakeToStorage,
  deleteSupplementIntakeBySupplementAndDate,
  addRoutine as addRoutineToStorage,
  updateRoutine as updateRoutineInStorage,
  deleteRoutine as deleteRoutineFromStorage,
  setActiveRoutine as setActiveRoutineInStorage,
  addBodyMeasurement as addBodyMeasurementToStorage,
  updateBodyMeasurement as updateBodyMeasurementInStorage,
  deleteBodyMeasurement as deleteBodyMeasurementFromStorage,
  getPTRoutines,
  getPTCompletions,
  addPTRoutine as addPTRoutineToStorage,
  updatePTRoutine as updatePTRoutineInStorage,
  deletePTRoutine as deletePTRoutineFromStorage,
  addPTCompletion as addPTCompletionToStorage,
  deletePTCompletionByRoutineAndDate,
} from '../services/storage';

interface DataContextType {
  // Loading state
  isLoading: boolean;
  isInitialized: boolean;

  // Data
  exercises: Exercise[];
  templates: Template[];
  locations: WorkoutLocation[];
  workouts: Workout[];
  sets: WorkoutSet[];
  userSettings: UserSettings;

  // Refresh functions
  refreshExercises: () => Promise<void>;
  refreshTemplates: () => Promise<void>;
  refreshLocations: () => Promise<void>;
  refreshWorkouts: () => Promise<void>;
  refreshSets: () => Promise<void>;
  refreshUserSettings: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // Exercise CRUD
  addExercise: (exercise: Exercise) => Promise<void>;
  updateExercise: (exercise: Exercise) => Promise<void>;
  toggleExerciseFavorite: (id: string) => Promise<void>;
  deleteExercise: (id: string) => Promise<void>;
  mergeExercise: (sourceId: string, keeperId: string) => Promise<void>;

  // Template CRUD
  addTemplate: (template: Template) => Promise<void>;
  updateTemplate: (template: Template) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;

  // Location CRUD
  addLocation: (location: WorkoutLocation) => Promise<void>;
  updateLocation: (location: WorkoutLocation) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
  reorderLocations: (locationIds: string[]) => Promise<void>;

  // Supplement data and CRUD
  supplements: Supplement[];
  supplementIntakes: SupplementIntake[];
  refreshSupplements: () => Promise<void>;
  refreshSupplementIntakes: () => Promise<void>;
  addSupplement: (supplement: Supplement) => Promise<void>;
  updateSupplement: (supplement: Supplement) => Promise<void>;
  deleteSupplement: (id: string) => Promise<void>;
  toggleSupplementIntake: (supplementId: string, date: string) => Promise<void>;

  // Physical therapy data and CRUD
  ptRoutines: PTRoutine[];
  ptCompletions: PTCompletion[];
  refreshPTRoutines: () => Promise<void>;
  refreshPTCompletions: () => Promise<void>;
  addPTRoutine: (routine: PTRoutine) => Promise<void>;
  updatePTRoutine: (routine: PTRoutine) => Promise<void>;
  deletePTRoutine: (id: string) => Promise<void>;
  togglePTCompletion: (ptRoutineId: string, date: string) => Promise<void>;

  // Routine data and CRUD
  routines: Routine[];
  refreshRoutines: () => Promise<void>;
  addRoutine: (routine: Routine) => Promise<void>;
  updateRoutine: (routine: Routine) => Promise<void>;
  deleteRoutine: (id: string) => Promise<void>;
  setActiveRoutine: (routineId: string | null) => Promise<void>;
  getActiveRoutine: () => Routine | undefined;
  getRoutineById: (id: string) => Routine | undefined;

  // Exercise swap history (for "This Week's Swaps" on Home)
  exerciseSwaps: ExerciseSwap[];
  refreshExerciseSwaps: () => Promise<void>;

  // Body measurements data and CRUD
  bodyMeasurements: BodyMeasurement[];
  refreshBodyMeasurements: () => Promise<void>;
  addBodyMeasurement: (measurement: BodyMeasurement) => Promise<void>;
  updateBodyMeasurement: (measurement: BodyMeasurement) => Promise<void>;
  deleteBodyMeasurement: (id: string) => Promise<void>;
  getLatestBodyMeasurement: () => BodyMeasurement | undefined;

  // Settings
  updateUserSettings: (settings: Partial<UserSettings>) => Promise<void>;

  // Utility
  getExerciseById: (id: string) => Exercise | undefined;
  getTemplateById: (id: string) => Template | undefined;
  getLocationById: (id: string) => WorkoutLocation | undefined;
  getSupplementById: (id: string) => Supplement | undefined;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [locations, setLocations] = useState<WorkoutLocation[]>(DEFAULT_LOCATIONS);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [supplementIntakes, setSupplementIntakes] = useState<SupplementIntake[]>([]);
  const [ptRoutines, setPTRoutines] = useState<PTRoutine[]>([]);
  const [ptCompletions, setPTCompletions] = useState<PTCompletion[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurement[]>([]);
  const [exerciseSwaps, setExerciseSwaps] = useState<ExerciseSwap[]>([]);

  // One-time migration: backfill completedAt for imported workouts
  const backfillCompletedAt = async () => {
    const MIGRATION_KEY = '@workout_tracker/completedAt_backfilled';

    try {
      // Check if migration already ran
      const alreadyRan = await AsyncStorage.getItem(MIGRATION_KEY);
      if (alreadyRan === 'true') {
        console.log('completedAt backfill already completed');
        return;
      }

      // Get all workouts
      const allWorkouts = await getWorkouts();

      // Exclude the currently active workout (if any) from backfill
      const activeState = await getActiveWorkoutState();
      const activeWorkoutId = activeState?.workout.id;

      // Find workouts that need fixing: have startedAt but no completedAt
      const workoutsToFix = allWorkouts.filter(
        w => w.startedAt && !w.completedAt && w.id !== activeWorkoutId
      );

      if (workoutsToFix.length === 0) {
        console.log('No workouts need completedAt backfill');
        await AsyncStorage.setItem(MIGRATION_KEY, 'true');
        return;
      }

      console.log(`Backfilling completedAt for ${workoutsToFix.length} workouts`);

      // Update each workout locally
      const { updateWorkout } = await import('../services/storage');
      for (const workout of workoutsToFix) {
        const updated = { ...workout, completedAt: workout.startedAt };
        await updateWorkout(updated);
      }

      // Update in Supabase if user is authenticated
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log('Updating Supabase with backfilled completedAt values');
          const updates = workoutsToFix.map(w => ({
            id: w.id,
            user_id: user.id,
            completed_at: w.startedAt,
          }));

          // Upsert in batches of 50
          for (let i = 0; i < updates.length; i += 50) {
            const batch = updates.slice(i, i + 50);
            await supabase
              .from('workouts')
              .upsert(batch, { onConflict: 'id' });
          }
        }
      } catch (supabaseError) {
        console.log('Supabase update skipped (not authenticated or error):', supabaseError);
      }

      // Mark migration as complete
      await AsyncStorage.setItem(MIGRATION_KEY, 'true');
      console.log(`Backfilled completedAt for ${workoutsToFix.length} workouts`);
    } catch (error) {
      console.error('Error during completedAt backfill:', error);
      // Don't throw - we don't want to break app initialization
    }
  };

  // Initialize storage and load data
  useEffect(() => {
    async function init() {
      try {
        await initializeStorage();
        await backfillCompletedAt();
        await refreshAll();

        // Handle cloud sync on launch
        const authenticated = await isAuthenticated();
        if (authenticated) {
          // Start sync manager (processes queue immediately + every 30s)
          syncManager.start();

          // Check if we need to pull from cloud (new device or empty local data)
          const lastPull = await getLastCloudPull();
          const localWorkouts = await getWorkouts();

          if (!lastPull && localWorkouts.length === 0) {
            // New device with no local data - pull from cloud
            console.log('New device detected, pulling data from cloud...');
            const cloudData = await pullFromCloud();
            if (cloudData && (cloudData.workouts.length > 0 || cloudData.exercises.length > 0)) {
              // Restore cloud data to local storage
              await restoreFromBackup({
                exercises: cloudData.exercises,
                templates: cloudData.templates,
                workouts: cloudData.workouts,
                sets: cloudData.sets,
                supplements: cloudData.supplements,
                supplementIntakes: cloudData.supplementIntakes,
                routines: cloudData.routines,
                locations: cloudData.locations,
                bodyMeasurements: cloudData.bodyMeasurements,
                userSettings: cloudData.userSettings || DEFAULT_USER_SETTINGS,
              });
              await refreshAll();
              console.log('Cloud data restored to local storage');
            }
            await setLastCloudPull();
          }
        }

        // Initialize HealthKit (this will trigger the permission prompt on iOS)
        initializeHealthKit().then(success => {
          if (success) {
            console.log('HealthKit initialized successfully');
          } else {
            console.log('HealthKit not available or permission denied');
          }
        });

        // Re-apply the weekly planner reminder so it survives app restarts.
        // (Scheduled notifications normally persist, but this reconciles state if
        // the user uninstalled-and-reinstalled or wiped notifications.)
        getUserSettings()
          .then(s => syncWeeklyPlannerReminder(s))
          .catch(e => console.log('Weekly planner reminder init failed:', e));

        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    init();

    return () => {
      syncManager.stop();
    };
  }, []);

  // Resume sync when app comes back to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncManager.onAppResume();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, []);

  const refreshExercises = useCallback(async () => {
    const data = await getExercises();
    setExercises(data);
  }, []);

  const refreshTemplates = useCallback(async () => {
    const data = await getTemplates();
    setTemplates(data);
  }, []);

  const refreshLocations = useCallback(async () => {
    const data = await getLocations();
    // Sort by sortOrder
    data.sort((a, b) => a.sortOrder - b.sortOrder);
    setLocations(data);
  }, []);

  const refreshWorkouts = useCallback(async () => {
    const data = await getWorkouts();
    setWorkouts(data);
  }, []);

  const refreshSets = useCallback(async () => {
    const data = await getSets();
    setSets(data);
  }, []);

  const refreshUserSettings = useCallback(async () => {
    const data = await getUserSettings();
    setUserSettings(data);
  }, []);

  const refreshSupplements = useCallback(async () => {
    const data = await getSupplements();
    data.sort((a, b) => a.sortOrder - b.sortOrder);
    setSupplements(data);
  }, []);

  const refreshSupplementIntakes = useCallback(async () => {
    const data = await getSupplementIntakes();
    setSupplementIntakes(data);
  }, []);

  const refreshPTRoutines = useCallback(async () => {
    const data = await getPTRoutines();
    data.sort((a, b) => a.sortOrder - b.sortOrder);
    setPTRoutines(data);
  }, []);

  const refreshPTCompletions = useCallback(async () => {
    const data = await getPTCompletions();
    setPTCompletions(data);
  }, []);

  const refreshRoutines = useCallback(async () => {
    const data = await getRoutines();
    setRoutines(data);
  }, []);

  const refreshBodyMeasurements = useCallback(async () => {
    const data = await getBodyMeasurements();
    // Sort by date descending (newest first)
    data.sort((a, b) => b.date.localeCompare(a.date));
    setBodyMeasurements(data);
  }, []);

  const refreshExerciseSwaps = useCallback(async () => {
    const data = await getExerciseSwaps();
    setExerciseSwaps(data);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshExercises(),
      refreshTemplates(),
      refreshLocations(),
      refreshWorkouts(),
      refreshSets(),
      refreshUserSettings(),
      refreshSupplements(),
      refreshSupplementIntakes(),
      refreshPTRoutines(),
      refreshPTCompletions(),
      refreshRoutines(),
      refreshBodyMeasurements(),
      refreshExerciseSwaps(),
    ]);
  }, [refreshExercises, refreshTemplates, refreshLocations, refreshWorkouts, refreshSets, refreshUserSettings, refreshSupplements, refreshSupplementIntakes, refreshPTRoutines, refreshPTCompletions, refreshRoutines, refreshBodyMeasurements, refreshExerciseSwaps]);

  // Exercise CRUD
  const addExercise = useCallback(async (exercise: Exercise) => {
    await addExerciseToStorage(exercise);
    await refreshExercises();
    // Fire-and-forget sync to cloud
    syncExercise(exercise).catch(e => console.log('Sync error:', e));
  }, [refreshExercises]);

  const updateExercise = useCallback(async (exercise: Exercise) => {
    await updateExerciseInStorage(exercise);
    await refreshExercises();
    // Fire-and-forget sync to cloud
    syncExercise(exercise).catch(e => console.log('Sync error:', e));
  }, [refreshExercises]);

  const toggleExerciseFavorite = useCallback(async (id: string) => {
    const updated = await toggleFavoriteInStorage(id);
    if (!updated) return;
    await refreshExercises();
    // Fire-and-forget sync so the star follows the user to their other devices
    syncExercise(updated).catch(e => console.log('Sync error:', e));
  }, [refreshExercises]);

  const deleteExercise = useCallback(async (id: string) => {
    await deleteExerciseFromStorage(id);
    await refreshExercises();
    await refreshTemplates(); // Templates may have been updated to remove this exercise
    // Fire-and-forget sync to cloud
    syncDeleteExercise(id).catch(e => console.log('Sync error:', e));
  }, [refreshExercises, refreshTemplates]);

  const mergeExercise = useCallback(async (sourceId: string, keeperId: string) => {
    const { updatedSetIds, updatedTemplateIds } = await mergeExerciseInStorage(sourceId, keeperId);

    // Refresh all affected state
    await refreshExercises();
    await refreshTemplates();
    await refreshSets();
    await refreshWorkouts();

    // Fire-and-forget sync: updated sets
    const allSets = await getSets();
    const setsToSync = allSets.filter(s => updatedSetIds.includes(s.id));
    setsToSync.forEach(s => {
      syncSet(s).catch(e => console.log('Sync error:', e));
    });

    // Fire-and-forget sync: updated templates
    const allTemplates = await getTemplates();
    const templatesToSync = allTemplates.filter(t => updatedTemplateIds.includes(t.id));
    templatesToSync.forEach(t => {
      syncTemplate(t).catch(e => console.log('Sync error:', e));
    });

    // Fire-and-forget sync: updated keeper exercise (notes may have changed)
    const keeperExercise = (await getExercises()).find(e => e.id === keeperId);
    if (keeperExercise) {
      syncExercise(keeperExercise).catch(e => console.log('Sync error:', e));
    }

    // Fire-and-forget sync: delete source from cloud
    syncDeleteExercise(sourceId).catch(e => console.log('Sync error:', e));
  }, [refreshExercises, refreshTemplates, refreshSets, refreshWorkouts]);

  // Template CRUD
  const addTemplate = useCallback(async (template: Template) => {
    await addTemplateToStorage(template);
    await refreshTemplates();
    // Fire-and-forget sync to cloud
    syncTemplate(template).catch(e => console.log('Sync error:', e));
  }, [refreshTemplates]);

  const updateTemplate = useCallback(async (template: Template) => {
    await updateTemplateInStorage(template);
    await refreshTemplates();
    // Fire-and-forget sync to cloud
    syncTemplate(template).catch(e => console.log('Sync error:', e));
  }, [refreshTemplates]);

  const deleteTemplate = useCallback(async (id: string) => {
    await deleteTemplateFromStorage(id);
    await refreshTemplates();
    // Fire-and-forget sync to cloud
    syncDeleteTemplate(id).catch(e => console.log('Sync error:', e));
  }, [refreshTemplates]);

  // Location CRUD
  const addLocation = useCallback(async (location: WorkoutLocation) => {
    await addLocationToStorage(location);
    await refreshLocations();
    // Fire-and-forget sync to cloud
    syncLocation(location).catch(e => console.log('Sync error:', e));
  }, [refreshLocations]);

  const updateLocation = useCallback(async (location: WorkoutLocation) => {
    await updateLocationInStorage(location);
    await refreshLocations();
    // Fire-and-forget sync to cloud
    syncLocation(location).catch(e => console.log('Sync error:', e));
  }, [refreshLocations]);

  const deleteLocation = useCallback(async (id: string) => {
    await deleteLocationFromStorage(id);
    await refreshLocations();
    // Fire-and-forget sync to cloud
    syncDeleteLocation(id).catch(e => console.log('Sync error:', e));
  }, [refreshLocations]);

  const reorderLocations = useCallback(async (locationIds: string[]) => {
    await reorderLocationsInStorage(locationIds);
    const updatedLocations = await getLocations();
    // Fire-and-forget sync all reordered locations to cloud
    updatedLocations.forEach(loc => {
      syncLocation(loc).catch(e => console.log('Sync error:', e));
    });
    await refreshLocations();
  }, [refreshLocations]);

  // Supplement CRUD
  const addSupplement = useCallback(async (supplement: Supplement) => {
    await addSupplementToStorage(supplement);
    await refreshSupplements();
    // Fire-and-forget sync to cloud
    syncSupplement(supplement).catch(e => console.log('Sync error:', e));
  }, [refreshSupplements]);

  const updateSupplement = useCallback(async (supplement: Supplement) => {
    await updateSupplementInStorage(supplement);
    await refreshSupplements();
    // Fire-and-forget sync to cloud
    syncSupplement(supplement).catch(e => console.log('Sync error:', e));
  }, [refreshSupplements]);

  const deleteSupplement = useCallback(async (id: string) => {
    await deleteSupplementFromStorage(id);
    await refreshSupplements();
    await refreshSupplementIntakes(); // Also refresh intakes since they may be deleted
    // Fire-and-forget sync to cloud
    syncDeleteSupplement(id).catch(e => console.log('Sync error:', e));
  }, [refreshSupplements, refreshSupplementIntakes]);

  const toggleSupplementIntake = useCallback(async (supplementId: string, date: string) => {
    const existing = supplementIntakes.find(
      i => i.supplementId === supplementId && i.date === date
    );

    if (existing) {
      // Optimistic update: remove from state immediately
      setSupplementIntakes(prev => prev.filter(i => i.id !== existing.id));

      // Save to storage in background
      try {
        await deleteSupplementIntakeBySupplementAndDate(supplementId, date);
        // Fire-and-forget sync to cloud
        syncDeleteSupplementIntake(existing.id).catch(e => console.log('Sync error:', e));
      } catch (error) {
        // Revert on error
        console.error('Failed to delete supplement intake:', error);
        setSupplementIntakes(prev => [...prev, existing]);
      }
    } else {
      // Optimistic update: add to state immediately
      const intake: SupplementIntake = {
        id: `intake-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        supplementId,
        date,
        takenAt: new Date().toISOString(),
      };
      setSupplementIntakes(prev => [...prev, intake]);

      // Save to storage in background
      try {
        await addSupplementIntakeToStorage(intake);
        // Fire-and-forget sync to cloud
        syncSupplementIntake(intake).catch(e => console.log('Sync error:', e));
      } catch (error) {
        // Revert on error
        console.error('Failed to add supplement intake:', error);
        setSupplementIntakes(prev => prev.filter(i => i.id !== intake.id));
      }
    }
  }, [supplementIntakes]);

  // Physical Therapy CRUD
  const addPTRoutine = useCallback(async (routine: PTRoutine) => {
    await addPTRoutineToStorage(routine);
    await refreshPTRoutines();
  }, [refreshPTRoutines]);

  const updatePTRoutine = useCallback(async (routine: PTRoutine) => {
    await updatePTRoutineInStorage(routine);
    await refreshPTRoutines();
  }, [refreshPTRoutines]);

  const deletePTRoutine = useCallback(async (id: string) => {
    await deletePTRoutineFromStorage(id);
    await refreshPTRoutines();
    await refreshPTCompletions();
  }, [refreshPTRoutines, refreshPTCompletions]);

  const togglePTCompletion = useCallback(async (ptRoutineId: string, date: string) => {
    const existing = ptCompletions.find(
      c => c.ptRoutineId === ptRoutineId && c.date === date
    );

    if (existing) {
      setPTCompletions(prev => prev.filter(c => c.id !== existing.id));
      try {
        await deletePTCompletionByRoutineAndDate(ptRoutineId, date);
      } catch (error) {
        console.error('Failed to delete PT completion:', error);
        setPTCompletions(prev => [...prev, existing]);
      }
    } else {
      const completion: PTCompletion = {
        id: `pt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ptRoutineId,
        date,
        completedAt: new Date().toISOString(),
      };
      setPTCompletions(prev => [...prev, completion]);
      try {
        await addPTCompletionToStorage(completion);
      } catch (error) {
        console.error('Failed to add PT completion:', error);
        setPTCompletions(prev => prev.filter(c => c.id !== completion.id));
      }
    }
  }, [ptCompletions]);

  // Routine CRUD
  const addRoutine = useCallback(async (routine: Routine) => {
    await addRoutineToStorage(routine);
    await refreshRoutines();
    // Fire-and-forget sync to cloud
    syncRoutine(routine).catch(e => console.log('Sync error:', e));
  }, [refreshRoutines]);

  const updateRoutine = useCallback(async (routine: Routine) => {
    await updateRoutineInStorage(routine);
    await refreshRoutines();
    // Fire-and-forget sync to cloud
    syncRoutine(routine).catch(e => console.log('Sync error:', e));
  }, [refreshRoutines]);

  const deleteRoutine = useCallback(async (id: string) => {
    await deleteRoutineFromStorage(id);
    await refreshRoutines();
    // Fire-and-forget sync to cloud
    syncDeleteRoutine(id).catch(e => console.log('Sync error:', e));
  }, [refreshRoutines]);

  const setActiveRoutine = useCallback(async (routineId: string | null) => {
    await setActiveRoutineInStorage(routineId);
    const updatedRoutines = await getRoutines();
    // Fire-and-forget sync all routines to cloud (isActive changed)
    updatedRoutines.forEach(r => {
      syncRoutine(r).catch(e => console.log('Sync error:', e));
    });
    await refreshRoutines();
  }, [refreshRoutines]);

  const getActiveRoutine = useCallback((): Routine | undefined => {
    return routines.find(r => r.isActive);
  }, [routines]);

  const getRoutineById = useCallback((id: string): Routine | undefined => {
    return routines.find(r => r.id === id);
  }, [routines]);

  // Body Measurement CRUD
  const addBodyMeasurement = useCallback(async (measurement: BodyMeasurement) => {
    await addBodyMeasurementToStorage(measurement);
    await refreshBodyMeasurements();
    // Fire-and-forget sync to cloud
    syncBodyMeasurement(measurement).catch(e => console.log('Sync error:', e));
  }, [refreshBodyMeasurements]);

  const updateBodyMeasurement = useCallback(async (measurement: BodyMeasurement) => {
    await updateBodyMeasurementInStorage(measurement);
    await refreshBodyMeasurements();
    // Fire-and-forget sync to cloud
    syncBodyMeasurement(measurement).catch(e => console.log('Sync error:', e));
  }, [refreshBodyMeasurements]);

  const deleteBodyMeasurement = useCallback(async (id: string) => {
    await deleteBodyMeasurementFromStorage(id);
    await refreshBodyMeasurements();
    // Fire-and-forget sync to cloud
    syncDeleteBodyMeasurement(id).catch(e => console.log('Sync error:', e));
  }, [refreshBodyMeasurements]);

  const getLatestBodyMeasurement = useCallback((): BodyMeasurement | undefined => {
    // bodyMeasurements is already sorted by date descending
    return bodyMeasurements[0];
  }, [bodyMeasurements]);

  // Settings
  const updateUserSettingsHandler = useCallback(async (settings: Partial<UserSettings>) => {
    await updateUserSettingsInStorage(settings);
    await refreshUserSettings();
    // Fire-and-forget sync to cloud - need full settings object
    const fullSettings = await getUserSettings();
    syncUserSettings(fullSettings).catch(e => console.log('Sync error:', e));
    // Re-apply the weekly planner reminder if those fields changed (cheap to call always)
    const touchedReminder =
      'weeklyPlannerReminderEnabled' in settings ||
      'weeklyPlannerReminderDay' in settings ||
      'weeklyPlannerReminderHour' in settings ||
      'weeklyPlannerReminderMinute' in settings;
    if (touchedReminder) {
      syncWeeklyPlannerReminder(fullSettings).catch(e => console.log('Reminder sync error:', e));
    }
  }, [refreshUserSettings]);

  // Utility
  const getExerciseById = useCallback((id: string): Exercise | undefined => {
    return exercises.find(e => e.id === id);
  }, [exercises]);

  const getTemplateById = useCallback((id: string): Template | undefined => {
    return templates.find(t => t.id === id);
  }, [templates]);

  const getLocationById = useCallback((id: string): WorkoutLocation | undefined => {
    return locations.find(l => l.id === id);
  }, [locations]);

  const getSupplementById = useCallback((id: string): Supplement | undefined => {
    return supplements.find(s => s.id === id);
  }, [supplements]);

  const value: DataContextType = {
    isLoading,
    isInitialized,
    exercises,
    templates,
    locations,
    workouts,
    sets,
    userSettings,
    refreshExercises,
    refreshTemplates,
    refreshLocations,
    refreshWorkouts,
    refreshSets,
    refreshUserSettings,
    refreshAll,
    addExercise,
    updateExercise,
    toggleExerciseFavorite,
    deleteExercise,
    mergeExercise,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    addLocation,
    updateLocation,
    deleteLocation,
    reorderLocations,
    supplements,
    supplementIntakes,
    refreshSupplements,
    refreshSupplementIntakes,
    addSupplement,
    updateSupplement,
    deleteSupplement,
    toggleSupplementIntake,
    ptRoutines,
    ptCompletions,
    refreshPTRoutines,
    refreshPTCompletions,
    addPTRoutine,
    updatePTRoutine,
    deletePTRoutine,
    togglePTCompletion,
    routines,
    refreshRoutines,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    setActiveRoutine,
    getActiveRoutine,
    getRoutineById,
    bodyMeasurements,
    refreshBodyMeasurements,
    addBodyMeasurement,
    updateBodyMeasurement,
    deleteBodyMeasurement,
    getLatestBodyMeasurement,
    exerciseSwaps,
    refreshExerciseSwaps,
    updateUserSettings: updateUserSettingsHandler,
    getExerciseById,
    getTemplateById,
    getLocationById,
    getSupplementById,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
