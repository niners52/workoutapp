import {
  MuscleGroupVolume,
  WeeklyVolume,
  PrimaryMuscleGroup,
  WorkoutSet,
  Workout,
  Exercise,
  Template,
  Routine,
  UserSettings,
  MuscleGroupTargets,
  MUSCLE_GROUP_HIERARCHY,
  ANALYTICS_CATEGORIES,
  AnalyticsCategory,
  getParentMuscleGroup,
  ALL_TRACKABLE_MUSCLE_GROUPS,
  MUSCLE_GROUP_DISPLAY_NAMES,
} from '../types';
import { getSets, getSetsInDateRange, getExercises, getUserSettings, getWorkouts, getWorkoutsInDateRange } from './storage';
import { creditedPrimaries, plannedSetCredit } from './muscleGroups';
import { buildWeek } from './rotationWeek';
import { remainingPlan } from './thisWeek';
import { countWarmupSets, isWarmupSet } from './warmupSets';
import { startOfWeek, endOfWeek, subWeeks, format, addDays } from 'date-fns';

// Calculate volume (sets) per muscle group for a date range
export async function calculateVolumeForDateRange(
  startDate: Date,
  endDate: Date
): Promise<MuscleGroupVolume[]> {
  const [sets, exercises, settings, workouts] = await Promise.all([
    getSets(),
    getExercises(),
    getUserSettings(),
    getWorkouts(),
  ]);
  return computeVolumeForDateRange(sets, workouts, exercises, settings, startDate, endDate);
}

/** calculateVolumeForDateRange over data the caller already read from storage. */
export function computeVolumeForDateRange(
  allSets: WorkoutSet[],
  workouts: Workout[],
  exercises: Exercise[],
  settings: UserSettings,
  startDate: Date,
  endDate: Date
): MuscleGroupVolume[] {
  const inRange = (iso: string) => {
    const d = new Date(iso);
    return d >= startDate && d <= endDate;
  };
  const sets = allSets.filter(s => inRange(s.loggedAt));

  // Exclude sets from deload workouts
  const deloadWorkoutIds = new Set(
    workouts.filter(w => w.isDeload && inRange(w.startedAt)).map(w => w.id)
  );

  const exerciseMap = new Map<string, Exercise>(
    exercises.map(e => [e.id, e])
  );

  // Initialize volume tracking for each muscle group
  const volumeMap = new Map<PrimaryMuscleGroup, {
    sets: number;
    exercises: Map<string, { exerciseId: string; exerciseName: string; sets: number }>;
  }>();

  ALL_TRACKABLE_MUSCLE_GROUPS.forEach(mg => {
    volumeMap.set(mg, { sets: 0, exercises: new Map() });
  });

  // Count sets for each muscle group (primary only for volume calculation)
  // With multiple primary muscles, each primary muscle group gets credit for the set
  sets.forEach(set => {
    if (deloadWorkoutIds.has(set.workoutId)) return; // Skip deload sets
    // Warm-ups are prep, not working volume. They stay in session history.
    if (isWarmupSet(set, exerciseMap.get(set.exerciseId))) return;
    const exercise = exerciseMap.get(set.exerciseId);
    if (!exercise) return;

    // Stored groups, with retired names read as their successor (upper_back -> mid_back)
    const primaryMuscleGroups = creditedPrimaries(
      exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
        ? exercise.primaryMuscleGroups
        : exercise.primaryMuscleGroup
        ? [exercise.primaryMuscleGroup]
        : [],
    );

    // Add volume to each primary muscle group
    primaryMuscleGroups.forEach(muscleGroup => {
      const volume = volumeMap.get(muscleGroup);

      if (volume) {
        // Unilateral exercises: each set is one side, so count as half a bilateral set
        const setCredit = exercise.isUnilateral ? 0.5 : 1;
        volume.sets += setCredit;

        const existingExercise = volume.exercises.get(exercise.id);
        if (existingExercise) {
          existingExercise.sets += setCredit;
        } else {
          volume.exercises.set(exercise.id, {
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            sets: setCredit,
          });
        }
      }
    });
  });

  // Convert to array format
  const result: MuscleGroupVolume[] = ALL_TRACKABLE_MUSCLE_GROUPS.map(mg => {
    const target = settings.muscleGroupTargets[mg] || 0;
    const max = settings.muscleGroupTargetsMax?.[mg] || 0;
    return {
      muscleGroup: mg,
      sets: volumeMap.get(mg)?.sets || 0,
      target,
      // A ceiling at or below the minimum is meaningless — treat as unset
      targetMax: max > target ? max : undefined,
      exercises: Array.from(volumeMap.get(mg)?.exercises.values() || []),
    };
  });

  return result;
}

