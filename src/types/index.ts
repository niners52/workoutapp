// Core data types for the workout tracking app

export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'smith_machine' | 'kettlebell' | 'bodyweight' | 'medicine_ball' | 'resistance_band' | 'landmine' | 'trap_bar' | 'other';

export const EQUIPMENT_DISPLAY_NAMES: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable: 'Cable',
  machine: 'Machine',
  smith_machine: 'Smith Machine',
  kettlebell: 'Kettlebell',
  bodyweight: 'Bodyweight',
  medicine_ball: 'Medicine Ball',
  resistance_band: 'Resistance Band',
  landmine: 'Landmine',
  trap_bar: 'Trap Bar',
  other: 'Other',
};

export type ExerciseLocation = 'gym' | 'home' | 'both';
export type WeekStartDay = 'sunday' | 'monday';
export type TemplateType = 'push' | 'pull' | 'lower' | 'full_body';
export type UnitSystem = 'imperial' | 'metric';

// Workout modality — what kind of training the user is doing. Drives which logger
// the app shows and which categories the analytics roll up under.
// Templates without modality default to 'strength' (backward compat with all
// existing templates, which are all weight-training).
export type Modality = 'strength' | 'aerobic' | 'balance' | 'recovery';

export const MODALITY_DISPLAY_NAMES: Record<Modality, string> = {
  strength: 'Strength',
  aerobic: 'Aerobic',
  balance: 'Balance',
  recovery: 'Recovery',
};

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

// Built-in pseudo-location for temporary gyms (vacation, hotel, etc.).
// Not stored in the locations table — always offered in the location picker.
// Workouts here count toward volume/streaks/goals like any workout, but are
// EXCLUDED from per-gym weight-suggestion history so hotel-dumbbell weights
// never overwrite your regular gym numbers.
export const TRAVEL_LOCATION_ID = 'travel';
export const TRAVEL_LOCATION: WorkoutLocation = {
  id: TRAVEL_LOCATION_ID,
  name: 'Travel / Other',
  sortOrder: 9999,
};

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
export type ChildMuscleGroup = 'lats' | 'upper_back' | 'front_delts' | 'side_delts';
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
  { category: 'shoulders', name: 'Shoulders', muscleGroups: ['front_delts', 'side_delts', 'traps'] },
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
  { parent: 'shoulders', children: ['front_delts', 'side_delts'] },
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
  | 'single_handle'
  | 'double_handle'
  | 'ankle_strap'
  | 'lat_bar'
  | 'close_grip_handle'
  | 'other';

export const CABLE_ACCESSORY_DISPLAY_NAMES: Record<CableAccessory, string> = {
  straight_bar: 'Straight Bar',
  ez_bar: 'EZ Bar',
  rope: 'Rope',
  v_bar: 'V-Bar',
  d_handle: 'D-Handle',
  single_handle: 'Single Handle',
  double_handle: 'Double Handle',
  ankle_strap: 'Ankle Strap',
  lat_bar: 'Lat Bar',
  close_grip_handle: 'Close Grip Handle',
  other: 'Other',
};

export const ALL_CABLE_ACCESSORIES: CableAccessory[] = [
  'straight_bar',
  'ez_bar',
  'rope',
  'v_bar',
  'd_handle',
  'single_handle',
  'double_handle',
  'ankle_strap',
  'lat_bar',
  'close_grip_handle',
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
  baseName?: string; // Exercise name without equipment prefix (e.g., "Bicep Curl")
  primaryMuscleGroup?: PrimaryMuscleGroup; // Deprecated: use primaryMuscleGroups
  primaryMuscleGroups?: PrimaryMuscleGroup[]; // Can have multiple primary muscles (optional for backward compat)
  secondaryMuscleGroups?: PrimaryMuscleGroup[];
  equipment: Equipment;
  cableAccessory?: CableAccessory; // Only used when equipment is 'cable'
  machineWeightType?: MachineWeightType; // Only used when equipment is 'machine'
  location?: ExerciseLocation; // Deprecated: kept for backward compatibility
  locationIds?: string[]; // References WorkoutLocation.id - exercises available at these locations
  isCustom?: boolean;
  isFavorite?: boolean; // Starred "must-do" exercise — drives the Favorites filter, routine-builder coverage, and the weekly not-yet-hit list
  isUnilateral?: boolean; // Single-limb exercise — doubles target sets, halves volume credit
  notes?: string; // Personal notes (bench angle, cable height, grip width, etc.)
  targetSets?: number; // Per-exercise default target set count; falls back to UserSettings.defaultTargetSets (doubled if unilateral) when undefined
  targetReps?: string; // Display target, e.g. "8" or "8-15". Informational — not enforced by the logger.
}

