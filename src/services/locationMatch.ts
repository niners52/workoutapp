import { Workout, WorkoutLocation, TRAVEL_LOCATION_ID, TRAVEL_LOCATION } from '../types';

/**
 * Canonical location matching for per-gym history.
 *
 * Why this exists: `Workout.locationId` is optional and has been written by several
 * code paths over time (template default, quick-start inheritance, manual picker,
 * cloud pull). That left three failure modes behind, all of which showed up as a
 * bogus "First time here" while mid-workout at a gym the user visits weekly:
 *
 *   1. Legacy/unsynced workouts carry NO location at all. Comparing `undefined`
 *      against the active gym's id yields "not a match", which the UI read as
 *      "different gym" — a claim the data does not support.
 *   2. Casing / whitespace drift on ids ('Planet Fitness' vs 'planet fitness').
 *   3. A few records store the location NAME where an id was expected.
 *
 * Everything that answers "did this happen at this gym?" must go through here so
 * the answer is identical for weight pre-fill, the "last time" label, swap history,
 * coach comparisons, and fatigue trends.
 */

/**
 * Three-state answer. `unknown` is the important one: it means we cannot prove
 * the reference session happened somewhere else, so callers must NOT claim
 * "first time at this gym".
 */
export type LocationMatch = 'same' | 'different' | 'unknown';

export interface LocationResolver {
  /** Canonical location id for a workout, or undefined when none was recorded. */
  forWorkout: (workoutId: string) => string | undefined;
  /** Canonicalize any raw location value (id, differently-cased id, or name). */
  canonical: (raw: string | undefined | null) => string | undefined;
  /** True when the workout has no usable location recorded. */
  isUnknown: (workoutId: string) => boolean;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Build a resolver that maps raw stored location values onto canonical location ids.
 *
 * `locations` is the user's location list; it is optional so callers that only have
 * workouts still get id-level normalization (trim + case folding).
 */
export function buildLocationResolver(
  workouts: Workout[],
  locations: WorkoutLocation[] = [],
): LocationResolver {
  // Lookup tables built once per resolver: normalized id -> canonical id, and
  // normalized name -> canonical id (for records that stored a name by mistake).
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const loc of [...locations, TRAVEL_LOCATION]) {
    byId.set(normalize(loc.id), loc.id);
    // First writer wins so a user-created "Gym" can't shadow the built-in 'gym'.
    const nameKey = normalize(loc.name);
    if (!byName.has(nameKey)) byName.set(nameKey, loc.id);
  }

  const canonical = (raw: string | undefined | null): string | undefined => {
    if (raw === undefined || raw === null) return undefined;
    const trimmed = String(raw).trim();
    if (trimmed === '') return undefined;
    const key = normalize(trimmed);
    return byId.get(key) ?? byName.get(key) ?? trimmed;
  };

  const canonicalByWorkoutId = new Map<string, string | undefined>();
  for (const w of workouts) {
    canonicalByWorkoutId.set(w.id, canonical(w.locationId));
  }

  return {
    forWorkout: (workoutId: string) => canonicalByWorkoutId.get(workoutId),
    canonical,
    // A workout we've never heard of is also "unknown" — safer than asserting.
    isUnknown: (workoutId: string) => canonicalByWorkoutId.get(workoutId) === undefined,
  };
}

/**
 * Classify a set of candidate sessions against the gym we're currently at.
 *
 * The conservative rule: only report `different` when EVERY candidate has a known
 * location and none of them is here. A single location-less session means the
 * exercise may well have been done here before, so we report `unknown` and callers
 * fall back to a neutral "Last time" label instead of "First time here".
 */
export function classifyLocationMatch(
  candidateWorkoutIds: Iterable<string>,
  preferLocationId: string | undefined,
  resolver: LocationResolver,
): LocationMatch {
  if (!preferLocationId) return 'same'; // no gym context requested — nothing to contradict

  const target = resolver.canonical(preferLocationId);
  if (!target) return 'unknown';

  let sawUnknown = false;
  for (const workoutId of candidateWorkoutIds) {
    const loc = resolver.forWorkout(workoutId);
    if (loc === undefined) sawUnknown = true;
    else if (loc === target) return 'same';
  }
  return sawUnknown ? 'unknown' : 'different';
}

/** True when the id refers to the built-in Travel/Other pseudo-location. */
export function isTravelLocation(
  raw: string | undefined,
  resolver: LocationResolver,
): boolean {
  return resolver.canonical(raw) === TRAVEL_LOCATION_ID;
}

/**
 * Dev-only diagnostic for the per-gym lookup. Prints the location the query asked
 * for next to what is actually stored on the candidate workouts, which is how the
 * three failure modes above get identified from a device log.
 */
export function logLocationLookup(
  label: string,
  preferLocationId: string | undefined,
  candidateWorkoutIds: string[],
  resolver: LocationResolver,
): void {
  if (!__DEV__) return;
  const seen = candidateWorkoutIds.slice(0, 10).map(id => ({
    workoutId: id,
    stored: resolver.forWorkout(id) ?? '(none)',
  }));
  console.log(
    `[locationMatch] ${label} wants=${resolver.canonical(preferLocationId) ?? '(none)'}`,
    seen,
  );
}
