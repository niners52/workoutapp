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
  // The location the returned sets were performed at (undefined for legacy workouts
  // recorded before locationId existed).
  fromLocationId?: string;
  // True when the returned session is at the requested location (or when no specific
  // location was requested). False signals "first time at this gym — here's elsewhere".
  isSameLocation: boolean;
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
 * Get the last workout for a given exercise (completed or not)
 * Returns the date and all sets from that workout
 * Note: Changed from getSetsByExerciseIdCompleted to getSetsByExerciseId
 * to show history from all workouts, not just completed ones.
 * Users need to see their last session's data for progressive overload.
 */
export async function getLastWorkoutForExercise(
  exerciseId: string,
  excludeWorkoutIds?: Set<string>,
  preferLocationId?: string,
): Promise<LastWorkoutForExercise | null> {
  let sets = await getSetsByExerciseId(exerciseId);

  // Optionally exclude sets from deload (or other) workouts
  if (excludeWorkoutIds && excludeWorkoutIds.size > 0) {
    sets = sets.filter(s => !excludeWorkoutIds.has(s.workoutId));
  }

  if (sets.length === 0) return null;

  // Sort by loggedAt descending
  const sortedSets = sets.sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
  );

  // Map workoutId -> locationId so we can prefer same-location history.
  const workouts = await getWorkouts();
  const locationByWorkoutId = new Map(workouts.map(w => [w.id, w.locationId]));

  // Prefer the most recent session at the requested location; fall back to the most
  // recent session anywhere when the exercise has never been done there.
  let pool = sortedSets;
  let isSameLocation = true;
  if (preferLocationId) {
    const sameLocation = sortedSets.filter(
      s => locationByWorkoutId.get(s.workoutId) === preferLocationId
    );
    if (sameLocation.length > 0) {
      pool = sameLocation;
      isSameLocation = true;
    } else {
      isSameLocation = false; // showing history from a different gym
    }
  }

  // Get the most recent workout ID from the chosen pool
  const lastWorkoutId = pool[0].workoutId;

  // Get all sets from that workout
  const lastWorkoutSets = pool.filter(s => s.workoutId === lastWorkoutId);

  return {
    date: lastWorkoutSets[0].loggedAt,
    sets: lastWorkoutSets,
    fromLocationId: locationByWorkoutId.get(lastWorkoutId),
    isSameLocation,
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