// Get weekly volume data
export async function getWeeklyVolume(weekStartDate: Date): Promise<WeeklyVolume> {
  const [sets, exercises, settings, workouts] = await Promise.all([
    getSets(),
    getExercises(),
    getUserSettings(),
    getWorkouts(),
  ]);
  return computeWeeklyVolume(sets, workouts, exercises, settings, weekStartDate);
}

/** getWeeklyVolume over data the caller already read from storage. */
export function computeWeeklyVolume(
  sets: WorkoutSet[],
  workouts: Workout[],
  exercises: Exercise[],
  settings: UserSettings,
  weekStartDate: Date
): WeeklyVolume {
  // Adjust start of week based on user settings
  const dayOffset = settings.weekStartDay === 'sunday' ? 0 : 1;
  const weekStart = startOfWeek(weekStartDate, { weekStartsOn: dayOffset as 0 | 1 });
  const weekEnd = endOfWeek(weekStartDate, { weekStartsOn: dayOffset as 0 | 1 });

  const muscleGroups = computeVolumeForDateRange(sets, workouts, exercises, settings, weekStart, weekEnd);

  // Calculate totals (only for muscle groups with targets > 0)
  const totalSets = muscleGroups
    .filter(mg => mg.target > 0)
    .reduce((sum, mg) => sum + mg.sets, 0);
  const targetSets = muscleGroups
    .filter(mg => mg.target > 0)
    .reduce((sum, mg) => sum + mg.target, 0);

  // Reported, not counted: prep sets inside the week, deload sets aside.
  const deloadWorkoutIds = new Set(workouts.filter(w => w.isDeload).map(w => w.id));
  const exercisesById = new Map(exercises.map(e => [e.id, e]));
  const weekSets = sets.filter(s => {
    const at = new Date(s.loggedAt);
    return at >= weekStart && at <= weekEnd && !deloadWorkoutIds.has(s.workoutId);
  });

  return {
    weekStart: format(weekStart, 'yyyy-MM-dd'),
    weekEnd: format(weekEnd, 'yyyy-MM-dd'),
    muscleGroups,
    totalSets,
    targetSets,
    warmupSets: countWarmupSets(weekSets, exercisesById),
  };
}

// Get volume data for multiple weeks (for charts)
export async function getVolumeHistory(
  weeks: number = 8
): Promise<WeeklyVolume[]> {
  const history: WeeklyVolume[] = [];
  const today = new Date();

  for (let i = 0; i < weeks; i++) {
    const weekDate = subWeeks(today, i);
    const weeklyVolume = await getWeeklyVolume(weekDate);
    history.push(weeklyVolume);
  }

  // Return in chronological order (oldest first)
  return history.reverse();
}

// Get category volume (aggregating muscle groups into 6 main categories)
export interface CategoryVolume {
  category: AnalyticsCategory;
  name: string;
  totalSets: number;
  totalTarget: number;
  muscleGroups: MuscleGroupVolume[];
}

export function aggregateIntoCategories(
  volumes: MuscleGroupVolume[]
): CategoryVolume[] {
  return ANALYTICS_CATEGORIES.map(config => {
    const categoryVolumes = volumes.filter(v =>
      config.muscleGroups.includes(v.muscleGroup)
    );

    return {
      category: config.category,
      name: config.name,
      totalSets: categoryVolumes.reduce((sum, v) => sum + v.sets, 0),
      totalTarget: categoryVolumes.reduce((sum, v) => sum + v.target, 0),
      muscleGroups: categoryVolumes,
    };
  });
}

