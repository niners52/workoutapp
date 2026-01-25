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
  DEFAULT_USER_SETTINGS,
  DEFAULT_LOCATIONS,
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
  INITIALIZED: '@workout_tracker/initialized',
  MIGRATION_VERSION: '@workout_tracker/migration_version',
  SETGRAPH_MAPPINGS: '@workout_tracker/setgraph_mappings',
} as const;

// Current migration version
const CURRENT_MIGRATION_VERSION = 6;

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
  const exercises = await getExercises();
  const filtered = exercises.filter(e => e.id !== id);
  await setItem(STORAGE_KEYS.EXERCISES, filtered);
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
  return getItem(STORAGE_KEYS.USER_SETTINGS, DEFAULT_USER_SETTINGS);
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
  exportedAt: string;
  version: string;
}

export async function exportAllData(): Promise<ExportData> {
  const [exercises, templates, locations, workouts, sets, userSettings] = await Promise.all([
    getExercises(),
    getTemplates(),
    getLocations(),
    getWorkouts(),
    getSets(),
    getUserSettings(),
  ]);

  return {
    exercises,
    templates,
    locations,
    workouts,
    sets,
    userSettings,
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
