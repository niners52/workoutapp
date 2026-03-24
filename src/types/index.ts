// Core data types for the workout tracking app

export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'smith_machine' | 'kettlebell' | 'bodyweight' | 'medicine_ball' | 'other';

export const EQUIPMENT_DISPLAY_NAMES: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  cable: 'Cable',
  machine: 'Machine',
  smith_machine: 'Smith Machine',
  kettlebell: 'Kettlebell',
  bodyweight: 'Bodyweight',
  medicine_ball: 'Medicine Ball',
  other: 'Other',
};

export type ExerciseLocation = 'gym' | 'home' | 'both';
export type WeekStartDay = 'sunday' | 'monday';
export type TemplateType = 'push' | 'pull' | 'lower' | 'full_body';
export type UnitSystem = 'imperial' | 'metric';

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

// Supplement tracking
export interface Supplement {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface SupplementIntake {
  id: string;
  supplementId: string;
  date: string; // 'YYYY-MM-DD' format
  takenAt: string; // ISO datetime when marked as taken
}

// Physical therapy tracking
export interface PTRoutine {
  id: string;
  name: string;       // e.g., "Shoulder rehab", "Knee exercises"
  sortOrder: number;
  isActive: boolean;
}

export interface PTCompletion {
  id: string;
  ptRoutineId: string;
  date: string;        // 'YYYY-MM-DD' format
  completedAt: string; // ISO datetime when marked as done
}

export const TEMPLATE_TYPE_DISPLAY_NAMES: Record<TemplateType, string> = {
  push: 'Push',
  pull: 'Pull',
  lower: 'Lower',
  full_body: 'Full Body',
};

export const ALL_TEMPLATE_TYPES: TemplateType[] = ['push', 'pull', 'lower', 'full_body'];

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
  { category: 'back', name: 'Back', muscleGroups: ['lats', 'upper_back', 'lower_back'] },
  { category: 'shoulders', name: 'Shoulders', muscleGroups: ['front_delts', 'side_delts', 'rear_delts', 'traps'] },
  { category: 'chest', name: 'Chest', muscleGroups: ['chest'] },
  { category: 'arms', name: 'Arms', muscleGroups: ['triceps', 'biceps', 'forearms'] },
  { category: 'legs', name: 'Legs', muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'] },
  { category: 'core', name: 'Core', muscleGroups: ['abs'] },
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

export type MachineWeightType = 'plate_loaded' | 'selectorized';

export const MACHINE_WEIGHT_TYPE_DISPLAY_NAMES: Record<MachineWeightType, string> = {
  plate_loaded: 'Plate Loaded',
  selectorized: 'Weight Stack (Pin)',
};

export const ALL_MACHINE_WEIGHT_TYPES: MachineWeightType[] = ['plate_loaded', 'selectorized'];

// Exercise
export interface Exercise {
  id: string;
  name: string;
  primaryMuscleGroup?: PrimaryMuscleGroup; // Deprecated: use primaryMuscleGroups
  primaryMuscleGroups?: PrimaryMuscleGroup[]; // Can have multiple primary muscles (optional for backward compat)
  secondaryMuscleGroups?: PrimaryMuscleGroup[];
  equipment: Equipment;
  cableAccessory?: CableAccessory; // Only used when equipment is 'cable'
  machineWeightType?: MachineWeightType; // Only used when equipment is 'machine'
  location?: ExerciseLocation; // Deprecated: kept for backward compatibility
  locationIds?: string[]; // References WorkoutLocation.id - exercises available at these locations
  isCustom?: boolean;
  isUnilateral?: boolean; // Single-limb exercise — doubles target sets, halves volume credit
  notes?: string; // Personal notes (bench angle, cable height, grip width, etc.)
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
  skippedExerciseIds?: string[]; // Template exercises with zero sets logged
  isDeload?: boolean; // Workout performed during a deload week
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

// Daily Goals - what you aim for each day
export interface DailyGoals {
  sleepHours: number;        // e.g., 7
  proteinGrams: number;      // e.g., 150
  trackCreatine: boolean;    // true = track it (just needs to be taken)
  trackTraining: boolean;    // true = track it (any workout counts)
  trackPT?: boolean;         // true = track physical therapy completion
}

// Weekly Goals - aggregate targets for the week
export interface WeeklyGoals {
  sleepHours: number;        // e.g., 49 (7 * 7)
  proteinDays: number;       // e.g., 6 (days hitting daily goal)
  creatineDays: number;      // e.g., 7
  trainingDays: number;      // e.g., 5
  yogaMinutes?: number;      // e.g., 60 (weekly target minutes)
  cardioMinutes?: number;    // e.g., 60 (weekly target minutes)
  ptDays?: number;           // e.g., 7 (days per week PT should be done)
}

export const DEFAULT_DAILY_GOALS: DailyGoals = {
  sleepHours: 7,
  proteinGrams: 150,
  trackCreatine: true,
  trackTraining: true,
};

export const DEFAULT_WEEKLY_GOALS: WeeklyGoals = {
  sleepHours: 49,      // 7 hours * 7 days
  proteinDays: 6,
  creatineDays: 7,
  trainingDays: 5,
  yogaMinutes: 60,
  cardioMinutes: 60,
};

// Body fat calculation types
export type BodyFatFormula = 'jp3' | 'jp7' | 'dw4' | 'parillo9';
export type BiologicalSex = 'male' | 'female';

// Nutrition mode types
export type NutritionMode = 'recomp' | 'bulk' | 'cut';

export interface UserSettings {
  weekStartDay: WeekStartDay;
  units: UnitSystem;
  proteinGoal: number; // grams - legacy, use dailyGoals.proteinGrams
  sleepGoal: number; // hours - legacy, use dailyGoals.sleepHours
  restTimerSeconds: number;
  minimumSetsPerExercise: number; // Warn if finishing workout with fewer sets
  defaultTargetSets: number; // Target sets per exercise during workout (drives "Set X of Y")
  moveCompletedToBottom: boolean; // Auto-move completed exercises to bottom of list
  muscleGroupTargets: MuscleGroupTargets;
  dailyGoals: DailyGoals;
  weeklyGoals: WeeklyGoals;
  creatineSupplementId?: string; // ID of the supplement to track as "creatine" for streaks
  // Body fat calculation settings
  bodyFatFormula: BodyFatFormula;
  biologicalSex: BiologicalSex | null;
  birthYear: number | null;
  // Nutrition goal settings
  nutritionMode: NutritionMode;
  calorieGoal: number | null;
  calorieTolerancePercent: number;
  // Progress photos privacy
  progressPhotosLocked?: boolean;
  // Coach suggestions
  coachSuggestionsEnabled?: boolean;
  // Fatigue detection
  fatigueDetectionEnabled?: boolean;
  fatigueSensitivity?: number;
  isOnDeload?: boolean;
  deloadPercentage?: number; // Weight percentage during deload (default 50, range 40-60)
  // PR notifications
  milestoneCelebrationsEnabled?: boolean;
  // Sleep fallback
  sleepFallbackReminderEnabled?: boolean;  // default true
  sleepFallbackAutoAverage?: boolean;      // default false
  // Body weight source for Strength Map
  bodyWeightSource?: 'auto' | 'manual';   // default 'auto' — HealthKit first, then manual
  // Yoga & Cardio tracking from HealthKit
  trackYoga?: boolean;                    // default false
  trackCardio?: boolean;                  // default false
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  weekStartDay: 'monday',
  units: 'imperial',
  proteinGoal: 150,
  sleepGoal: 8,
  restTimerSeconds: 90,
  minimumSetsPerExercise: 3,
  defaultTargetSets: 3,
  moveCompletedToBottom: true,
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
  dailyGoals: DEFAULT_DAILY_GOALS,
  weeklyGoals: DEFAULT_WEEKLY_GOALS,
  // Body fat calculation defaults
  bodyFatFormula: 'jp3',
  biologicalSex: null,
  birthYear: null,
  // Nutrition goal defaults
  nutritionMode: 'recomp',
  calorieGoal: null,
  calorieTolerancePercent: 10,
  deloadPercentage: 50,
  milestoneCelebrationsEnabled: true,
  sleepFallbackReminderEnabled: true,
  sleepFallbackAutoAverage: false,
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

export interface ManualSleepEntry {
  date: string;         // 'YYYY-MM-DD'
  totalHours: number;
  isManual: boolean;    // true = user typed hours
  isEstimate: boolean;  // true = "Use my average" tapped
  createdAt: string;    // ISO timestamp
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

// Weekly Routine types
export interface RoutineDaySchedule {
  day: number;              // 0-6 (0=Sunday, 1=Monday, etc.)
  templateIds: string[];    // empty array = rest day, can have multiple for AM/PM workouts
}

export interface Routine {
  id: string;
  name: string;
  daySchedule: RoutineDaySchedule[]; // 7 entries, one per day
  isActive: boolean;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Body Measurements
// Body measurement types for bodybuilding tracking
export type BodyMeasurementTypeKey =
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'left_arm'
  | 'right_arm'
  | 'left_forearm'
  | 'right_forearm'
  | 'waist'
  | 'hips'
  | 'left_thigh'
  | 'right_thigh'
  | 'left_calf'
  | 'right_calf'
  // Skinfold caliper measurements (in mm)
  | 'skinfold_chest'
  | 'skinfold_midaxillary'
  | 'skinfold_tricep'
  | 'skinfold_bicep'
  | 'skinfold_subscapular'
  | 'skinfold_abdomen'
  | 'skinfold_suprailiac'
  | 'skinfold_thigh'
  | 'skinfold_calf';

export interface BodyMeasurement {
  id: string;
  date: string; // 'YYYY-MM-DD' format
  weight?: number; // stored in lbs
  bodyFatPercentage?: number;
  heightInches?: number; // stored in inches
  // For bodybuilding measurements
  type?: BodyMeasurementTypeKey; // measurement type (neck, chest, arm, etc.)
  value?: number; // stored in inches
  source: 'healthkit' | 'manual';
  syncedAt?: string; // ISO datetime when synced from HealthKit
}

export interface BodyMeasurementHistory {
  date: string;
  value: number;
}

// ============================================
// Progress Photos
// ============================================

export type PhotoPose = 'front' | 'side' | 'back' | 'other';

export interface ProgressPhoto {
  id: string;
  date: string;           // YYYY-MM-DD
  createdAt: string;      // ISO timestamp
  pose: PhotoPose;
  fileName: string;       // relative path in app's document directory
  weight?: number;        // lbs (auto-tagged from most recent entry)
  notes?: string;
}

// ============================================
// Accountability Partner & Challenges
// ============================================

export type PartnershipStatus = 'pending' | 'active' | 'disconnected';
export type ChallengeType = 'most_sets' | 'most_workouts';
export type ChallengeStatus = 'pending' | 'active' | 'completed' | 'declined';

export interface Partnership {
  id: string;
  userId1: string;
  userId2: string;
  createdAt: string;
  status: PartnershipStatus;
  initiatedBy: string;
}

export interface InviteCode {
  id: string;
  userId: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  usedBy: string | null;
  usedAt: string | null;
}

export interface Challenge {
  id: string;
  partnershipId: string;
  type: ChallengeType;
  startDate: string;
  endDate: string;
  status: ChallengeStatus;
  createdBy: string;
  createdAt: string;
  winnerUserId: string | null;
  user1Score: number;
  user2Score: number;
}

export interface PartnerStats {
  userId: string;
  displayName: string;
  workoutStreak: number;
  calorieStreak: number;
  lastWorkoutDate: string | null;
  lastWorkoutType: string | null;
  weeklySets: number;
  updatedAt: string;
}

export const CHALLENGE_TYPE_NAMES: Record<ChallengeType, string> = {
  most_sets: 'Most Sets',
  most_workouts: 'Most Workouts',
};