// Legacy function for backward compatibility
export interface ParentMuscleGroupVolume {
  parent: 'back' | 'shoulders';
  totalSets: number;
  totalTarget: number;
  children: MuscleGroupVolume[];
}

export function aggregateChildMuscleGroups(
  volumes: MuscleGroupVolume[]
): ParentMuscleGroupVolume[] {
  return MUSCLE_GROUP_HIERARCHY.map(hierarchy => {
    const childVolumes = volumes.filter(v =>
      hierarchy.children.includes(v.muscleGroup as any)
    );

    return {
      parent: hierarchy.parent,
      totalSets: childVolumes.reduce((sum, v) => sum + v.sets, 0),
      totalTarget: childVolumes.reduce((sum, v) => sum + v.target, 0),
      children: childVolumes,
    };
  });
}

// Calculate overall training score (percentage of targets met)
export function calculateTrainingScore(volumes: MuscleGroupVolume[]): number {
  const targetedVolumes = volumes.filter(v => v.target > 0);

  if (targetedVolumes.length === 0) return 0;

  const totalSets = targetedVolumes.reduce((sum, v) => sum + v.sets, 0);
  const totalTargets = targetedVolumes.reduce((sum, v) => sum + v.target, 0);

  if (totalTargets === 0) return 0;

  // Cap at 100% for the score
  return Math.min(100, Math.round((totalSets / totalTargets) * 100));
}

// Get volume breakdown by exercise for a muscle group
export async function getExerciseVolumeForMuscleGroup(
  muscleGroup: PrimaryMuscleGroup,
  startDate: Date,
  endDate: Date
): Promise<{ exerciseId: string; exerciseName: string; sets: number }[]> {
  const volumes = await calculateVolumeForDateRange(startDate, endDate);
  const muscleVolume = volumes.find(v => v.muscleGroup === muscleGroup);

  if (!muscleVolume) return [];

  // Sort by sets descending
  return muscleVolume.exercises.sort((a, b) => b.sets - a.sets);
}

// Get personal records for an exercise
export interface PersonalRecord {
  exerciseId: string;
  maxWeight: number;
  maxReps: number;
  maxVolume: number; // weight * reps
  date: string;
}

export async function getPersonalRecords(exerciseId: string): Promise<PersonalRecord | null> {
  const sets = await getSetsInDateRange(new Date(0), new Date());
  const exerciseSets = sets.filter(s => s.exerciseId === exerciseId);

  if (exerciseSets.length === 0) return null;

  let maxWeight = 0;
  let maxReps = 0;
  let maxVolume = 0;
  let prDate = '';

  exerciseSets.forEach(set => {
    if (set.weight > maxWeight) {
      maxWeight = set.weight;
    }
    if (set.reps > maxReps) {
      maxReps = set.reps;
    }
    const volume = set.weight * set.reps;
    if (volume > maxVolume) {
      maxVolume = volume;
      prDate = set.loggedAt;
    }
  });

  return {
    exerciseId,
    maxWeight,
    maxReps,
    maxVolume,
    date: prDate,
  };
}

// Get volume trend (comparing current week to previous weeks)
export interface VolumeTrend {
  muscleGroup: PrimaryMuscleGroup;
  currentWeek: number;
  previousWeek: number;
  change: number; // percentage change
  trend: 'up' | 'down' | 'stable';
}

export async function getVolumeTrends(): Promise<VolumeTrend[]> {
  const today = new Date();
  const currentWeekVolume = await getWeeklyVolume(today);
  const previousWeekVolume = await getWeeklyVolume(subWeeks(today, 1));

  return currentWeekVolume.muscleGroups.map(current => {
    const previous = previousWeekVolume.muscleGroups.find(
      p => p.muscleGroup === current.muscleGroup
    );

    const prevSets = previous?.sets || 0;
    const change = prevSets === 0
      ? (current.sets > 0 ? 100 : 0)
      : Math.round(((current.sets - prevSets) / prevSets) * 100);

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (change > 10) trend = 'up';
    else if (change < -10) trend = 'down';

    return {
      muscleGroup: current.muscleGroup,
      currentWeek: current.sets,
      previousWeek: prevSets,
      change,
      trend,
    };
  });
}

