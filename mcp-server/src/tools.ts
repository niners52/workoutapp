/**
 * Tool implementations. Each function takes validated input and returns a plain
 * JSON-serialisable object; server.ts wraps them for MCP.
 */
import { Db, type ExerciseRow, type SetRow, type SetSummaryRow, type WorkoutRow } from './db.js';
import { rankMatches } from './fuzzy.js';
import {
  ANALYTICS_CATEGORIES,
  PRIMARY_MUSCLE_GROUPS,
  emptyMuscleTotals,
  isPrimaryMuscleGroup,
  rollUpCategories,
  round1,
  setCredit,
  type PrimaryMuscleGroup,
} from './muscles.js';
import { lowerBoundIso, recentWeekStarts, weekEndKey, weekStartKey, type WeekStartDay } from './dates.js';

export interface ToolContext {
  db: Db;
  timeZone: string;
  now?: () => Date;
}

export class ToolError extends Error {}

// ─── formulas ───────────────────────────────────────────────────────────────

/** Epley: weight × (1 + reps / 30). Returns the weight itself for a single. */
export function epley1RM(weightLbs: number, reps: number): number {
  if (reps <= 1) return weightLbs;
  return round1(weightLbs * (1 + reps / 30));
}

/**
 * Brzycki, exactly as the app computes it (src/services/units.ts estimated1RM),
 * so numbers here can be checked against the app's PR screen.
 */
export function brzycki1RM(weightLbs: number, reps: number): number {
  if (reps <= 0 || reps > 36) return weightLbs;
  if (reps === 1) return weightLbs;
  return Math.round(weightLbs * (36 / (37 - reps)));
}

// ─── shared shaping ─────────────────────────────────────────────────────────

function exerciseSummary(e: ExerciseRow) {
  return {
    id: e.id,
    name: e.name,
    base_name: e.base_name ?? undefined,
    equipment: e.equipment ?? undefined,
    primary_muscle_groups: e.primary_muscle_groups ?? [],
    secondary_muscle_groups: e.secondary_muscle_groups ?? [],
    is_favorite: e.is_favorite ?? false,
    is_unilateral: e.is_unilateral ?? false,
  };
}

function setView(s: SetRow | SetSummaryRow) {
  return { date: s.logged_at, weight_lbs: s.weight, reps: s.reps, workout_id: s.workout_id };
}

interface BestSets {
  heaviest_set: ReturnType<typeof setView> | null;
  best_e1rm_epley: (ReturnType<typeof setView> & { e1rm_lbs: number; e1rm_brzycki_app_lbs: number }) | null;
}

/** Mirrors the app's PR rules: only sets with weight > 0 and reps > 0 count. */
function bestSets(sets: SetSummaryRow[]): BestSets {
  let heaviest: SetSummaryRow | null = null;
  let bestE1rm: { set: SetSummaryRow; e1rm: number } | null = null;
  for (const s of sets) {
    if (!(s.weight > 0) || !(s.reps > 0)) continue;
    if (!heaviest || s.weight > heaviest.weight) heaviest = s;
    const e1rm = epley1RM(s.weight, s.reps);
    if (!bestE1rm || e1rm > bestE1rm.e1rm) bestE1rm = { set: s, e1rm };
  }
  return {
    heaviest_set: heaviest ? setView(heaviest) : null,
    best_e1rm_epley: bestE1rm
      ? {
          ...setView(bestE1rm.set),
          e1rm_lbs: bestE1rm.e1rm,
          e1rm_brzycki_app_lbs: brzycki1RM(bestE1rm.set.weight, bestE1rm.set.reps),
        }
      : null,
  };
}

function durationMinutes(w: WorkoutRow): number | undefined {
  if (!w.completed_at) return undefined;
  const ms = new Date(w.completed_at).getTime() - new Date(w.started_at).getTime();
  return ms > 0 ? Math.round(ms / 60_000) : undefined;
}

// ─── exercise resolution ────────────────────────────────────────────────────

const RESOLVE_MIN_SCORE = 0.5;

async function resolveExercise(db: Db, query: string) {
  const exercises = await db.listExercises();
  const ranked = rankMatches(query, exercises, { limit: 6, minScore: 0.2 });
  const top = ranked[0];
  if (!top || top.score < RESOLVE_MIN_SCORE) {
    const hint = ranked.length
      ? ` Closest names: ${ranked.map(r => JSON.stringify(r.item.name)).join(', ')}.`
      : '';
    throw new ToolError(
      `No exercise matches "${query}".${hint} Use search_exercises to find the canonical name.`,
    );
  }
  return {
    exercise: top.item,
    score: round1(top.score * 100) / 100,
    alternatives: ranked.slice(1).map(r => ({ id: r.item.id, name: r.item.name })),
  };
}

