import { format } from 'date-fns';
import { WorkoutSet, Workout, TRAVEL_LOCATION_ID } from '../types';
import { getSetsByExerciseId, getWorkouts, getLocations } from './storage';
import {
  buildLocationResolver,
  classifyLocationMatch,
  logLocationLookup,
  LocationMatch,
} from './locationMatch';

export interface WorkoutSessionSets {
  workoutId: string;
  date: string;
  sets: WorkoutSet[];
  locationId?: string; // where the session happened ('travel' = Travel/Other)
}

export interface LastWorkoutForExercise {
  date: string;
  sets: WorkoutSet[];
  // The location the returned sets were performed at (undefined for legacy workouts
  // recorded before locationId existed).
  fromLocationId?: string;
  // How the returned session relates to the gym we're at:
  //   'same'      → performed here (or no gym context was requested)
  //   'different' → provably performed elsewhere; safe to say "first time here"
  //   'unknown'   → at least one past session has no location recorded, so we
  //                 cannot claim this is the first time here. Callers must fall
  //                 back to a neutral "Last time" label.
  locationMatch: LocationMatch;
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

  // Resolve every workout's location through the canonical matcher so id casing,
  // stray whitespace and name-instead-of-id records all compare correctly.
  const [workouts, locations] = await Promise.all([getWorkouts(), getLocations()]);
  const resolver = buildLocationResolver(workouts, locations);
  const target = resolver.canonical(preferLocationId);

  // Travel/Other sessions never feed weight suggestions — hotel-gym dumbbell
  // weights shouldn't overwrite regular-gym history. (They still appear in the
  // exercise history screen, which uses getExerciseHistory, not this function.)
  const nonTravelSets = sortedSets.filter(
    s => resolver.forWorkout(s.workoutId) !== TRAVEL_LOCATION_ID
  );
  if (nonTravelSets.length === 0) {
    // Only-ever-done-while-traveling edge case: fall back to travel history
    // rather than returning nothing.
    const lastWorkoutId = sortedSets[0].workoutId;
    const lastWorkoutSets = sortedSets.filter(s => s.workoutId === lastWorkoutId);
    return {
      date: lastWorkoutSets[0].loggedAt,
      sets: lastWorkoutSets,
      fromLocationId: TRAVEL_LOCATION_ID,
      locationMatch: target === TRAVEL_LOCATION_ID ? 'same' : 'different',
    };
  }

  logLocationLookup(
    `lastWorkout exercise=${exerciseId}`,
    preferLocationId,
    [...new Set(nonTravelSets.map(s => s.workoutId))],
    resolver,
  );

  // Prefer the most recent session at the requested location; fall back to the most
  // recent session anywhere when the exercise has never been done there.
  // When AT the travel gym, we intentionally skip same-location matching so the
  // user sees their regular-gym numbers as the reference.
  let pool = nonTravelSets;
  let locationMatch: LocationMatch = 'same';
  if (target === TRAVEL_LOCATION_ID) {
    locationMatch = 'different'; // reference weights are from a regular gym
  } else if (target) {
    const sameLocation = nonTravelSets.filter(
      s => resolver.forWorkout(s.workoutId) === target
    );
    if (sameLocation.length > 0) {
      pool = sameLocation;
      locationMatch = 'same';
    } else {
      // No match here — but only say so when every past session has a KNOWN
      // location. Any location-less session means this exercise may well have
      // been done here before we started recording gyms.
      locationMatch = classifyLocationMatch(
        nonTravelSets.map(s => s.workoutId),
        preferLocationId,
        resolver,
      );
    }
  }

  // Get the most recent workout ID from the chosen pool
  const lastWorkoutId = pool[0].workoutId;

  // Get all sets from that workout
  const lastWorkoutSets = pool.filter(s => s.workoutId === lastWorkoutId);

  return {
    date: lastWorkoutSets[0].loggedAt,
    sets: lastWorkoutSets,
    fromLocationId: resolver.forWorkout(lastWorkoutId),
    locationMatch,
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

  // Location per workout (so travel sessions can be tagged in the UI), canonicalized
  // so the history screen labels agree with the per-gym matching everywhere else.
  const [workouts, locations] = await Promise.all([getWorkouts(), getLocations()]);
  const resolver = buildLocationResolver(workouts, locations);

  // Convert to array of workout sessions
  const sessions: WorkoutSessionSets[] = [];
  for (const [workoutId, workoutSets] of workoutMap) {
    sessions.push({
      workoutId,
      date: workoutSets[0].loggedAt,
      sets: workoutSets,
      locationId: resolver.forWorkout(workoutId),
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