/**
 * Projected weekly volume from a routine: each rotation workout (W1..Wn) and
 * the Flex template once, or, for a routine with no rotation, each weekday's
 * templates. Each exercise credits its own target sets the way weekly volume
 * counts them (plannedSetCredit) — it used to assume 3 sets for everything,
 * which put 6-set lateral raises at half and an 8-set rotator cuff at 3.
 */
function scheduledTemplateIds(routine: Routine): string[] {
  const slots = routine.rotation?.slots;
  if (slots && slots.length > 0) {
    return [...slots.map(s => s.templateId), ...(routine.rotation?.flexTemplateId ? [routine.rotation.flexTemplateId] : [])].filter(
      (id): id is string => !!id,
    );
  }
  return routine.daySchedule.flatMap(d => d.templateIds ?? []);
}

export function calculateProjectedVolumeForRoutine(
  routine: Routine,
  templates: Template[],
  exercises: Exercise[],
  userTargets: MuscleGroupTargets
): MuscleGroupVolume[] {
  // Build a map for quick exercise lookups
  const exerciseMap = new Map<string, Exercise>(
    exercises.map(e => [e.id, e])
  );

  // Build a map for quick template lookups
  const templateMap = new Map<string, Template>(
    templates.map(t => [t.id, t])
  );

  // Initialize volume tracking for each muscle group
  const volumeMap = new Map<PrimaryMuscleGroup, {
    sets: number;
    exercises: Map<string, { exerciseId: string; exerciseName: string; sets: number }>;
  }>();

  ALL_TRACKABLE_MUSCLE_GROUPS.forEach(mg => {
    volumeMap.set(mg, { sets: 0, exercises: new Map() });
  });

  scheduledTemplateIds(routine).forEach(templateId => {
    const template = templateMap.get(templateId);
    if (!template) return;

    template.exerciseIds.forEach(exerciseId => {
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise) return;
      const credit = plannedSetCredit(exercise);
      if (credit <= 0) return;

      // Same primaries weekly volume credits (deprecated single field as fallback).
      const stored = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
        ? exercise.primaryMuscleGroups
        : exercise.primaryMuscleGroup
        ? [exercise.primaryMuscleGroup]
        : [];

      creditedPrimaries(stored).forEach(muscleGroup => {
        const volume = volumeMap.get(muscleGroup);
        if (!volume) return;
        volume.sets += credit;
        const existingExercise = volume.exercises.get(exercise.id);
        if (existingExercise) {
          existingExercise.sets += credit;
        } else {
          volume.exercises.set(exercise.id, {
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            sets: credit,
          });
        }
      });
    });
  });

  // Convert to array format
  const result: MuscleGroupVolume[] = ALL_TRACKABLE_MUSCLE_GROUPS.map(mg => ({
    muscleGroup: mg,
    sets: volumeMap.get(mg)?.sets || 0,
    target: userTargets[mg] || 0,
    exercises: Array.from(volumeMap.get(mg)?.exercises.values() || []),
  }));

  return result;
}

// Get the templates for a specific day from a routine
export function getTemplatesForDay(
  routine: Routine,
  dayOfWeek: number // 0-6 (Sunday-Saturday)
): string[] {
  const daySchedule = routine.daySchedule.find(d => d.day === dayOfWeek);
  return daySchedule?.templateIds || [];
}

// Weekly shortfall calculation
export interface MuscleGroupShortfall {
  muscleGroup: PrimaryMuscleGroup;
  displayName: string;
  currentSets: number;
  targetSets: number;
  projectedSets: number; // From remaining scheduled workouts
  shortfall: number; // target - (current + projected)
}