// ─── tools ──────────────────────────────────────────────────────────────────

export async function getRecentWorkouts(ctx: ToolContext, input: { limit: number }) {
  const workouts = await ctx.db.listRecentWorkouts(input.limit);
  if (workouts.length === 0) return { workouts: [] };

  const [sets, locations, exercises] = await Promise.all([
    ctx.db.listSetsByWorkoutIds(workouts.map(w => w.id)),
    ctx.db.listLocationsByIds(workouts.map(w => w.location_id).filter((id): id is string => !!id)),
    ctx.db.listExercises(),
  ]);
  const exerciseById = new Map(exercises.map(e => [e.id, e]));
  const locationById = new Map(locations.map(l => [l.id, l.name]));

  const setsByWorkout = new Map<string, SetRow[]>();
  for (const s of sets) {
    const list = setsByWorkout.get(s.workout_id) ?? [];
    list.push(s);
    setsByWorkout.set(s.workout_id, list);
  }

  return {
    workouts: workouts.map(w => {
      const wSets = (setsByWorkout.get(w.id) ?? []).sort((a, b) => a.logged_at.localeCompare(b.logged_at));
      const byExercise = new Map<string, SetRow[]>();
      for (const s of wSets) {
        const list = byExercise.get(s.exercise_id) ?? [];
        list.push(s);
        byExercise.set(s.exercise_id, list);
      }
      return {
        id: w.id,
        started_at: w.started_at,
        completed_at: w.completed_at ?? undefined,
        duration_min: durationMinutes(w),
        location: w.location_id ? locationById.get(w.location_id) ?? undefined : undefined,
        is_deload: w.is_deload ?? false,
        total_sets: wSets.length,
        exercises: [...byExercise.entries()].map(([exerciseId, exSets]) => {
          const ex = exerciseById.get(exerciseId);
          const top = exSets.reduce<SetRow | null>(
            (best, s) => (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best),
            null,
          );
          return {
            exercise_id: exerciseId,
            name: ex?.name ?? '(deleted exercise)',
            sets: exSets.length,
            top_set: top ? { weight_lbs: top.weight, reps: top.reps } : undefined,
          };
        }),
      };
    }),
  };
}

export async function getExerciseHistory(ctx: ToolContext, input: { exercise_name: string; limit: number }) {
  const { exercise, score, alternatives } = await resolveExercise(ctx.db, input.exercise_name);
  const [recent, all] = await Promise.all([
    ctx.db.listRecentSetsForExercise(exercise.id, input.limit),
    ctx.db.listAllSetsForExercise(exercise.id),
  ]);
  return {
    exercise: exerciseSummary(exercise),
    match_score: score,
    other_candidates: alternatives,
    total_sets: all.length,
    first_logged_at: all[0]?.logged_at,
    recent_sets: recent.map(setView),
    ...bestSets(all),
  };
}

export async function searchExercises(ctx: ToolContext, input: { query: string; limit: number }) {
  const exercises = await ctx.db.listExercises();
  const ranked = rankMatches(input.query, exercises, { limit: input.limit });
  const lastLogged = await ctx.db.lastLoggedAtByExercise(ranked.map(r => r.item.id));
  return {
    query: input.query,
    matches: ranked.map(r => ({
      ...exerciseSummary(r.item),
      score: round1(r.score * 100) / 100,
      last_logged_at: lastLogged.get(r.item.id),
    })),
    note: 'Pass `name` from a match as exercise_name to other tools.',
  };
}

