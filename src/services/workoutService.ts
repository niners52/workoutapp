import { format } from 'date-fns';
import { WorkoutSet, Workout } from '../types';
import { getSetsByExerciseId, getWorkouts } from './storage';

export interface WorkoutSessionSets {
  workoutId: string;
  date: string;
  sets: WorkoutSet[];
}

export interface LastWorkoutForExercise {
  date: string;
  sets: WorkoutSet[];
}

/**
 * Get all sets for a given exercise, filtering out incomplete workouts
 */
export async function getSetsByExerciseIdCompleted(
  exerciseId: string
): Promise<WorkoutSet[]> {
  const sets = await getSetsByExerciseId(exerciseId);
  const workouts = await getWorkouts();

  // Create a map of completed workout IDs
  const completedWorkoutIds = new Set(
    workouts
      .filter(w => w.completedAt !== null)
      .map(w => w.id)
  );

  // Filter sets to only include those from completed workouts
  return sets.filter(set => completedWorkoutIds.has(set.workoutId));
}

/**
 * Get the last completed workout for a given exercise
 * Returns the date and all sets from that workout
 */
export async function getLastWorkoutForExercise(
  exerciseId: string
): Promise<LastWorkoutForExercise | null> {
  const sets = await getSetsByExerciseIdCompleted(exerciseId);

  if (sets.length === 0) return null;

  // Sort by loggedAt descending
  const sortedSets = sets.sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
  );

  // Get the most recent workout ID
  const lastWorkoutId = sortedSets[0].workoutId;

  // Get all sets from that workout
  const lastWorkoutSets = sortedSets.filter(s => s.workoutId === lastWorkoutId);

  return {
    date: lastWorkoutSets[0].loggedAt,
    sets: lastWorkoutSets,
  };
}

/**
 * Get full history for an exercise, grouped by workout session
 * Most recent sessions first
 */
export async function getExerciseHistory(
  exerciseId: string
): Promise<WorkoutSessionSets[]> {
  const sets = await getSetsByExerciseIdCompleted(exerciseId);

  if (sets.length === 0) return [];

  // Sort by loggedAt descending
  const sortedSets = sets.sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
  );

  // Group by workout ID
  const workoutMap = new Map<string, WorkoutSet[]>();
  for (const set of sortedSets) {
    if (!workoutMap.has(set.workoutId)) {
      workoutMap.set(set.workoutId, []);
    }
    workoutMap.get(set.workoutId)!.push(set);
  }

  // Convert to array of workout sessions
  const sessions: WorkoutSessionSets[] = [];
  for (const [workoutId, workoutSets] of workoutMap) {
    sessions.push({
      workoutId,
      date: workoutSets[0].loggedAt,
      sets: workoutSets,
    });
  }

  // Sort sessions by date descending (most recent first)
  return sessions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/**
 * Get max weight ever lifted for an exercise
 */
export async function getMaxWeightForExercise(
  exerciseId: string
): Promise<number> {
  const sets = await getSetsByExerciseIdCompleted(exerciseId);
  if (sets.length === 0) return 0;
  return Math.max(...sets.map(s => s.weight));
}