// Calculate muscle groups that won't hit targets even with remaining scheduled workouts
export async function calculateWeeklyShortfalls(
  routine: Routine | undefined,
  templates: Template[],
  exercises: Exercise[],
  userSettings: UserSettings
): Promise<MuscleGroupShortfall[]> {
  const today = new Date();

  // Get current week's volume
  const currentWeekVolume = await getWeeklyVolume(today);

  // Build maps for quick lookups
  const exerciseMap = new Map<string, Exercise>(
    exercises.map(e => [e.id, e])
  );

  // Projected: the rotation workouts not done yet this week (the same week
  // model as the Home "This week" card), each exercise at its own target sets.
  // This used to walk the weekday schedule from today and give every
  // exercise 3 sets, so a 6-set lateral raise counted half and a workout
  // done on another day still counted as still to come.
  const projectedVolumeMap = new Map<PrimaryMuscleGroup, number>();
  ALL_TRACKABLE_MUSCLE_GROUPS.forEach(mg => projectedVolumeMap.set(mg, 0));

  if (routine) {
    const [workouts, sets] = await Promise.all([getWorkouts(), getSets()]);
    const week = buildWeek({ routine, templates, workouts, sets, exercises, settings: userSettings, now: today });
    const flexTemplate = templates.find(t => t.id === week.rotation.flexTemplateId) ?? null;
    for (const day of remainingPlan(week.state, flexTemplate)) {
      for (const exerciseId of day.exerciseIds) {
        const exercise = exerciseMap.get(exerciseId);
        if (!exercise) continue;
        const credit = plannedSetCredit(exercise);
        if (credit <= 0) continue;
        const stored = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
          ? exercise.primaryMuscleGroups
          : exercise.primaryMuscleGroup
          ? [exercise.primaryMuscleGroup]
          : [];
        for (const mg of creditedPrimaries(stored)) {
          projectedVolumeMap.set(mg, (projectedVolumeMap.get(mg) || 0) + credit);
        }
      }
    }
  }

  // Calculate shortfalls
  const shortfalls: MuscleGroupShortfall[] = [];

  ALL_TRACKABLE_MUSCLE_GROUPS.forEach(mg => {
    const target = userSettings.muscleGroupTargets[mg] || 0;
    if (target === 0) return; // Skip muscle groups without targets

    const currentVolume = currentWeekVolume.muscleGroups.find(v => v.muscleGroup === mg);
    const currentSets = currentVolume?.sets || 0;
    const projectedSets = projectedVolumeMap.get(mg) || 0;
    const totalExpected = currentSets + projectedSets;
    const shortfall = target - totalExpected;

    if (shortfall > 0) {
      shortfalls.push({
        muscleGroup: mg,
        displayName: MUSCLE_GROUP_DISPLAY_NAMES[mg],
        currentSets,
        targetSets: target,
        projectedSets,
        shortfall,
      });
    }
  });

  // Sort by shortfall (most severe first)
  return shortfalls.sort((a, b) => b.shortfall - a.shortfall);
}

// Exercise history for a muscle group
export interface ExerciseHistoryEntry {
  exerciseId: string;
  exerciseName: string;
  lastPerformed: string;
  bestWeight: number;
  bestReps: number;
  isPrimary: boolean; // true if this muscle is primary for the exercise
}

