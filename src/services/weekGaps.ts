/**
 * What is actually still owed this week, counted by muscle group.
 *
 * The old list named exercises, which made a swap look like a miss: trading
 * one curl for another left "Preacher Curl" sitting on the list although
 * biceps were done. Gaps are counted against the weekly target instead, so a
 * substitution closes the gap and only skipping the muscle leaves one open.
 *
 * Counting comes from computeWeeklyVolume, which already applies the rules:
 * primary groups only, unilateral at half, warm-up and deload sets left out.
 * Nothing here recounts sets.
 */
import { differenceInCalendarDays } from 'date-fns';
import {
  MUSCLE_GROUP_DISPLAY_NAMES,
  type Exercise,
  type MuscleGroupVolume,
  type WeekStartDay,
  type WorkoutSet,
} from '../types';
import { creditedPrimaries } from './muscleGroups';
import { isWarmupSet } from './warmupSets';
import { weekStartFor } from './weekProgress';

export interface GapSuggestion {
  exerciseId: string;
  name: string;
}

export interface MuscleGap {
  muscleGroup: string;
  label: string;
  target: number;
  completed: number;
  /** Sets still owed. Always > 0 unless the group is pinned as a focus group. */
  remaining: number;
  /** A focus group: shown whatever its gap, and kept at the top. */
  pinned: boolean;
  /** Labels of the days still to come this week whose plan trains this group. */
  coveredBy: string[];
  /** Against an even spread over the week, counting today. */
  pace: 'on' | 'behind';
  suggestions: GapSuggestion[];
}

export interface WeekGapsView {
  /** Days counted so far this week, today included (1-7). */
  daysElapsed: number;
  /** Days left this week that have something planned. */
  upcomingDays: string[];
  /** Gaps the remaining planned days will train. */
  covered: MuscleGap[];
  /** Gaps nothing planned covers — the answer to "what do I do tonight". */
  uncovered: MuscleGap[];
  /** Everything, biggest gap first, focus groups ahead of the rest. */
  all: MuscleGap[];
  /** Targets are suspended, so nothing is behind. */
  deload: boolean;
}

export interface WeekGapsInput {
  /** From computeWeeklyVolume(...).muscleGroups for the current week. */
  volume: MuscleGroupVolume[];
  /** Days still to come this week, in order, with what their templates ask for. */
  upcoming: Array<{ dayLabel: string; exerciseIds: string[] }>;
  exercises: Exercise[];
  /** Full history: only the last four weeks are read, for ranking suggestions. */
  sets: WorkoutSet[];
  /** Muscle groups pinned on the dashboard; they appear even at zero gap. */
  focusMuscleGroups?: string[];
  /** Where the user is training now — an exercise tagged for it ranks higher. */
  locationId?: string;
  weekStartDay: WeekStartDay;
  now?: Date;
  deload?: boolean;
  /** How many exercises to name per gap. */
  suggestionsPerGap?: number;
}

const RECENT_DAYS = 28;