/**
 * Get the structured display name for an exercise.
 * If baseName is set: [Equipment] [baseName] or Cable ([Attachment]) [baseName]
 * Otherwise falls back to exercise.name for backward compatibility.
 */
export function getExerciseDisplayName(exercise: Exercise): string {
  if (!exercise.baseName) return exercise.name;

  const equipName = EQUIPMENT_DISPLAY_NAMES[exercise.equipment];
  if (exercise.equipment === 'cable' && exercise.cableAccessory) {
    const accessory = CABLE_ACCESSORY_DISPLAY_NAMES[exercise.cableAccessory];
    return `Cable (${accessory}) ${exercise.baseName}`;
  }
  return `${equipName} ${exercise.baseName}`;
}

// Template
export interface Template {
  id: string;
  name: string;
  type: TemplateType;
  locationId: string; // References WorkoutLocation.id
  exerciseIds: string[];
  // What kind of training this template is for. Undefined defaults to 'strength'
  // so all existing weight-training templates work without migration.
  modality?: Modality;
}

// Workout
export interface Workout {
  id: string;
  startedAt: string; // ISO date string
  completedAt: string | null;
  templateId: string | null;
  locationId?: string; // References WorkoutLocation.id — where the workout happened. Optional: older records predate this field and are treated as "unknown location".
  skippedExerciseIds?: string[]; // Template exercises with zero sets logged
  isDeload?: boolean; // Workout performed during a deload week
}

// Set
// Aerobic / balance / recovery sessions reuse this entry shape rather than a
// parallel table so analytics stay in one place. The optional fields below are
// populated by the modality-specific loggers; strength sets leave them undefined.
export interface WorkoutSet {
  id: string;
  workoutId: string;
  exerciseId: string;
  reps: number;
  weight: number; // in lbs
  loggedAt: string; // ISO date string
  // ─── Aerobic / cardio fields (modality-gated) ─────────────────────────────
  durationMin?: number;
  intensityRPE?: number;     // 6-20 Borg scale, or 1-10 modified — store raw
  avgHR?: number;            // bpm
  maxHR?: number;            // bpm
  distance?: number;         // miles (imperial) — UI converts for metric
  activeEnergy?: number;     // kcal
  // Derived zone from HR%max / RPE — see deriveIntensityZone(). Stored so
  // analytics don't have to re-derive on every read.
  intensityZone?: CardioIntensity;
}

