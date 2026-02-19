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
import { getSetsInDateRange, getExercises, getUserSettings } from './storage';
import { startOfWeek, endOfWeek, subWeeks, format, addDays } from 'date-fns';

// Calculate volume (sets) per muscle group for a date range
export async function calculateVolumeForDateRange(
  startDate: Date,
  endDate: Date
): Promise<MuscleGroupVolume[]> {
  const sets = await getSetsInDateRange(startDate, endDate);
  const exercises = await getExercises();
  const settings = await getUserSettings();

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
    const exercise = exerciseMap.get(set.exerciseId);
    if (!exercise) return;

    // Get primary muscle groups (support both new array and deprecated single field)
    const primaryMuscleGroups = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
      ? exercise.primaryMuscleGroups
      : exercise.primaryMuscleGroup
      ? [exercise.primaryMuscleGroup]
      : [];

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
  const result: MuscleGroupVolume[] = ALL_TRACKABLE_MUSCLE_GROUPS.map(mg => ({
    muscleGroup: mg,
    sets: volumeMap.get(mg)?.sets || 0,
    target: settings.muscleGroupTargets[mg] || 0,
    exercises: Array.from(volumeMap.get(mg)?.exercises.values() || []),
  }));

  return result;
}

// Get weekly volume data
export async function getWeeklyVolume(weekStartDate: Date): Promise<WeeklyVolume> {
  const settings = await getUserSettings();

  // Adjust start of week based on user settings
  const dayOffset = settings.weekStartDay === 'sunday' ? 0 : 1;
  const weekStart = startOfWeek(weekStartDate, { weekStartsOn: dayOffset as 0 | 1 });
  const weekEnd = endOfWeek(weekStartDate, { weekStartsOn: dayOffset as 0 | 1 });

  const muscleGroups = await calculateVolumeForDateRange(weekStart, weekEnd);

  // Calculate totals (only for muscle groups with targets > 0)
  const totalSets = muscleGroups
    .filter(mg => mg.target > 0)
    .reduce((sum, mg) => sum + mg.sets, 0);
  const targetSets = muscleGroups
    .filter(mg => mg.target > 0)
    .reduce((sum, mg) => sum + mg.target, 0);

  return {
    weekStart: format(weekStart, 'yyyy-MM-dd'),
    weekEnd: format(weekEnd, 'yyyy-MM-dd'),
    muscleGroups,
    totalSets,
    targetSets,
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

// Calculate projected weekly volume from a routine's scheduled templates
// Assumes 3 sets per exercise (standard working sets)
const SETS_PER_EXERCISE = 3;

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

  // Process each day in the routine
  routine.daySchedule.forEach(daySchedule => {
    if (!daySchedule.templateIds || daySchedule.templateIds.length === 0) return; // Rest day

    // Process each template for this day (supports multiple workouts per day)
    daySchedule.templateIds.forEach(templateId => {
      const template = templateMap.get(templateId);
      if (!template) return;

      // Process each exercise in the template
      template.exerciseIds.forEach(exerciseId => {
        const exercise = exerciseMap.get(exerciseId);
        if (!exercise) return;

        // Get primary muscle groups (support both new array and deprecated single field)
        const primaryMuscleGroups = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
          ? exercise.primaryMuscleGroups
          : exercise.primaryMuscleGroup
          ? [exercise.primaryMuscleGroup]
          : [];

        // Add projected sets to each primary muscle group
        primaryMuscleGroups.forEach(muscleGroup => {
          const volume = volumeMap.get(muscleGroup);

          if (volume) {
            volume.sets += SETS_PER_EXERCISE;

            const existingExercise = volume.exercises.get(exercise.id);
            if (existingExercise) {
              existingExercise.sets += SETS_PER_EXERCISE;
            } else {
              volume.exercises.set(exercise.id, {
                exerciseId: exercise.id,
                exerciseName: exercise.name,
                sets: SETS_PER_EXERCISE,
              });
            }
          }
        });
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
  const dayOfWeek = today.getDay(); // 0-6 (Sunday-Saturday)

  // Get current week's volume
  const currentWeekVolume = await getWeeklyVolume(today);

  // Build maps for quick lookups
  const exerciseMap = new Map<string, Exercise>(
    exercises.map(e => [e.id, e])
  );
  const templateMap = new Map<string, Template>(
    templates.map(t => [t.id, t])
  );

  // Calculate projected volume from remaining days in the week
  const projectedVolumeMap = new Map<PrimaryMuscleGroup, number>();
  ALL_TRACKABLE_MUSCLE_GROUPS.forEach(mg => projectedVolumeMap.set(mg, 0));

  if (routine) {
    // Get remaining days based on week start preference
    const weekStartsOn = userSettings.weekStartDay === 'sunday' ? 0 : 1;

    // Calculate which days remain in the week (including today)
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = addDays(today, dayOffset);
      const checkDayOfWeek = checkDate.getDay();

      // Check if we've passed the end of the week
      if (dayOffset > 0) {
        // For Monday start: week ends on Sunday (0)
        // For Sunday start: week ends on Saturday (6)
        if (checkDayOfWeek === weekStartsOn) break; // New week started
      }

      // Get templates for this day
      const daySchedule = routine.daySchedule.find(d => d.day === checkDayOfWeek);
      if (!daySchedule || daySchedule.templateIds.length === 0) continue;

      // Process each template
      daySchedule.templateIds.forEach(templateId => {
        const template = templateMap.get(templateId);
        if (!template) return;

        // Process each exercise
        template.exerciseIds.forEach(exerciseId => {
          const exercise = exerciseMap.get(exerciseId);
          if (!exercise) return;

          // Get primary muscle groups
          const primaryMuscleGroups = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
            ? exercise.primaryMuscleGroups
            : exercise.primaryMuscleGroup
            ? [exercise.primaryMuscleGroup]
            : [];

          // Add projected sets (3 sets per exercise is standard assumption)
          primaryMuscleGroups.forEach(mg => {
            const current = projectedVolumeMap.get(mg) || 0;
            projectedVolumeMap.set(mg, current + 3);
          });
        });
      });
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