export async function getWeeklyVolume(ctx: ToolContext, input: { weeks_back: number }) {
  const settings = await ctx.db.getUserSettings();
  const weekStartDay: WeekStartDay = settings?.week_start_day === 'monday' ? 'monday' : 'sunday';
  const now = (ctx.now ?? (() => new Date()))();
  const weekKeys = recentWeekStarts(now, input.weeks_back, ctx.timeZone, weekStartDay);
  const oldest = weekKeys[0];
  if (!oldest) return { weeks: [] };

  const sets = await ctx.db.listSetsSince(lowerBoundIso(oldest));
  const [workouts, exercises] = await Promise.all([
    ctx.db.listWorkoutsByIds(sets.map(s => s.workout_id)),
    ctx.db.listExercises(),
  ]);
  const deload = new Set(workouts.filter(w => w.is_deload).map(w => w.id));
  const exerciseById = new Map(exercises.map(e => [e.id, e]));

  const weeks = new Map<string, Record<PrimaryMuscleGroup, number>>();
  for (const k of weekKeys) weeks.set(k, emptyMuscleTotals());

  let skippedDeloadSets = 0;
  for (const s of sets) {
    const key = weekStartKey(new Date(s.logged_at), ctx.timeZone, weekStartDay);
    const totals = weeks.get(key);
    if (!totals) continue; // outside the requested window (e.g. the padding day)
    if (deload.has(s.workout_id)) {
      skippedDeloadSets++;
      continue;
    }
    const ex = exerciseById.get(s.exercise_id);
    if (!ex) continue;
    const credit = setCredit(ex.is_unilateral);
    for (const mg of ex.primary_muscle_groups ?? []) {
      if (isPrimaryMuscleGroup(mg)) totals[mg] += credit;
    }
  }

  const rawTargets = settings?.muscle_group_targets ?? {};
  const targets: Partial<Record<PrimaryMuscleGroup, number>> = {};
  for (const mg of PRIMARY_MUSCLE_GROUPS) {
    const t = rawTargets[mg];
    if (typeof t === 'number' && t > 0) targets[mg] = t;
  }
  const targetTotal = Object.values(targets).reduce((a, b) => a + (b ?? 0), 0);

  return {
    time_zone: ctx.timeZone,
    week_start_day: weekStartDay,
    counting_rules:
      'Primary muscle groups only (each primary gets full credit per set); unilateral exercises count 0.5 per set; deload workouts excluded; bucketed by set logged_at. Matches the app\'s Weekly Volume panel.',
    weekly_targets: targets,
    categories: Object.fromEntries(ANALYTICS_CATEGORIES.map(c => [c.category, c.muscleGroups])),
    weeks: weekKeys.map(key => {
      const totals = weeks.get(key)!;
      const rounded = Object.fromEntries(
        PRIMARY_MUSCLE_GROUPS.map(mg => [mg, round1(totals[mg])]),
      ) as Record<PrimaryMuscleGroup, number>;
      const targeted = PRIMARY_MUSCLE_GROUPS.filter(mg => targets[mg]);
      return {
        week_start: key,
        week_end: weekEndKey(key),
        total_sets: round1(targeted.reduce((sum, mg) => sum + totals[mg], 0)),
        target_sets: targetTotal,
        sets_by_muscle_group: rounded,
        sets_by_category: rollUpCategories(totals),
      };
    }),
    skipped_deload_sets: skippedDeloadSets,
  };
}

export async function getPrs(ctx: ToolContext, input: { limit: number }) {
  const [sets, exercises] = await Promise.all([ctx.db.listAllSets(), ctx.db.listExercises()]);
  const byExercise = new Map<string, SetSummaryRow[]>();
  for (const s of sets) {
    const list = byExercise.get(s.exercise_id) ?? [];
    list.push(s);
    byExercise.set(s.exercise_id, list);
  }
  const prs = exercises
    .filter(e => byExercise.has(e.id))
    .map(e => {
      const exSets = byExercise.get(e.id)!;
      return {
        exercise_id: e.id,
        name: e.name,
        primary_muscle_groups: e.primary_muscle_groups ?? [],
        total_sets: exSets.length,
        ...bestSets(exSets),
      };
    })
    .filter(p => p.heaviest_set !== null)
    .sort((a, b) => (b.best_e1rm_epley?.e1rm_lbs ?? 0) - (a.best_e1rm_epley?.e1rm_lbs ?? 0));
  return {
    exercise_count: prs.length,
    truncated: prs.length > input.limit,
    prs: prs.slice(0, input.limit),
  };
}

export async function getBodyWeightLog(ctx: ToolContext, input: { limit: number }) {
  const rows = await ctx.db.listBodyWeights(input.limit);
  return {
    entries: rows.map(r => ({
      date: r.date,
      weight_lbs: r.weight,
      body_fat_percentage: r.body_fat_percentage ?? undefined,
      source: r.source ?? 'manual',
    })),
  };
}

export async function getFavoriteExercises(ctx: ToolContext) {
  const exercises = await ctx.db.listExercises();
  return { favorites: exercises.filter(e => e.is_favorite).map(exerciseSummary) };
}
