import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  Exercise,
  Template,
  Workout,
  WorkoutSet,
  UserSettings,
  WorkoutLocation,
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
  addExercise as addExerciseToStorage,
  updateExercise as updateExerciseInStorage,
  deleteExercise as deleteExerciseFromStorage,
  addTemplate as addTemplateToStorage,
  updateTemplate as updateTemplateInStorage,
  deleteTemplate as deleteTemplateFromStorage,
  addLocation as addLocationToStorage,
  updateLocation as updateLocationInStorage,
  deleteLocation as deleteLocationFromStorage,
  reorderLocations as reorderLocationsInStorage,
  updateUserSettings as updateUserSettingsInStorage,
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
  deleteExercise: (id: string) => Promise<void>;

  // Template CRUD
  addTemplate: (template: Template) => Promise<void>;
  updateTemplate: (template: Template) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;

  // Location CRUD
  addLocation: (location: WorkoutLocation) => Promise<void>;
  updateLocation: (location: WorkoutLocation) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
  reorderLocations: (locationIds: string[]) => Promise<void>;

  // Settings
  updateUserSettings: (settings: Partial<UserSettings>) => Promise<void>;

  // Utility
  getExerciseById: (id: string) => Exercise | undefined;
  getTemplateById: (id: string) => Template | undefined;
  getLocationById: (id: string) => WorkoutLocation | undefined;
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

  // Initialize storage and load data
  useEffect(() => {
    async function init() {
      try {
        await initializeStorage();
        await refreshAll();
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    init();
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

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshExercises(),
      refreshTemplates(),
      refreshLocations(),
      refreshWorkouts(),
      refreshSets(),
      refreshUserSettings(),
    ]);
  }, [refreshExercises, refreshTemplates, refreshLocations, refreshWorkouts, refreshSets, refreshUserSettings]);

  // Exercise CRUD
  const addExercise = useCallback(async (exercise: Exercise) => {
    await addExerciseToStorage(exercise);
    await refreshExercises();
  }, [refreshExercises]);

  const updateExercise = useCallback(async (exercise: Exercise) => {
    await updateExerciseInStorage(exercise);
    await refreshExercises();
  }, [refreshExercises]);

  const deleteExercise = useCallback(async (id: string) => {
    await deleteExerciseFromStorage(id);
    await refreshExercises();
  }, [refreshExercises]);

  // Template CRUD
  const addTemplate = useCallback(async (template: Template) => {
    await addTemplateToStorage(template);
    await refreshTemplates();
  }, [refreshTemplates]);

  const updateTemplate = useCallback(async (template: Template) => {
    await updateTemplateInStorage(template);
    await refreshTemplates();
  }, [refreshTemplates]);

  const deleteTemplate = useCallback(async (id: string) => {
    await deleteTemplateFromStorage(id);
    await refreshTemplates();
  }, [refreshTemplates]);

  // Location CRUD
  const addLocation = useCallback(async (location: WorkoutLocation) => {
    await addLocationToStorage(location);
    await refreshLocations();
  }, [refreshLocations]);

  const updateLocation = useCallback(async (location: WorkoutLocation) => {
    await updateLocationInStorage(location);
    await refreshLocations();
  }, [refreshLocations]);

  const deleteLocation = useCallback(async (id: string) => {
    await deleteLocationFromStorage(id);
    await refreshLocations();
  }, [refreshLocations]);

  const reorderLocations = useCallback(async (locationIds: string[]) => {
    await reorderLocationsInStorage(locationIds);
    await refreshLocations();
  }, [refreshLocations]);

  // Settings
  const updateUserSettingsHandler = useCallback(async (settings: Partial<UserSettings>) => {
    await updateUserSettingsInStorage(settings);
    await refreshUserSettings();
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
    deleteExercise,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    addLocation,
    updateLocation,
    deleteLocation,
    reorderLocations,
    updateUserSettings: updateUserSettingsHandler,
    getExerciseById,
    getTemplateById,
    getLocationById,
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
