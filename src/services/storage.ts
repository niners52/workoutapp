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
  Routine,
  BodyMeasurement,
  BodyMeasurementTypeKey,
  DEFAULT_USER_SETTINGS,
  DEFAULT_LOCATIONS,
  DEFAULT_DAILY_GOALS,
  DEFAULT_WEEKLY_GOALS,
} from '../types';
import { SEED_EXERCISES } from '../data/exercises';
import { SEED_TEMPLATES } from '../data/templates';
import { IMPORTED_EXERCISES } from '../data/importedExercises';
import { IMPORTED_WORKOUTS, IMPORTED_SETS } from '../data/importedWorkouts';

// Storage keys
const STORAGE_KEYS = {
  EXERCISES: '@workout_tracker/exercises',
  TEMPLATES: '@workout_tracker/templates',
  WORKOUTS: '@workout_tracker/workouts',
  SETS: '@workout_tracker/sets',
  USER_SETTINGS: '@workout_tracker/user_settings',
  LOCATIONS: '@workout_tracker/locations',
  SUPPLEMENTS: '@workout_tracker/supplements',
  SUPPLEMENT_INTAKES: '@workout_tracker/supplement_intakes',
  ROUTINES: '@workout_tracker/routines',
  BODY_MEASUREMENTS: '@workout_tracker/body_measurements',
  INITIALIZED: '@workout_tracker/initialized',
  MIGRATION_VERSION: '@workout_tracker/migration_version',
  SETGRAPH_MAPPINGS: '@workout_tracker/setgraph_mappings',
  LAST_APP_OPENED: '@workout_tracker/last_app_opened',
  WEEKLY_SUMMARY_DISMISSED: '@workout_tracker/weekly_summary_dismissed',
} as const;

// Current migration version
const CURRENT_MIGRATION_VERSION = 7;

// Generic storage helpers
async function getItem<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch (error) {
    console.error(`Error reading ${key}:`, error);
    return defaultValue;
  }
}