// Get exercises that target a muscle group (primary or secondary) with history
export async function getExerciseHistoryForMuscleGroup(
  muscleGroup: PrimaryMuscleGroup,
  months: number = 3
): Promise<ExerciseHistoryEntry[]> {
  const endDate = new Date();
  const startDate = subWeeks(endDate, months * 4); // Approximate months to weeks

  const sets = await getSetsInDateRange(startDate, endDate);
  const exercises = await getExercises();

  // Exclude deload workouts from history
  const workoutsInRange = await getWorkoutsInDateRange(startDate, endDate);
  const deloadWorkoutIds = new Set(
    workoutsInRange.filter(w => w.isDeload).map(w => w.id)
  );

  // Build exercise map
  const exerciseMap = new Map<string, Exercise>(
    exercises.map(e => [e.id, e])
  );

  // Track exercise history
  const historyMap = new Map<string, {
    exerciseId: string;
    exerciseName: string;
    lastPerformed: string;
    bestWeight: number;
    bestReps: number;
    isPrimary: boolean;
  }>();

  sets.forEach(set => {
    if (deloadWorkoutIds.has(set.workoutId)) return; // Skip deload sets
    const exercise = exerciseMap.get(set.exerciseId);
    if (!exercise) return;

    // Get primary muscle groups
    const primaryMuscleGroups = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
      ? exercise.primaryMuscleGroups
      : exercise.primaryMuscleGroup
      ? [exercise.primaryMuscleGroup]
      : [];

    const isPrimary = primaryMuscleGroups.includes(muscleGroup);
    const isSecondary = (exercise.secondaryMuscleGroups || []).includes(muscleGroup);

    if (!isPrimary && !isSecondary) return;

    const existing = historyMap.get(exercise.id);

    if (!existing) {
      historyMap.set(exercise.id, {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        lastPerformed: set.loggedAt,
        bestWeight: set.weight,
        bestReps: set.reps,
        isPrimary,
      });
    } else {
      // Update last performed if this set is more recent
      if (new Date(set.loggedAt) > new Date(existing.lastPerformed)) {
        existing.lastPerformed = set.loggedAt;
      }
      // Update best set (highest weight, or if same weight, highest reps)
      if (set.weight > existing.bestWeight ||
          (set.weight === existing.bestWeight && set.reps > existing.bestReps)) {
        existing.bestWeight = set.weight;
        existing.bestReps = set.reps;
      }
    }
  });

  // Convert to array and sort by last performed (most recent first)
  return Array.from(historyMap.values())
    .sort((a, b) => new Date(b.lastPerformed).getTime() - new Date(a.lastPerformed).getTime());
}

// Get muscle groups that were skipped this week AND are under their volume target.
// Returns a set of PrimaryMuscleGroup names for use by shortfalls/coach suggestions.
export async function getSkippedMuscleGroupsUnderTarget(
  workouts: Workout[],
  exercises: Exercise[],
  userSettings: UserSettings
): Promise<Set<PrimaryMuscleGroup>> {
  const exerciseMap = new Map(exercises.map(e => [e.id, e]));

  // Scope to current week only
  const today = new Date();
  const weekStartsOn = (userSettings.weekStartDay === 'sunday' ? 0 : 1) as 0 | 1;
  const weekStart = startOfWeek(today, { weekStartsOn });

  const currentWeekWorkouts = workouts.filter(
    w => w.completedAt && new Date(w.completedAt) >= weekStart
  );

  // Collect all muscle groups from skipped exercises this week
  const skippedMGs = new Set<PrimaryMuscleGroup>();
  currentWeekWorkouts.forEach(workout => {
    if (!workout.skippedExerciseIds?.length) return;
    workout.skippedExerciseIds.forEach(exId => {
      const ex = exerciseMap.get(exId);
      if (!ex) return;
      const primaries = ex.primaryMuscleGroups?.length
        ? ex.primaryMuscleGroups
        : ex.primaryMuscleGroup ? [ex.primaryMuscleGroup] : [];
      primaries.forEach(mg => skippedMGs.add(mg as PrimaryMuscleGroup));
    });
  });

  if (skippedMGs.size === 0) return skippedMGs;

  // Check current week volume against targets — drop any that are already met
  const weeklyVolume = await getWeeklyVolume(today);
  const underTarget = new Set<PrimaryMuscleGroup>();

  skippedMGs.forEach(mg => {
    const target = userSettings.muscleGroupTargets[mg] || 0;
    if (target === 0) return; // No target set, nothing to flag
    const current = weeklyVolume.muscleGroups.find(v => v.muscleGroup === mg);
    if ((current?.sets || 0) < target) {
      underTarget.add(mg);
    }
  });

  return underTarget;
}
