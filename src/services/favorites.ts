import { startOfWeek } from 'date-fns';
import { Exercise, WorkoutSet, WeekStartDay } from '../types';

/**
 * Favorites are the user's must-do exercises. They drive three things beyond the
 * star itself: the Favorites filter in every picker, the routine builder's
 * coverage check ("did I get all 8 in before saving?"), and the weekly
 * not-yet-hit list on the home screen.
 */

export function getFavoriteExercises(exercises: Exercise[]): Exercise[] {
  return exercises
    .filter(e => e.isFavorite)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function countFavorites(exercises: Exercise[]): number {
  return exercises.reduce((n, e) => (e.isFavorite ? n + 1 : n), 0);
}

export interface FavoritesCoverage {
  total: number;
  includedCount: number;
  included: Exercise[];
  missing: Exercise[];
}

/**
 * Which favorites appear in a set of exercise ids (a routine, a template, a
 * planned week). `exerciseIds` may contain duplicates and unknown ids.
 */
export function getFavoritesCoverage(
  exercises: Exercise[],
  exerciseIds: Iterable<string>,
): FavoritesCoverage {
  const favorites = getFavoriteExercises(exercises);
  const present = new Set(exerciseIds);
  const included = favorites.filter(f => present.has(f.id));
  const missing = favorites.filter(f => !present.has(f.id));
  return {
    total: favorites.length,
    includedCount: included.length,
    included,
    missing,
  };
}

/**
 * Favorites with no logged set since the start of the current training week.
 *
 * Uses the user's configured week start so it lines up with the weekly grid and
 * volume targets rather than assuming Sunday.
 */
export function getFavoritesNotHitThisWeek(
  exercises: Exercise[],
  sets: WorkoutSet[],
  weekStartDay: WeekStartDay = 'monday',
): Exercise[] {
  const favorites = getFavoriteExercises(exercises);
  if (favorites.length === 0) return [];

  const weekStart = startOfWeek(new Date(), {
    weekStartsOn: weekStartDay === 'monday' ? 1 : 0,
  });

  const hitThisWeek = new Set<string>();
  for (const set of sets) {
    const logged = new Date(set.loggedAt);
    if (Number.isFinite(logged.getTime()) && logged >= weekStart) {
      hitThisWeek.add(set.exerciseId);
    }
  }

  return favorites.filter(f => !hitThisWeek.has(f.id));
}

/**
 * Human-readable coverage line for the routine builder, e.g.
 * "Favorites: 6 of 8 included · Missing: Cable Face Pull, Hammer Curl".
 * Returns null when the user has no favorites (nothing to report).
 */
export function formatFavoritesCoverage(coverage: FavoritesCoverage): string | null {
  if (coverage.total === 0) return null;
  const head = `Favorites: ${coverage.includedCount} of ${coverage.total} included`;
  if (coverage.missing.length === 0) return `${head} · All in`;
  return `${head} · Missing: ${coverage.missing.map(e => e.name).join(', ')}`;
}