async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing ${key}:`, error);
    throw error;
  }
}

// Initialize storage with seed data if not already done
export async function initializeStorage(): Promise<void> {
  const initialized = await AsyncStorage.getItem(STORAGE_KEYS.INITIALIZED);

  if (!initialized) {
    // Seed exercises (combine built-in and imported)
    const allExercises = [...SEED_EXERCISES, ...IMPORTED_EXERCISES];
    await setItem(STORAGE_KEYS.EXERCISES, allExercises);

    // Seed templates
    await setItem(STORAGE_KEYS.TEMPLATES, SEED_TEMPLATES);

    // Seed locations
    await setItem(STORAGE_KEYS.LOCATIONS, DEFAULT_LOCATIONS);

    // Initialize with imported historical workouts and sets
    await setItem(STORAGE_KEYS.WORKOUTS, IMPORTED_WORKOUTS);
    await setItem(STORAGE_KEYS.SETS, IMPORTED_SETS);

    // Set default user settings
    await setItem(STORAGE_KEYS.USER_SETTINGS, DEFAULT_USER_SETTINGS);

    // Mark as initialized with current migration version
    await AsyncStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    await AsyncStorage.setItem(STORAGE_KEYS.MIGRATION_VERSION, String(CURRENT_MIGRATION_VERSION));

    console.log('Storage initialized with seed data and imported history');
  } else {
    // Run migrations if needed
    await runMigrations();
  }
}

// Migration system
async function runMigrations(): Promise<void> {
  const versionStr = await AsyncStorage.getItem(STORAGE_KEYS.MIGRATION_VERSION);
  const currentVersion = versionStr ? parseInt(versionStr, 10) : 1;

  if (currentVersion < 2) {
    await migrateToV2();
  }

  if (currentVersion < 3) {
    await migrateToV3();
  }

  if (currentVersion < 4) {
    await migrateToV4();
  }

  if (currentVersion < 5) {
    await migrateToV5();
  }

  if (currentVersion < 6) {
    await migrateToV6();
  }

  if (currentVersion < 7) {
    await migrateToV7();
  }

  // Update migration version
  await AsyncStorage.setItem(STORAGE_KEYS.MIGRATION_VERSION, String(CURRENT_MIGRATION_VERSION));
}

// Migration V2: Add locations and update templates with type/locationId
async function migrateToV2(): Promise<void> {
  console.log('Running migration to V2...');

  // Add default locations if not present
  const existingLocations = await getItem<WorkoutLocation[]>(STORAGE_KEYS.LOCATIONS, []);
  if (existingLocations.length === 0) {
    await setItem(STORAGE_KEYS.LOCATIONS, DEFAULT_LOCATIONS);
  }

  // Migrate templates: add type and convert location to locationId
  const templates = await getItem<any[]>(STORAGE_KEYS.TEMPLATES, []);
  const migratedTemplates = templates.map(template => {
    // If template already has type, it's already migrated
    if (template.type) {
      return template;
    }

    // Infer type from template name
    let type: 'push' | 'pull' | 'lower' = 'push';
    const nameLower = template.name.toLowerCase();
    if (nameLower.includes('pull')) {
      type = 'pull';
    } else if (nameLower.includes('leg') || nameLower.includes('lower')) {
      type = 'lower';
    }

    // Convert location to locationId
    const locationId = template.location || 'gym';

    return {
      ...template,
      type,
      locationId,
      location: undefined, // Remove old field
    };
  });

  await setItem(STORAGE_KEYS.TEMPLATES, migratedTemplates);
  console.log('Migration to V2 complete');
}

// Migration V3: Import Setgraph historical data
async function migrateToV3(): Promise<void> {
  console.log('Running migration to V3 - importing Setgraph data...');

  // Add imported exercises (merge with existing, avoiding duplicates)
  const existingExercises = await getItem<Exercise[]>(STORAGE_KEYS.EXERCISES, []);
  const existingIds = new Set(existingExercises.map(e => e.id));
  const newExercises = IMPORTED_EXERCISES.filter(e => !existingIds.has(e.id));
  const mergedExercises = [...existingExercises, ...newExercises];
  await setItem(STORAGE_KEYS.EXERCISES, mergedExercises);
  console.log(`Added ${newExercises.length} new exercises from import`);

  // Add imported workouts (merge with existing)
  const existingWorkouts = await getItem<Workout[]>(STORAGE_KEYS.WORKOUTS, []);
  const existingWorkoutIds = new Set(existingWorkouts.map(w => w.id));
  const newWorkouts = IMPORTED_WORKOUTS.filter(w => !existingWorkoutIds.has(w.id));
  const mergedWorkouts = [...existingWorkouts, ...newWorkouts];
  await setItem(STORAGE_KEYS.WORKOUTS, mergedWorkouts);
  console.log(`Added ${newWorkouts.length} workouts from import`);

  // Add imported sets (merge with existing)
  const existingSets = await getItem<WorkoutSet[]>(STORAGE_KEYS.SETS, []);
  const existingSetIds = new Set(existingSets.map(s => s.id));
  const newSets = IMPORTED_SETS.filter(s => !existingSetIds.has(s.id));
  const mergedSets = [...existingSets, ...newSets];
  await setItem(STORAGE_KEYS.SETS, mergedSets);
  console.log(`Added ${newSets.length} sets from import`);

  console.log('Migration to V3 complete');
}

// Migration V4: Add Gym B templates and rename Gym A templates
async function migrateToV4(): Promise<void> {
  console.log('Running migration to V4 - adding Gym B templates...');

  // Update templates: merge in new templates and update existing ones
  const existingTemplates = await getItem<Template[]>(STORAGE_KEYS.TEMPLATES, []);
  const existingIds = new Set(existingTemplates.map(t => t.id));

  // Update existing Gym A templates with new names (if they exist)
  const updatedTemplates = existingTemplates.map(t => {
    // Rename old Gym A templates
    if (t.id === 'push-gym' && !t.name.includes('A')) {
      return { ...t, name: 'PUSH A (Gym)' };
    }
    if (t.id === 'pull-gym' && !t.name.includes('A')) {
      return { ...t, name: 'PULL A (Gym)' };
    }
    if (t.id === 'legs-gym' && !t.name.includes('A')) {
      return { ...t, name: 'LEGS A (Gym)' };
    }
    return t;
  });

  // Add new templates from seed that don't exist
  const newTemplates = SEED_TEMPLATES.filter(t => !existingIds.has(t.id));
  const mergedTemplates = [...updatedTemplates, ...newTemplates];

  await setItem(STORAGE_KEYS.TEMPLATES, mergedTemplates);
  console.log(`Added ${newTemplates.length} new templates, updated names`);

  // Also add new Gym B exercises from SEED_EXERCISES
  const existingExercises = await getItem<Exercise[]>(STORAGE_KEYS.EXERCISES, []);
  const existingExerciseIds = new Set(existingExercises.map(e => e.id));
  const newExercises = SEED_EXERCISES.filter(e => !existingExerciseIds.has(e.id));

  if (newExercises.length > 0) {
    const mergedExercises = [...existingExercises, ...newExercises];
    await setItem(STORAGE_KEYS.EXERCISES, mergedExercises);
    console.log(`Added ${newExercises.length} new exercises`);
  }

  console.log('Migration to V4 complete');
}

// Migration V5: Fix exercise locations - machine/cable should be gym-only
async function migrateToV5(): Promise<void> {
  console.log('Running migration to V5 - fixing exercise locations...');

  const exercises = await getItem<Exercise[]>(STORAGE_KEYS.EXERCISES, []);

  // Update exercises: machine and cable equipment should be gym-only
  const updatedExercises = exercises.map(e => {
    // If exercise has locationIds, it's already using the new system
    if (e.locationIds && e.locationIds.length > 0) {
      return e;
    }

    // Determine correct locationIds based on equipment
    let locationIds: string[];
    if (e.equipment === 'machine' || e.equipment === 'cable') {
      // Machines and cables are gym-only
      locationIds = ['gym'];
    } else if (e.equipment === 'bodyweight') {
      // Bodyweight can be done anywhere
      locationIds = ['gym', 'home'];
    } else if (e.equipment === 'dumbbell') {
      // Dumbbells available at both (assuming home has dumbbells)
      locationIds = ['gym', 'home'];
    } else if (e.equipment === 'barbell') {
      // Barbells typically gym-only
      locationIds = ['gym'];
    } else {
      // Default to gym for safety
      locationIds = ['gym'];
    }

    return {
      ...e,
      locationIds,
      location: undefined, // Remove deprecated field
    };
  });

  await setItem(STORAGE_KEYS.EXERCISES, updatedExercises);
  console.log('Migration to V5 complete - updated exercise locations');
}

// Migration V6: Convert primaryMuscleGroup to primaryMuscleGroups array
async function migrateToV6(): Promise<void> {
  console.log('Running migration to V6 - converting to multiple primary muscle groups...');

  const exercises = await getItem<any[]>(STORAGE_KEYS.EXERCISES, []);

  const updatedExercises = exercises.map(e => {
    // If exercise already has primaryMuscleGroups array, it's already migrated
    if (e.primaryMuscleGroups && Array.isArray(e.primaryMuscleGroups) && e.primaryMuscleGroups.length > 0) {
      return e;
    }

    // Convert single primaryMuscleGroup to array
    const primaryMuscleGroups = e.primaryMuscleGroup ? [e.primaryMuscleGroup] : ['chest'];

    return {
      ...e,
      primaryMuscleGroups,
      // Keep primaryMuscleGroup for backward compatibility
    };
  });

  await setItem(STORAGE_KEYS.EXERCISES, updatedExercises);
  console.log('Migration to V6 complete - converted to primaryMuscleGroups array');
}

// Migration V7: Add dailyGoals and weeklyGoals to user settings
async function migrateToV7(): Promise<void> {
  console.log('Running migration to V7 - adding daily and weekly goals...');

  const settings = await getItem<any>(STORAGE_KEYS.USER_SETTINGS, DEFAULT_USER_SETTINGS);

  // If settings already has dailyGoals, it's already migrated
  if (settings.dailyGoals) {
    console.log('Settings already have dailyGoals, skipping migration');
    return;
  }

  // Add dailyGoals based on existing proteinGoal and sleepGoal
  const updatedSettings = {
    ...settings,
    dailyGoals: {
      sleepHours: settings.sleepGoal || DEFAULT_DAILY_GOALS.sleepHours,
      proteinGrams: settings.proteinGoal || DEFAULT_DAILY_GOALS.proteinGrams,
      trackCreatine: DEFAULT_DAILY_GOALS.trackCreatine,
      trackTraining: DEFAULT_DAILY_GOALS.trackTraining,
    },
    weeklyGoals: {
      sleepHours: (settings.sleepGoal || DEFAULT_DAILY_GOALS.sleepHours) * 7,
      proteinDays: DEFAULT_WEEKLY_GOALS.proteinDays,
      creatineDays: DEFAULT_WEEKLY_GOALS.creatineDays,
      trainingDays: DEFAULT_WEEKLY_GOALS.trainingDays,
    },
  };

  await setItem(STORAGE_KEYS.USER_SETTINGS, updatedSettings);
  console.log('Migration to V7 complete - added daily and weekly goals');
}

// Reset storage (for debugging/testing)
export async function resetStorage(): Promise<void> {
  await AsyncStorage.clear();
  await initializeStorage();
}

// ==================== EXERCISES ====================

export async function getExercises(): Promise<Exercise[]> {
  return getItem(STORAGE_KEYS.EXERCISES, SEED_EXERCISES);
}

export async function getExerciseById(id: string): Promise<Exercise | undefined> {
  const exercises = await getExercises();
  return exercises.find(e => e.id === id);
}

export async function addExercise(exercise: Exercise): Promise<void> {
  const exercises = await getExercises();
  exercises.push({ ...exercise, isCustom: true });
  await setItem(STORAGE_KEYS.EXERCISES, exercises);
}

export async function updateExercise(exercise: Exercise): Promise<void> {
  const exercises = await getExercises();
  const index = exercises.findIndex(e => e.id === exercise.id);
  if (index !== -1) {
    exercises[index] = exercise;
    await setItem(STORAGE_KEYS.EXERCISES, exercises);
  }
}

export async function deleteExercise(id: string): Promise<void> {
  // Remove the exercise from exercises list
  const exercises = await getExercises();
  const filtered = exercises.filter(e => e.id !== id);
  await setItem(STORAGE_KEYS.EXERCISES, filtered);

  // Remove from any templates that reference this exercise
  const templates = await getTemplates();
  const updatedTemplates = templates.map(template => {
    if (template.exerciseIds.includes(id)) {
      return {
        ...template,
        exerciseIds: template.exerciseIds.filter(eid => eid !== id),
      };
    }
    return template;
  });
  await setItem(STORAGE_KEYS.TEMPLATES, updatedTemplates);

  // Note: We do NOT delete historical sets that used this exercise
  // to preserve workout history integrity
}

// ==================== TEMPLATES ====================

export async function getTemplates(): Promise<Template[]> {
  return getItem(STORAGE_KEYS.TEMPLATES, SEED_TEMPLATES);
}

export async function getTemplateById(id: string): Promise<Template | undefined> {
  const templates = await getTemplates();
  return templates.find(t => t.id === id);
}

export async function addTemplate(template: Template): Promise<void> {
  const templates = await getTemplates();
  templates.push(template);
  await setItem(STORAGE_KEYS.TEMPLATES, templates);
}

export async function updateTemplate(template: Template): Promise<void> {
  const templates = await getTemplates();
  const index = templates.findIndex(t => t.id === template.id);
  if (index !== -1) {
    templates[index] = template;
    await setItem(STORAGE_KEYS.TEMPLATES, templates);
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const templates = await getTemplates();
  const filtered = templates.filter(t => t.id !== id);
  await setItem(STORAGE_KEYS.TEMPLATES, filtered);
}

// ==================== LOCATIONS ====================

export async function getLocations(): Promise<WorkoutLocation[]> {
  return getItem(STORAGE_KEYS.LOCATIONS, DEFAULT_LOCATIONS);
}

export async function getLocationById(id: string): Promise<WorkoutLocation | undefined> {
  const locations = await getLocations();
  return locations.find(l => l.id === id);
}

export async function addLocation(location: WorkoutLocation): Promise<void> {
  const locations = await getLocations();
  // Set sortOrder to be at the end
  const maxSortOrder = locations.reduce((max, l) => Math.max(max, l.sortOrder), -1);
  locations.push({ ...location, sortOrder: maxSortOrder + 1 });
  await setItem(STORAGE_KEYS.LOCATIONS, locations);
}

export async function updateLocation(location: WorkoutLocation): Promise<void> {
  const locations = await getLocations();
  const index = locations.findIndex(l => l.id === location.id);
  if (index !== -1) {
    locations[index] = location;
    await setItem(STORAGE_KEYS.LOCATIONS, locations);
  }
}

export async function deleteLocation(id: string): Promise<void> {
  const locations = await getLocations();
  const filtered = locations.filter(l => l.id !== id);
  await setItem(STORAGE_KEYS.LOCATIONS, filtered);
}

export async function reorderLocations(locationIds: string[]): Promise<void> {
  const locations = await getLocations();
  const reordered = locationIds
    .map((id, index) => {
      const location = locations.find(l => l.id === id);
      if (location) {
        return { ...location, sortOrder: index };
      }
      return null;
    })
    .filter((l): l is WorkoutLocation => l !== null);
  await setItem(STORAGE_KEYS.LOCATIONS, reordered);
}

// ==================== WORKOUTS ====================

export async function getWorkouts(): Promise<Workout[]> {
  return getItem(STORAGE_KEYS.WORKOUTS, []);
}

export async function getWorkoutById(id: string): Promise<Workout | undefined> {
  const workouts = await getWorkouts();
  return workouts.find(w => w.id === id);
}

export async function addWorkout(workout: Workout): Promise<void> {
  const workouts = await getWorkouts();
  workouts.push(workout);
  await setItem(STORAGE_KEYS.WORKOUTS, workouts);
}

export async function updateWorkout(workout: Workout): Promise<void> {
  const workouts = await getWorkouts();
  const index = workouts.findIndex(w => w.id === workout.id);
  if (index !== -1) {
    workouts[index] = workout;
    await setItem(STORAGE_KEYS.WORKOUTS, workouts);
  }
}

export async function deleteWorkout(id: string): Promise<void> {
  const workouts = await getWorkouts();
  const filtered = workouts.filter(w => w.id !== id);
  await setItem(STORAGE_KEYS.WORKOUTS, filtered);

  // Also delete associated sets
  const sets = await getSets();
  const filteredSets = sets.filter(s => s.workoutId !== id);
  await setItem(STORAGE_KEYS.SETS, filteredSets);
}

export async function getWorkoutsInDateRange(start: Date, end: Date): Promise<Workout[]> {
  const workouts = await getWorkouts();
  return workouts.filter(w => {
    const workoutDate = new Date(w.startedAt);
    return workoutDate >= start && workoutDate <= end;
  });
}

// ==================== SETS ====================

export async function getSets(): Promise<WorkoutSet[]> {
  return getItem(STORAGE_KEYS.SETS, []);
}

export async function getSetsByWorkoutId(workoutId: string): Promise<WorkoutSet[]> {
  const sets = await getSets();
  return sets.filter(s => s.workoutId === workoutId);
}

export async function getSetsByExerciseId(exerciseId: string): Promise<WorkoutSet[]> {
  const sets = await getSets();
  return sets.filter(s => s.exerciseId === exerciseId);
}

export async function addSet(set: WorkoutSet): Promise<void> {
  const sets = await getSets();
  sets.push(set);
  await setItem(STORAGE_KEYS.SETS, sets);
}

export async function updateSet(set: WorkoutSet): Promise<void> {
  const sets = await getSets();
  const index = sets.findIndex(s => s.id === set.id);
  if (index !== -1) {
    sets[index] = set;
    await setItem(STORAGE_KEYS.SETS, sets);
  }
}

export async function deleteSet(id: string): Promise<void> {
  const sets = await getSets();
  const filtered = sets.filter(s => s.id !== id);
  await setItem(STORAGE_KEYS.SETS, filtered);
}

export async function getSetsInDateRange(start: Date, end: Date): Promise<WorkoutSet[]> {
  const sets = await getSets();
  return sets.filter(s => {
    const setDate = new Date(s.loggedAt);
    return setDate >= start && setDate <= end;
  });
}

// Get last sets for an exercise (for showing "last time" info)
export async function getLastSetsForExercise(exerciseId: string, limit: number = 5): Promise<WorkoutSet[]> {
  const sets = await getSetsByExerciseId(exerciseId);

  // Sort by loggedAt descending and get unique workout sessions
  const sortedSets = sets.sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
  );

  // Find the last workout that included this exercise
  if (sortedSets.length === 0) return [];

  const lastWorkoutId = sortedSets[0].workoutId;
  const lastWorkoutSets = sortedSets.filter(s => s.workoutId === lastWorkoutId);

  return lastWorkoutSets.slice(0, limit);
}

// ==================== USER SETTINGS ====================

export async function getUserSettings(): Promise<UserSettings> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    if (!value) {
      return DEFAULT_USER_SETTINGS;
    }

    const stored = JSON.parse(value) as Partial<UserSettings>;

    // Merge stored settings with defaults to ensure all fields exist
    // This handles migration when new fields are added to UserSettings
    return {
      ...DEFAULT_USER_SETTINGS,
      ...stored,
      // Ensure nested objects are also merged
      dailyGoals: {
        ...DEFAULT_USER_SETTINGS.dailyGoals,
        ...(stored.dailyGoals || {}),
      },
      weeklyGoals: {
        ...DEFAULT_USER_SETTINGS.weeklyGoals,
        ...(stored.weeklyGoals || {}),
      },
      muscleGroupTargets: {
        ...DEFAULT_USER_SETTINGS.muscleGroupTargets,
        ...(stored.muscleGroupTargets || {}),
      },
    };
  } catch (error) {
    console.error('Error reading user settings:', error);
    return DEFAULT_USER_SETTINGS;
  }
}

export async function updateUserSettings(settings: Partial<UserSettings>): Promise<void> {
  const current = await getUserSettings();
  const updated = { ...current, ...settings };
  await setItem(STORAGE_KEYS.USER_SETTINGS, updated);
}

// ==================== DATA EXPORT ====================

export interface ExportData {
  exercises: Exercise[];
  templates: Template[];
  locations: WorkoutLocation[];
  workouts: Workout[];
  sets: WorkoutSet[];
  userSettings: UserSettings;
  supplements?: Supplement[];
  supplementIntakes?: SupplementIntake[];
  routines?: Routine[];
  bodyMeasurements?: BodyMeasurement[];
  exportedAt: string;
  version: string;
}

export async function exportAllData(): Promise<ExportData> {
  const [
    exercises,
    templates,
    locations,
    workouts,
    sets,
    userSettings,
    supplements,
    supplementIntakes,
    routines,
    bodyMeasurements,
  ] = await Promise.all([
    getExercises(),
    getTemplates(),
    getLocations(),
    getWorkouts(),
    getSets(),
    getUserSettings(),
    getSupplements(),
    getSupplementIntakes(),
    getRoutines(),
    getBodyMeasurements(),
  ]);

  return {
    exercises,
    templates,
    locations,
    workouts,
    sets,
    userSettings,
    supplements,
    supplementIntakes,
    routines,
    bodyMeasurements,
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
  };
}

export async function exportToJSON(): Promise<string> {
  const data = await exportAllData();
  return JSON.stringify(data, null, 2);
}

export async function exportToCSV(): Promise<string> {
  const sets = await getSets();
  const exercises = await getExercises();
  const exerciseMap = new Map(exercises.map(e => [e.id, e]));

  // CSV header
  const header = 'Exercise Name,Date,Reps,Weight (lb),Workout ID\n';

  // CSV rows
  const rows = sets.map(set => {
    const exercise = exerciseMap.get(set.exerciseId);
    const exerciseName = exercise?.name || set.exerciseId;
    const date = new Date(set.loggedAt).toISOString();

    return `"${exerciseName}",${date},${set.reps},${set.weight},"${set.workoutId}"`;
  });

  return header + rows.join('\n');
}

// ==================== DATA IMPORT (Setgraph) ====================

export interface SetgraphMapping {
  setgraphName: string;
  exerciseId: string;
}

export async function getSetgraphMappings(): Promise<SetgraphMapping[]> {
  return getItem(STORAGE_KEYS.SETGRAPH_MAPPINGS, []);
}

export async function saveSetgraphMappings(mappings: SetgraphMapping[]): Promise<void> {
  await setItem(STORAGE_KEYS.SETGRAPH_MAPPINGS, mappings);
}

export async function importData(data: ExportData): Promise<void> {
  await setItem(STORAGE_KEYS.EXERCISES, data.exercises);
  await setItem(STORAGE_KEYS.TEMPLATES, data.templates);
  if (data.locations) {
    await setItem(STORAGE_KEYS.LOCATIONS, data.locations);
  }
  await setItem(STORAGE_KEYS.WORKOUTS, data.workouts);
  await setItem(STORAGE_KEYS.SETS, data.sets);
  await setItem(STORAGE_KEYS.USER_SETTINGS, data.userSettings);
}

// ==================== RESTORE FROM BACKUP ====================

export interface RestoreDataCounts {
  current: {
    exercises: number;
    templates: number;
    workouts: number;
    sets: number;
    locations: number;
    supplements: number;
    routines: number;
    bodyMeasurements: number;
  };
  backup: {
    exercises: number;
    templates: number;
    workouts: number;
    sets: number;
    locations: number;
    supplements: number;
    routines: number;
    bodyMeasurements: number;
  };
}

/**
 * Validates backup data structure and returns counts for confirmation
 */
export async function validateBackupData(jsonString: string): Promise<{
  isValid: boolean;
  data?: any;
  counts?: RestoreDataCounts;
  error?: string;
}> {
  try {
    const data = JSON.parse(jsonString);

    // Validate required fields
    if (!data.exercises || !Array.isArray(data.exercises)) {
      return { isValid: false, error: 'Invalid backup: missing exercises array' };
    }
    if (!data.workouts || !Array.isArray(data.workouts)) {
      return { isValid: false, error: 'Invalid backup: missing workouts array' };
    }
    if (!data.sets || !Array.isArray(data.sets)) {
      return { isValid: false, error: 'Invalid backup: missing sets array' };
    }

    // Get current data counts
    const [
      currentExercises,
      currentTemplates,
      currentWorkouts,
      currentSets,
      currentLocations,
      currentSupplements,
      currentRoutines,
      currentBodyMeasurements,
    ] = await Promise.all([
      getExercises(),
      getTemplates(),
      getWorkouts(),
      getSets(),
      getLocations(),
      getSupplements(),
      getRoutines(),
      getBodyMeasurements(),
    ]);

    const counts: RestoreDataCounts = {
      current: {
        exercises: currentExercises.length,
        templates: currentTemplates.length,
        workouts: currentWorkouts.length,
        sets: currentSets.length,
        locations: currentLocations.length,
        supplements: currentSupplements.length,
        routines: currentRoutines.length,
        bodyMeasurements: currentBodyMeasurements.length,
      },
      backup: {
        exercises: data.exercises?.length || 0,
        templates: data.templates?.length || 0,
        workouts: data.workouts?.length || 0,
        sets: data.sets?.length || 0,
        locations: data.locations?.length || 0,
        supplements: data.supplements?.length || 0,
        routines: data.routines?.length || 0,
        bodyMeasurements: data.bodyMeasurements?.length || 0,
      },
    };

    return { isValid: true, data, counts };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Failed to parse JSON',
    };
  }
}

/**
 * Restores all data from a backup, including supplements and routines
 */
export async function restoreFromBackup(data: any): Promise<void> {
  // Import core data
  await setItem(STORAGE_KEYS.EXERCISES, data.exercises || []);
  await setItem(STORAGE_KEYS.TEMPLATES, data.templates || []);
  await setItem(STORAGE_KEYS.WORKOUTS, data.workouts || []);
  await setItem(STORAGE_KEYS.SETS, data.sets || []);
  await setItem(STORAGE_KEYS.USER_SETTINGS, data.userSettings || DEFAULT_USER_SETTINGS);

  // Import optional data (may not exist in older backups)
  if (data.locations) {
    await setItem(STORAGE_KEYS.LOCATIONS, data.locations);
  }
  if (data.supplements) {
    await setItem(STORAGE_KEYS.SUPPLEMENTS, data.supplements);
  }
  if (data.supplementIntakes) {
    await setItem(STORAGE_KEYS.SUPPLEMENT_INTAKES, data.supplementIntakes);
  }
  if (data.routines) {
    await setItem(STORAGE_KEYS.ROUTINES, data.routines);
  }
  if (data.bodyMeasurements) {
    await setItem(STORAGE_KEYS.BODY_MEASUREMENTS, data.bodyMeasurements);
  }
}

// ==================== SUPPLEMENTS ====================

export async function getSupplements(): Promise<Supplement[]> {
  return getItem(STORAGE_KEYS.SUPPLEMENTS, []);
}

export async function getSupplementById(id: string): Promise<Supplement | undefined> {
  const supplements = await getSupplements();
  return supplements.find(s => s.id === id);
}

export async function addSupplement(supplement: Supplement): Promise<void> {
  const supplements = await getSupplements();
  const maxSortOrder = supplements.reduce((max, s) => Math.max(max, s.sortOrder), -1);
  supplements.push({ ...supplement, sortOrder: maxSortOrder + 1 });
  await setItem(STORAGE_KEYS.SUPPLEMENTS, supplements);
}

export async function updateSupplement(supplement: Supplement): Promise<void> {
  const supplements = await getSupplements();
  const index = supplements.findIndex(s => s.id === supplement.id);
  if (index !== -1) {
    supplements[index] = supplement;
    await setItem(STORAGE_KEYS.SUPPLEMENTS, supplements);
  }
}

export async function deleteSupplement(id: string): Promise<void> {
  const supplements = await getSupplements();
  const filtered = supplements.filter(s => s.id !== id);
  await setItem(STORAGE_KEYS.SUPPLEMENTS, filtered);

  // Also delete associated intakes
  const intakes = await getSupplementIntakes();
  const filteredIntakes = intakes.filter(i => i.supplementId !== id);
  await setItem(STORAGE_KEYS.SUPPLEMENT_INTAKES, filteredIntakes);
}

// ==================== SUPPLEMENT INTAKES ====================

export async function getSupplementIntakes(): Promise<SupplementIntake[]> {
  return getItem(STORAGE_KEYS.SUPPLEMENT_INTAKES, []);
}

export async function getSupplementIntakesForDate(date: string): Promise<SupplementIntake[]> {
  const intakes = await getSupplementIntakes();
  return intakes.filter(i => i.date === date);
}

export async function addSupplementIntake(intake: SupplementIntake): Promise<void> {
  const intakes = await getSupplementIntakes();
  intakes.push(intake);
  await setItem(STORAGE_KEYS.SUPPLEMENT_INTAKES, intakes);
}

export async function deleteSupplementIntake(id: string): Promise<void> {
  const intakes = await getSupplementIntakes();
  const filtered = intakes.filter(i => i.id !== id);
  await setItem(STORAGE_KEYS.SUPPLEMENT_INTAKES, filtered);
}

export async function deleteSupplementIntakeBySupplementAndDate(
  supplementId: string,
  date: string
): Promise<void> {
  const intakes = await getSupplementIntakes();
  const filtered = intakes.filter(i => !(i.supplementId === supplementId && i.date === date));
  await setItem(STORAGE_KEYS.SUPPLEMENT_INTAKES, filtered);
}

// ==================== CALENDAR HELPERS ====================

export async function getWorkoutDatesInMonth(year: number, month: number): Promise<string[]> {
  const workouts = await getWorkouts();
  const dates = workouts
    .filter(w => {
      if (!w.completedAt) return false;
      const date = new Date(w.startedAt);
      return date.getFullYear() === year && date.getMonth() === month;
    })
    .map(w => {
      const date = new Date(w.startedAt);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
  return [...new Set(dates)]; // Unique dates
}

// ==================== ROUTINES ====================

export async function getRoutines(): Promise<Routine[]> {
  return getItem(STORAGE_KEYS.ROUTINES, []);
}

export async function getRoutineById(id: string): Promise<Routine | undefined> {
  const routines = await getRoutines();
  return routines.find(r => r.id === id);
}

export async function addRoutine(routine: Routine): Promise<void> {
  const routines = await getRoutines();
  routines.push(routine);
  await setItem(STORAGE_KEYS.ROUTINES, routines);
}

export async function updateRoutine(routine: Routine): Promise<void> {
  const routines = await getRoutines();
  const index = routines.findIndex(r => r.id === routine.id);
  if (index !== -1) {
    routines[index] = routine;
    await setItem(STORAGE_KEYS.ROUTINES, routines);
  }
}

export async function deleteRoutine(id: string): Promise<void> {
  const routines = await getRoutines();
  const filtered = routines.filter(r => r.id !== id);
  await setItem(STORAGE_KEYS.ROUTINES, filtered);
}

export async function setActiveRoutine(routineId: string | null): Promise<void> {
  const routines = await getRoutines();
  const updated = routines.map(r => ({
    ...r,
    isActive: r.id === routineId,
  }));
  await setItem(STORAGE_KEYS.ROUTINES, updated);
}

export async function getActiveRoutine(): Promise<Routine | undefined> {
  const routines = await getRoutines();
  return routines.find(r => r.isActive);
}

// ==================== BODY MEASUREMENTS ====================

export async function getBodyMeasurements(): Promise<BodyMeasurement[]> {
  return getItem(STORAGE_KEYS.BODY_MEASUREMENTS, []);
}

export async function getBodyMeasurementById(id: string): Promise<BodyMeasurement | undefined> {
  const measurements = await getBodyMeasurements();
  return measurements.find(m => m.id === id);
}

export async function getBodyMeasurementByDate(date: string): Promise<BodyMeasurement | undefined> {
  const measurements = await getBodyMeasurements();
  return measurements.find(m => m.date === date);
}

export async function addBodyMeasurement(measurement: BodyMeasurement): Promise<void> {
  const measurements = await getBodyMeasurements();

  // For typed measurements (bodybuilding/skinfold), always add as new entry
  if (measurement.type) {
    // Check if there's already a measurement for this type on this date
    const existingIndex = measurements.findIndex(
      m => m.date === measurement.date && m.type === measurement.type
    );
    if (existingIndex !== -1) {
      // Update existing typed measurement
      measurements[existingIndex] = measurement;
    } else {
      measurements.push(measurement);
    }
  } else {
    // For basic measurements (weight, body fat, height), merge by date
    const existingIndex = measurements.findIndex(m => m.date === measurement.date && !m.type);
    if (existingIndex !== -1) {
      // Merge with existing measurement
      measurements[existingIndex] = {
        ...measurements[existingIndex],
        ...measurement,
        // Keep existing values if new ones are undefined
        weight: measurement.weight ?? measurements[existingIndex].weight,
        bodyFatPercentage: measurement.bodyFatPercentage ?? measurements[existingIndex].bodyFatPercentage,
        heightInches: measurement.heightInches ?? measurements[existingIndex].heightInches,
      };
    } else {
      measurements.push(measurement);
    }
  }
  await setItem(STORAGE_KEYS.BODY_MEASUREMENTS, measurements);
}

export async function updateBodyMeasurement(measurement: BodyMeasurement): Promise<void> {
  const measurements = await getBodyMeasurements();
  const index = measurements.findIndex(m => m.id === measurement.id);
  if (index !== -1) {
    measurements[index] = measurement;
    await setItem(STORAGE_KEYS.BODY_MEASUREMENTS, measurements);
  }
}

export async function deleteBodyMeasurement(id: string): Promise<void> {
  const measurements = await getBodyMeasurements();
  const filtered = measurements.filter(m => m.id !== id);
  await setItem(STORAGE_KEYS.BODY_MEASUREMENTS, filtered);
}

export async function getBodyMeasurementsInDateRange(start: Date, end: Date): Promise<BodyMeasurement[]> {
  const measurements = await getBodyMeasurements();
  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];
  return measurements.filter(m => m.date >= startStr && m.date <= endStr);
}

export async function getLatestBodyMeasurement(): Promise<BodyMeasurement | undefined> {
  const measurements = await getBodyMeasurements();
  if (measurements.length === 0) return undefined;
  return measurements.sort((a, b) => b.date.localeCompare(a.date))[0];
}

// ==================== TYPED BODY MEASUREMENTS (for bodybuilding) ====================

export async function getBodyMeasurementsByType(type: BodyMeasurementTypeKey): Promise<BodyMeasurement[]> {
  const measurements = await getBodyMeasurements();
  return measurements.filter(m => m.type === type).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getLatestBodyMeasurementByType(type: BodyMeasurementTypeKey): Promise<BodyMeasurement | undefined> {
  const measurements = await getBodyMeasurementsByType(type);
  return measurements[0];
}

export async function getLatestAllTypedMeasurements(): Promise<Record<BodyMeasurementTypeKey, BodyMeasurement | undefined>> {
  const measurements = await getBodyMeasurements();
  const typed = measurements.filter(m => m.type && m.value !== undefined);

  const result: Partial<Record<BodyMeasurementTypeKey, BodyMeasurement>> = {};

  // Sort by date descending and group by type
  typed.sort((a, b) => b.date.localeCompare(a.date));

  for (const m of typed) {
    if (m.type && !result[m.type]) {
      result[m.type] = m;
    }
  }

  return result as Record<BodyMeasurementTypeKey, BodyMeasurement | undefined>;
}

export async function getMeasurementValue30DaysAgo(type: BodyMeasurementTypeKey): Promise<number | undefined> {
  const measurements = await getBodyMeasurementsByType(type);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  // Find the closest measurement to 30 days ago (within a 7-day window)
  const sevenDaysBefore = new Date(thirtyDaysAgo);
  sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7);
  const sevenDaysBeforeStr = sevenDaysBefore.toISOString().split('T')[0];

  const nearbyMeasurements = measurements.filter(
    m => m.date >= sevenDaysBeforeStr && m.date <= thirtyDaysAgoStr
  );

  if (nearbyMeasurements.length === 0) return undefined;

  // Return the one closest to 30 days ago
  return nearbyMeasurements[0].value;
}

export async function addTypedBodyMeasurement(
  type: BodyMeasurementTypeKey,
  value: number,
  date: string = new Date().toISOString().split('T')[0]
): Promise<BodyMeasurement> {
  const measurement: BodyMeasurement = {
    id: `body-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    date,
    type,
    value,
    source: 'manual',
  };

  await addBodyMeasurement(measurement);
  return measurement;
}

