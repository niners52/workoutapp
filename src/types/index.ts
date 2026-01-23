// Core data types for the workout tracking app

export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | 'other';
export type ExerciseLocation = 'gym' | 'home' | 'both';
export type WeekStartDay = 'sunday' | 'monday';
export type TemplateType = 'push' | 'pull' | 'lower';

// Workout Location entity (user-defined locations)
export interface WorkoutLocation {
  id: string;
  name: string;
  sortOrder: number;
}

export const DEFAULT_LOCATIONS: WorkoutLocation[] = [
  { id: 'gym', name: 'Gym', sortOrder: 0 },
  { id: 'home', name: 'Home', sortOrder: 1 },
];

export const TEMPLATE_TYPE_DISPLAY_NAMES: Record<TemplateType, string> = {
  push: 'Push',
  pull: 'Pull',
  lower: 'Lower',
};

export const ALL_TEMPLATE_TYPES: TemplateType[] = ['push', 'pull', 'lower'];

// Muscle Group Hierarchy - 6 main categories for analytics display
export type AnalyticsCategory = 'back' | 'shoulders' | 'chest' | 'arms' | 'legs' | 'core';

// All individual muscle groups that can be tracked
export type PrimaryMuscleGroup =
  | 'lats'
  | 'upper_back'
  | 'traps'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'chest'
  | 'triceps'
  | 'biceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'calves'
  | 'abs'
  | 'glutes'
  | 'lower_back'
  | 'miscellaneous';

// Legacy types kept for backward compatibility
export type ParentMuscleGroup = 'back' | 'shoulders';
export type ChildMuscleGroup = 'lats' | 'upper_back' | 'front_delts' | 'side_delts' | 'rear_delts';
export type StandaloneMuscleGroup =
  | 'chest'
  | 'triceps'
  | 'biceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs'
  | 'forearms'
  | 'traps'
  | 'lower_back'
  | 'miscellaneous';

export type MuscleGroup = AnalyticsCategory | PrimaryMuscleGroup;

export interface AnalyticsCategoryConfig {
  category: AnalyticsCategory;
  name: string;
  muscleGroups: PrimaryMuscleGroup[];
}

// 6 main categories for analytics display
export const ANALYTICS_CATEGORIES: AnalyticsCategoryConfig[] = [
  { category: 'back', name: 'Back', muscleGroups: ['lats', 'upper_back', 'traps'] },
  { category: 'shoulders', name: 'Shoulders', muscleGroups: ['front_delts', 'side_delts', 'rear_delts'] },
  { category: 'chest', name: 'Chest', muscleGroups: ['chest'] },
  { category: 'arms', name: 'Arms', muscleGroups: ['triceps', 'biceps', 'forearms'] },
  { category: 'legs', name: 'Legs', muscleGroups: ['quads', 'hamstrings', 'calves'] },
  { category: 'core', name: 'Core', muscleGroups: ['abs', 'glutes', 'lower_back'] },
];

// Legacy hierarchy for backward compatibility
export interface MuscleGroupHierarchy {
  parent: ParentMuscleGroup;
  children: ChildMuscleGroup[];
}

export const MUSCLE_GROUP_HIERARCHY: MuscleGroupHierarchy[] = [
  { parent: 'back', children: ['lats', 'upper_back'] },
  { parent: 'shoulders', children: ['front_delts', 'side_delts', 'rear_delts'] },
];

export const STANDALONE_MUSCLE_GROUPS: StandaloneMuscleGroup[] = [
  'chest',
  'triceps',
  'biceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'forearms',
  'traps',
  'lower_back',
  'miscellaneous',
];

export const ALL_TRACKABLE_MUSCLE_GROUPS: (PrimaryMuscleGroup)[] = [
  'chest',
  'lats',
  'upper_back',
  'front_delts',
  'side_delts',
  'rear_delts',
  'triceps',
  'biceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'forearms',
  'traps',
  'lower_back',
  'miscellaneous',
];

export const MUSCLE_GROUP_DISPLAY_NAMES: Record<MuscleGroup, string> = {
  // Analytics categories
  back: 'Back',
  shoulders: 'Shoulders',
  chest: 'Chest',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
  // Individual muscle groups
  lats: 'Lats',
  upper_back: 'Upper Back',
  traps: 'Traps',
  front_delts: 'Front Delts',
  side_delts: 'Side Delts',
  rear_delts: 'Rear Delts',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  abs: 'Abs',
  glutes: 'Glutes',
  lower_back: 'Lower Back',
  miscellaneous: 'Miscellaneous',
};