export function weekGaps({
  volume,
  upcoming,
  exercises,
  sets,
  focusMuscleGroups = [],
  locationId,
  weekStartDay,
  now = new Date(),
  deload = false,
  suggestionsPerGap = 2,
}: WeekGapsInput): WeekGapsView {
  const daysElapsed = Math.min(7, differenceInCalendarDays(now, weekStartFor(weekStartDay, now)) + 1);
  const byId = new Map(exercises.map(e => [e.id, e]));
  const focus = new Set(focusMuscleGroups);
  const names = MUSCLE_GROUP_DISPLAY_NAMES as Record<string, string>;

  // Which groups each upcoming day trains, and which exercises it already asks for.
  const plannedExerciseIds = new Set(upcoming.flatMap(d => d.exerciseIds));
  const coverage = new Map<string, string[]>();
  for (const day of upcoming) {
    for (const group of groupsTrainedBy(day.exerciseIds, byId)) {
      coverage.set(group, [...(coverage.get(group) ?? []), day.dayLabel]);
    }
  }

  const recent = recentUseByExercise(sets, byId, now);

  const gaps = volume
    .filter(mg => mg.target > 0)
    .map(mg => {
      const remaining = round1(mg.target - mg.sets);
      const pinned = focus.has(mg.muscleGroup);
      return {
        muscleGroup: mg.muscleGroup as string,
        label: names[mg.muscleGroup] ?? mg.muscleGroup,
        target: mg.target,
        completed: round1(mg.sets),
        remaining: Math.max(0, remaining),
        pinned,
        coveredBy: coverage.get(mg.muscleGroup) ?? [],
        pace: deload || mg.sets >= (mg.target * daysElapsed) / 7 ? ('on' as const) : ('behind' as const),
        suggestions: suggestFor(mg.muscleGroup, { byId, plannedExerciseIds, locationId, recent, limit: suggestionsPerGap }),
      };
    })
    .filter(g => g.remaining > 0 || g.pinned)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.remaining - a.remaining || a.label.localeCompare(b.label));

  return {
    daysElapsed,
    upcomingDays: upcoming.filter(d => d.exerciseIds.length > 0).map(d => d.dayLabel),
    covered: gaps.filter(g => g.remaining > 0 && g.coveredBy.length > 0),
    uncovered: gaps.filter(g => g.remaining > 0 && g.coveredBy.length === 0),
    all: gaps,
    deload,
  };
}

function groupsTrainedBy(exerciseIds: string[], byId: Map<string, Exercise>): Set<string> {
  const out = new Set<string>();
  for (const id of exerciseIds) {
    const exercise = byId.get(id);
    if (!exercise || exercise.defaultWarmup) continue;
    for (const group of creditedPrimaries(exercise.primaryMuscleGroups ?? [])) out.add(group);
  }
  return out;
}

/** Working sets per exercise over the last four weeks — how familiar a lift is. */
function recentUseByExercise(sets: WorkoutSet[], byId: Map<string, Exercise>, now: Date): Map<string, number> {
  const out = new Map<string, number>();
  for (const set of sets) {
    const logged = new Date(set.loggedAt);
    if (!Number.isFinite(logged.getTime())) continue;
    if (differenceInCalendarDays(now, logged) > RECENT_DAYS || logged > now) continue;
    if (isWarmupSet(set, byId.get(set.exerciseId))) continue;
    out.set(set.exerciseId, (out.get(set.exerciseId) ?? 0) + 1);
  }
  return out;
}

interface SuggestContext {
  byId: Map<string, Exercise>;
  plannedExerciseIds: Set<string>;
  locationId?: string;
  recent: Map<string, number>;
  limit: number;
}

/**
 * What to do for a gap: something this week already plans first, then what the
 * gym the user is standing in has, then what they actually train often.
 */
function suggestFor(muscleGroup: string, { byId, plannedExerciseIds, locationId, recent, limit }: SuggestContext): GapSuggestion[] {
  const scored = [...byId.values()]
    .filter(e => !e.defaultWarmup && (creditedPrimaries(e.primaryMuscleGroups ?? []) as string[]).includes(muscleGroup))
    .map(e => ({
      exercise: e,
      score:
        (plannedExerciseIds.has(e.id) ? 1_000_000 : 0) +
        (availableAt(e, locationId) ? 10_000 : 0) +
        Math.min(9_999, recent.get(e.id) ?? 0),
    }))
    .filter(s => s.score > 0) // never suggest a lift that is unplanned, elsewhere and unused
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));

  return scored.slice(0, limit).map(s => ({ exerciseId: s.exercise.id, name: s.exercise.name }));
}

function availableAt(exercise: Exercise, locationId?: string): boolean {
  if (!locationId) return true;
  const tagged = exercise.locationIds ?? [];
  return tagged.length === 0 || tagged.includes(locationId);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "chest 9, lats 6" — the compact form used for the covered line. */
export function summarizeGaps(gaps: MuscleGap[]): string {
  return gaps.map(g => `${g.label.toLowerCase()} ${formatSets(g.remaining)}`).join(', ');
}

export function formatSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