export async function addMultipleTypedMeasurements(
  measurements: { type: BodyMeasurementTypeKey; value: number }[],
  date: string = new Date().toISOString().split('T')[0]
): Promise<BodyMeasurement[]> {
  const created: BodyMeasurement[] = [];

  for (const { type, value } of measurements) {
    const measurement = await addTypedBodyMeasurement(type, value, date);
    created.push(measurement);
  }

  return created;
}

export async function getTypedMeasurementHistory(
  type: BodyMeasurementTypeKey,
  startDate: Date,
  endDate: Date = new Date()
): Promise<{ date: string; value: number }[]> {
  const measurements = await getBodyMeasurementsByType(type);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  return measurements
    .filter(m => m.date >= startStr && m.date <= endStr && m.value !== undefined)
    .map(m => ({ date: m.date, value: m.value! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ==================== MANUAL CALORIE ENTRIES ====================

const MANUAL_CALORIES_PREFIX = '@workout_tracker/manual_calories/';

export interface ManualCalorieEntry {
  calories: number;
  timestamp: string;
}

export async function getManualCalories(date: string): Promise<ManualCalorieEntry | null> {
  try {
    const key = `${MANUAL_CALORIES_PREFIX}${date}`;
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Error reading manual calories:', error);
    return null;
  }
}

export async function setManualCalories(date: string, calories: number): Promise<void> {
  try {
    const key = `${MANUAL_CALORIES_PREFIX}${date}`;
    const entry: ManualCalorieEntry = {
      calories,
      timestamp: new Date().toISOString(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error('Error writing manual calories:', error);
    throw error;
  }
}

export async function deleteManualCalories(date: string): Promise<void> {
  try {
    const key = `${MANUAL_CALORIES_PREFIX}${date}`;
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error('Error deleting manual calories:', error);
    throw error;
  }
}

export async function getTodayManualCalories(): Promise<number | null> {
  const today = new Date().toISOString().split('T')[0];
  const entry = await getManualCalories(today);
  return entry?.calories ?? null;
}

// ==================== WEEKLY SUMMARY TRACKING ====================

/**
 * Get the last time the app was opened
 */
export async function getLastAppOpened(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.LAST_APP_OPENED);
  } catch (error) {
    console.error('Error reading last app opened:', error);
    return null;
  }
}

/**
 * Update the last app opened timestamp
 */
export async function setLastAppOpened(date: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_APP_OPENED, date);
  } catch (error) {
    console.error('Error writing last app opened:', error);
  }
}

/**
 * Get the week that was dismissed for weekly summary (YYYY-WW format)
 */
export async function getWeeklySummaryDismissed(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.WEEKLY_SUMMARY_DISMISSED);
  } catch (error) {
    console.error('Error reading weekly summary dismissed:', error);
    return null;
  }
}

/**
 * Set the week as dismissed for weekly summary (YYYY-WW format)
 */
export async function setWeeklySummaryDismissed(weekId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.WEEKLY_SUMMARY_DISMISSED, weekId);
  } catch (error) {
    console.error('Error writing weekly summary dismissed:', error);
  }
}