// Get parent muscle group for a child, or null if standalone
export function getParentMuscleGroup(muscleGroup: MuscleGroup): ParentMuscleGroup | null {
  for (const hierarchy of MUSCLE_GROUP_HIERARCHY) {
    if ((hierarchy.children as string[]).includes(muscleGroup)) {
      return hierarchy.parent;
    }
  }
  return null;
}

// Cable Accessory types
export type CableAccessory =
  | 'straight_bar'
  | 'ez_bar'
  | 'rope'
  | 'v_bar'
  | 'd_handle'
  | 'ankle_strap'
  | 'lat_bar'
  | 'other';

export const CABLE_ACCESSORY_DISPLAY_NAMES: Record<CableAccessory, string> = {
  straight_bar: 'Straight Bar',
  ez_bar: 'EZ Bar',
  rope: 'Rope',
  v_bar: 'V-Bar',
  d_handle: 'D-Handle',
  ankle_strap: 'Ankle Strap',
  lat_bar: 'Lat Bar',
  other: 'Other',
};

export const ALL_CABLE_ACCESSORIES: CableAccessory[] = [
  'straight_bar',
  'ez_bar',
  'rope',
  'v_bar',
  'd_handle',
  'ankle_strap',
  'lat_bar',
  'other',
];

// Exercise
export interface Exercise {
  id: string;
  name: string;
  primaryMuscleGroup?: PrimaryMuscleGroup; // Deprecated: use primaryMuscleGroups
  primaryMuscleGroups: PrimaryMuscleGroup[]; // Can have multiple primary muscles
  secondaryMuscleGroups: PrimaryMuscleGroup[];
  equipment: Equipment;
  cableAccessory?: CableAccessory; // Only used when equipment is 'cable'
  location?: ExerciseLocation; // Deprecated: kept for backward compatibility
  locationIds?: string[]; // References WorkoutLocation.id - exercises available at these locations
  isCustom?: boolean;
}

// Template
export interface Template {
  id: string;
  name: string;
  type: TemplateType;
  locationId: string; // References WorkoutLocation.id
  exerciseIds: string[];
}

// Workout
export interface Workout {
  id: string;
  startedAt: string; // ISO date string
  completedAt: string | null;
  templateId: string | null;
}

// Set
export interface WorkoutSet {
  id: string;
  workoutId: string;
  exerciseId: string;
  reps: number;
  weight: number; // in lbs
  loggedAt: string; // ISO date string
}

// User Settings
export interface MuscleGroupTargets {
  [key: string]: number; // muscle group id -> target sets per week
}

export interface UserSettings {
  weekStartDay: WeekStartDay;
  proteinGoal: number; // grams
  sleepGoal: number; // hours
  restTimerSeconds: number;
  muscleGroupTargets: MuscleGroupTargets;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  weekStartDay: 'monday',
  proteinGoal: 150,
  sleepGoal: 8,
  restTimerSeconds: 90,
  muscleGroupTargets: {
    chest: 10,
    lats: 10,
    upper_back: 6,
    front_delts: 6,
    side_delts: 10,
    rear_delts: 6,
    triceps: 6,
    biceps: 6,
    quads: 10,
    hamstrings: 6,
    glutes: 6,
    calves: 6,
    abs: 6,
    forearms: 0,
    traps: 6,
    lower_back: 0,
    miscellaneous: 0,
  },
};

// Apple Health Data Types
export interface NutritionData {
  date: string; // ISO date string (date only, no time)
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
}

export interface SleepStages {
  deep: number; // hours
  rem: number; // hours
  core: number; // hours (light sleep)
  awake: number; // hours
}

export interface SleepData {
  date: string; // ISO date string (date only, the morning you woke up)
  totalHours: number;
  stages: SleepStages | null;
}

// Volume Analytics
export interface MuscleGroupVolume {
  muscleGroup: PrimaryMuscleGroup;
  sets: number;
  target: number;
  exercises: { exerciseId: string; exerciseName: string; sets: number }[];
}

export interface WeeklyVolume {
  weekStart: string; // ISO date string
  weekEnd: string;
  muscleGroups: MuscleGroupVolume[];
  totalSets: number;
  targetSets: number;
}

// Setgraph Import
export interface SetgraphRow {
  exerciseName: string;
  date: string;
  repetitions: number;
  weightLb: number;
  weightKg: number;
  note: string;
  labelName: string;
}

export interface SetgraphExerciseMapping {
  setgraphName: string;
  exerciseId: string | null; // null means create new exercise
  needsMapping: boolean;
}