export interface ExerciseSwap {
  id: string;
  workoutId: string;
  originalExerciseId: string; // exercise that was originally in this slot (from template)
  currentExerciseId: string;  // latest exercise after any swap chain
  swappedAt: string;          // ISO of most recent swap
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
  // Optional per-muscle ideal ceiling; muscleGroupTargets is the weekly minimum.
  // 0/absent = no ceiling. Local-only (not synced to cloud, like coach/fatigue settings).
  muscleGroupTargetsMax?: MuscleGroupTargets;
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
  // 'encouragement_only' hides decline/comparison warnings entirely.
  // 'balanced' (default) shows mix of wins + at most one constructive nudge.
  // 'data_focused' shows the full set of constructive/analytical insights without
  // the lead-positive bias — for users who want the unvarnished signal.
  // Note: during the 14-day return-from-break grace window, the coach auto-switches
  // to encouragement-only behavior regardless of this setting.
  coachMode?: 'encouragement_only' | 'balanced' | 'data_focused';
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
  // Weekly routine planning reminder (recurring weekly notification)
  weeklyPlannerReminderEnabled?: boolean; // default false
  weeklyPlannerReminderDay?: number;      // 0=Sunday … 6=Saturday, default 0 (Sunday)
  weeklyPlannerReminderHour?: number;     // 0-23, default 19 (7pm)
  weeklyPlannerReminderMinute?: number;   // 0-59, default 0
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
    upper_back: 12, // formerly 6 + 6 from rear_delts (merged in V10)
    front_delts: 6,
    side_delts: 10,
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
  target: number; // weekly minimum
  targetMax?: number; // ideal ceiling; undefined when the user hasn't set one
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
export type RoutineDayType = 'workout' | 'cardio' | 'active_recovery' | 'rest';

export type CardioType = 'running' | 'cycling' | 'walking' | 'elliptical' | 'rowing' | 'swimming' | 'hiking' | 'hiit' | 'other';
export type CardioIntensity = 'low' | 'moderate' | 'high';

export const CARDIO_TYPE_DISPLAY_NAMES: Record<CardioType, string> = {
  running: 'Running',
  cycling: 'Cycling',
  walking: 'Walking',
  elliptical: 'Elliptical',
  rowing: 'Rowing',
  swimming: 'Swimming',
  hiking: 'Hiking',
  hiit: 'HIIT',
  other: 'Other',
};

export const CARDIO_INTENSITY_DISPLAY_NAMES: Record<CardioIntensity, string> = {
  low: 'Low (Zone 2)',
  moderate: 'Moderate',
  high: 'High (Intervals)',
};

export const ALL_CARDIO_TYPES: CardioType[] = ['running', 'cycling', 'walking', 'elliptical', 'rowing', 'swimming', 'hiking', 'hiit', 'other'];
export const ALL_CARDIO_INTENSITIES: CardioIntensity[] = ['low', 'moderate', 'high'];

export const ROUTINE_DAY_TYPE_DISPLAY_NAMES: Record<RoutineDayType, string> = {
  workout: 'Strength',
  cardio: 'Cardio',
  active_recovery: 'Active Recovery',
  rest: 'Rest',
};

export interface RoutineDaySchedule {
  day: number;              // 0-6 (0=Sunday, 1=Monday, etc.)
  templateIds: string[];    // empty array = rest day (for workout type)
  dayType?: RoutineDayType; // undefined defaults to 'workout' for backward compat
  // Cardio-specific fields (only used when dayType === 'cardio')
  cardioType?: CardioType;
  cardioDurationMinutes?: number;  // e.g., 30
  cardioIntensity?: CardioIntensity;
  cardioNotes?: string;            // e.g., "Zone 2 steady state"
  // ─── Modality + targets (Program-style scheduling) ───────────────────────
  // `modality` is the canonical day-type going forward; `dayType` is kept for
  // backward compat. Derived as: strength→workout, aerobic→cardio,
  // recovery→rest, balance→workout (with the template carrying modality:balance).
  modality?: Modality;
  targetDurationMin?: number;   // generalized "duration target" — supersedes cardioDurationMinutes
  targetIntensityRPE?: number;  // e.g., 11-13 on Borg
  targetHRPctMax?: number;      // e.g., 65 for "65% HRmax"
  notes?: string;               // general per-day notes; supersedes cardioNotes
}

export interface Routine {
  id: string;
  name: string;
  daySchedule: RoutineDaySchedule[]; // 7 entries, one per day
  isActive: boolean;
  // Built-in routines shipped with the app (e.g., MS Foundations). User can clone
  // them into their own account but presets themselves are read-only.
  isPreset?: boolean;
  // Free-text notes attached to the whole routine (clinical guidance, scaling, etc.)
  notes?: string;
}

// Map legacy dayType to the new modality. Templates dictate strength vs balance.
export function dayTypeToModality(dayType?: RoutineDayType): Modality {
  switch (dayType) {
    case 'cardio': return 'aerobic';
    case 'active_recovery':
    case 'rest':
      return 'recovery';
    case 'workout':
    default:
      return 'strength';
  }
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
export type ChallengeType =
  | 'most_sets'         // legacy — raw-output leaderboard
  | 'most_workouts'     // legacy — raw-output leaderboard
  | 'plan_completion'   // % of each user's OWN planned sessions completed this week
  | 'team_coop';        // shared goal — combined session count for both partners
export type ChallengeStatus = 'pending' | 'active' | 'completed' | 'declined' | 'cancelled';

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
  plan_completion: 'Plan Completion %',
  team_coop: 'Team Co-op',
};
