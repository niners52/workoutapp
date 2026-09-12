/**
 * Tool implementations. Each function takes validated input and returns a plain
 * JSON-serialisable object; server.ts wraps them for MCP.
 */
import {
  Db,
  missingColumns,
  type BodyMeasurementRow,
  type ExerciseRow,
  type NutritionDayRow,
  type SchemaDescription,
  type SetRow,
  type SetSummaryRow,
  type WorkoutRow,
} from './db.js';
import { rankMatches } from './fuzzy.js';
import {
  ANALYTICS_CATEGORIES,
  PRIMARY_MUSCLE_GROUPS,
  canonicalMuscleGroup,
  emptyMuscleTotals,
  rollUpCategories,
  round1,
  setCredit,
  type PrimaryMuscleGroup,
} from './muscles.js';
import { addDays, lowerBoundIso, recentWeekStarts, toLocalDate, weekEndKey, weekStartKey, ymd, type WeekStartDay } from './dates.js';

export interface ToolContext {
  db: Db;
  timeZone: string;
  now?: () => Date;
  /** Live table/column listing; absent in unit tests. */
  describeSchema?: () => Promise<SchemaDescription>;
}

export class ToolError extends Error {}

/** A session whose last set is older than this is treated as abandoned, not ongoing. */
export const STALE_SESSION_MS = 3 * 60 * 60 * 1000;

/**
 * One-rep-max formulas stop being estimates past this many reps (Brzycki is
 * undefined past 36; Epley extrapolates without limit). Both are applied only
 * to sets at or below it, and PR ranking falls back to heaviest load otherwise.
 */
export const E1RM_MAX_REPS = 15;
/** @deprecated use E1RM_MAX_REPS */
export const BRZYCKI_MAX_REPS = E1RM_MAX_REPS;

// ─── formulas ───────────────────────────────────────────────────────────────

/** Epley: weight × (1 + reps / 30). Returns the weight itself for a single. */
export function epley1RM(weightLbs: number, reps: number): number {
  if (reps <= 1) return weightLbs;
  return round1(weightLbs * (1 + reps / 30));
}

/**
 * Brzycki as the app computes it (src/services/units.ts estimated1RM), so numbers
 * can be checked against the app's PR screen. Returns null above BRZYCKI_MAX_REPS
 * rather than the app's raw-weight fallback, which is not an estimate.
 */
export function brzycki1RM(weightLbs: number, reps: number): number | null {
  if (reps <= 0 || reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return weightLbs;
  return Math.round(weightLbs * (36 / (37 - reps)));
}

// ─── body weight ────────────────────────────────────────────────────────────

/** Newest-first weight log with a lookup for "what did I weigh on this date". */
export class BodyWeightLog {
  private readonly entries: Array<{ date: string; weight: number }>;

  constructor(rows: BodyMeasurementRow[]) {
    this.entries = rows
      .filter(r => typeof r.weight === 'number' && r.weight > 0)
      .map(r => ({ date: r.date, weight: r.weight as number }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  get latest(): number | null {
    return this.entries[0]?.weight ?? null;
  }

  /** Weight on or before the given ISO instant; falls back to the most recent entry. */
  asOf(iso: string): number | null {
    const day = iso.slice(0, 10);
    const hit = this.entries.find(e => e.date <= day);
    return hit?.weight ?? this.latest;
  }

  get isEmpty(): boolean {
    return this.entries.length === 0;
  }
}

export function isBodyweightExercise(e: ExerciseRow): boolean {
  if (typeof e.is_bodyweight === 'boolean') return e.is_bodyweight;
  return e.equipment === 'bodyweight';
}

// ─── shared shaping ─────────────────────────────────────────────────────────

function exerciseSummary(e: ExerciseRow) {
  return {
    id: e.id,
    name: e.name,
    base_name: e.base_name ?? undefined,
    equipment: e.equipment ?? undefined,
    primary_muscle_groups: (e.primary_muscle_groups ?? []).map(m => canonicalMuscleGroup(m) ?? m),
    secondary_muscle_groups: (e.secondary_muscle_groups ?? []).map(m => canonicalMuscleGroup(m) ?? m),
    is_favorite: e.is_favorite ?? false,
    is_unilateral: e.is_unilateral ?? false,
    is_bodyweight: isBodyweightExercise(e),
  };
}

interface SetView {
  date: string;
  weight_lbs: number;
  reps: number;
  workout_id: string;
  /** Bodyweight exercises only: body weight on that date and the total load moved. */
  body_weight_lbs?: number;
  effective_load_lbs?: number;
  load_note?: '+BW';
}

/**
 * Load used for PR and e1RM math. For bodyweight exercises the stored weight is
 * the added load, so the body weight on that date is added at read time. Returns
 * null when a bodyweight exercise has no body-weight entry to draw on.
 */
function effectiveLoad(s: SetSummaryRow, bodyweight: boolean, bw: BodyWeightLog): number | null {
  if (!bodyweight) return s.weight;
  const body = bw.asOf(s.logged_at);
  return body === null ? null : round1(body + s.weight);
}

function setView(s: SetRow | SetSummaryRow, bodyweight = false, bw?: BodyWeightLog): SetView {
  const view: SetView = { date: s.logged_at, weight_lbs: s.weight, reps: s.reps, workout_id: s.workout_id };
  if (bodyweight && bw) {
    const body = bw.asOf(s.logged_at);
    if (body !== null) {
      view.body_weight_lbs = body;
      view.effective_load_lbs = round1(body + s.weight);
      view.load_note = '+BW';
    }
  }
  return view;
}

interface BestSets {
  heaviest_set: SetView | null;
  best_e1rm_epley: (SetView & { e1rm_lbs: number; e1rm_brzycki_app_lbs: number | null }) | null;
  /** Bodyweight exercise with no body-weight log: rank by reps instead. */
  most_reps_set?: SetView | null;
  load_basis: 'weight' | 'body_weight_plus_added' | 'reps_only';
}

/**
 * Mirrors the app's PR rules: sets need reps > 0, and weighted sets need weight > 0.
 * Bodyweight sets legitimately store weight 0 (no added load).
 */
function bestSets(sets: SetSummaryRow[], bodyweight: boolean, bw: BodyWeightLog): BestSets {
  const repsOnly = bodyweight && bw.isEmpty;
  let heaviest: { set: SetSummaryRow; load: number } | null = null;
  let bestE1rm: { set: SetSummaryRow; e1rm: number } | null = null;
  let mostReps: SetSummaryRow | null = null;

  for (const s of sets) {
    if (!(s.reps > 0)) continue;
    if (!bodyweight && !(s.weight > 0)) continue;
    if (!mostReps || s.reps > mostReps.reps) mostReps = s;
    const load = effectiveLoad(s, bodyweight, bw);
    if (load === null) continue;
    if (!heaviest || load > heaviest.load) heaviest = { set: s, load };
    if (s.reps > E1RM_MAX_REPS) continue; // a 28-rep set is endurance, not a 1RM estimate
    const e1rm = epley1RM(load, s.reps);
    if (!bestE1rm || e1rm > bestE1rm.e1rm) bestE1rm = { set: s, e1rm };
  }

  const bestLoad = bestE1rm ? effectiveLoad(bestE1rm.set, bodyweight, bw) : null;
  return {
    heaviest_set: heaviest ? setView(heaviest.set, bodyweight, bw) : null,
    best_e1rm_epley:
      bestE1rm && bestLoad !== null
        ? {
            ...setView(bestE1rm.set, bodyweight, bw),
            e1rm_lbs: bestE1rm.e1rm,
            e1rm_brzycki_app_lbs: brzycki1RM(bestLoad, bestE1rm.set.reps),
          }
        : null,
    ...(repsOnly ? { most_reps_set: mostReps ? setView(mostReps) : null } : {}),
    load_basis: repsOnly ? 'reps_only' : bodyweight ? 'body_weight_plus_added' : 'weight',
  };
}

interface DurationInfo {
  duration_min?: number;
  /** completed_at was set long after the last set; duration was measured to the last set instead. */
  duration_truncated_to_last_set?: true;
}

/**
 * Session length in minutes. A session that was "finished" hours after its last
 * set (phone left open, ended next morning) is measured to the last set, so a
 * forgotten session cannot report a 10-hour workout.
 */
function durationInfo(w: WorkoutRow, lastSetIso: string | undefined): DurationInfo {
  if (!w.completed_at) return {};
  const start = new Date(w.started_at).getTime();
  let end = new Date(w.completed_at).getTime();
  let truncated = false;
  if (lastSetIso) {
    const last = new Date(lastSetIso).getTime();
    if (end - last > STALE_SESSION_MS && last > start) {
      end = last;
      truncated = true;
    }
  }
  if (end <= start) return {};
  return { duration_min: Math.round((end - start) / 60_000), ...(truncated ? { duration_truncated_to_last_set: true } : {}) };
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

async function loadBodyWeights(db: Db): Promise<BodyWeightLog> {
  return new BodyWeightLog(await db.listAllBodyWeights());
}

/**
 * PRs for weighted exercises must not disappear because the body-weight table is
 * unreadable; bodyweight exercises then fall back to reps-only and the response
 * says why.
 */
async function loadBodyWeightsOrEmpty(db: Db): Promise<{ log: BodyWeightLog; error?: string }> {
  try {
    return { log: await loadBodyWeights(db) };
  } catch (err) {
    console.error('[body weights]', err instanceof Error ? err.message : err);
    return { log: new BodyWeightLog([]), error: err instanceof Error ? err.message : String(err) };
  }
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
        ...durationInfo(w, wSets.at(-1)?.logged_at),
        location: w.location_id ? locationById.get(w.location_id) : undefined,
        is_deload: w.is_deload ?? false,
        total_sets: wSets.length,
        exercises: [...byExercise.entries()].map(([exerciseId, exSets]) => {
          const ex = exerciseById.get(exerciseId);
          const top = exSets.reduce<SetRow | null>(
            (best, s) => (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best),
            null,
          );
          const bodyweight = ex ? isBodyweightExercise(ex) : false;
          return {
            exercise_id: exerciseId,
            name: ex?.name ?? '(deleted exercise)',
            sets: exSets.length,
            top_set: top ? { weight_lbs: top.weight, reps: top.reps, ...(bodyweight ? { load_note: '+BW' as const } : {}) } : undefined,
          };
        }),
      };
    }),
  };
}

export async function getExerciseHistory(ctx: ToolContext, input: { exercise_name: string; limit: number }) {
  const { exercise, score, alternatives } = await resolveExercise(ctx.db, input.exercise_name);
  const bodyweight = isBodyweightExercise(exercise);
  const [recent, all, { log: bw, error: bwError }] = await Promise.all([
    ctx.db.listRecentSetsForExercise(exercise.id, input.limit),
    ctx.db.listAllSetsForExercise(exercise.id),
    bodyweight ? loadBodyWeightsOrEmpty(ctx.db) : Promise.resolve<{ log: BodyWeightLog; error?: string }>({ log: new BodyWeightLog([]) }),
  ]);
  return {
    exercise: exerciseSummary(exercise),
    match_score: score,
    other_candidates: alternatives,
    total_sets: all.length,
    first_logged_at: all[0]?.logged_at,
    recent_sets: recent.map(s => setView(s, bodyweight, bw)),
    ...bestSets(all, bodyweight, bw),
    ...(bodyweight
      ? {
          note: bwError
            ? `Bodyweight exercise, but the body-weight log could not be read (${bwError}): loads are added weight only and no e1RM is estimated.`
            : bw.isEmpty
              ? 'Bodyweight exercise with no body-weight log: loads are added weight only and no e1RM is estimated.'
              : 'Bodyweight exercise: effective_load_lbs = body weight on that date + added weight (weight_lbs). PRs and e1RM use the effective load.',
        }
      : {}),
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
  if (!oldest) throw new ToolError('weeks_back must be at least 1');

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
  const unknownGroups = new Set<string>();
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
    for (const raw of ex.primary_muscle_groups ?? []) {
      const mg = canonicalMuscleGroup(raw);
      if (mg) totals[mg] += credit;
      else unknownGroups.add(String(raw));
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
    ...(unknownGroups.size ? { unrecognized_muscle_groups: [...unknownGroups] } : {}),
  };
}

export async function getPrs(ctx: ToolContext, input: { limit: number }) {
  const [sets, exercises, { log: bw, error: bwError }] = await Promise.all([
    ctx.db.listAllSets(),
    ctx.db.listExercises(),
    loadBodyWeightsOrEmpty(ctx.db),
  ]);
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
      const bodyweight = isBodyweightExercise(e);
      return {
        exercise_id: e.id,
        name: e.name,
        primary_muscle_groups: (e.primary_muscle_groups ?? []).map(m => canonicalMuscleGroup(m) ?? m),
        is_bodyweight: bodyweight,
        total_sets: exSets.length,
        ...bestSets(exSets, bodyweight, bw),
      };
    })
    .filter(p => p.heaviest_set !== null || p.most_reps_set)
    // Ranked by Epley e1RM (sets of E1RM_MAX_REPS or fewer), then by heaviest effective
    // load for exercises with only high-rep sets, then by reps for reps-only entries.
    .sort((a, b) => {
      const ae = a.best_e1rm_epley?.e1rm_lbs ?? -1;
      const be = b.best_e1rm_epley?.e1rm_lbs ?? -1;
      if (ae !== be) return be - ae;
      const al = a.heaviest_set?.effective_load_lbs ?? a.heaviest_set?.weight_lbs ?? -1;
      const bl = b.heaviest_set?.effective_load_lbs ?? b.heaviest_set?.weight_lbs ?? -1;
      if (al !== bl) return bl - al;
      return (b.most_reps_set?.reps ?? 0) - (a.most_reps_set?.reps ?? 0);
    });
  return {
    exercise_count: prs.length,
    truncated: prs.length > input.limit,
    body_weight_basis: bwError
      ? `Body-weight log could not be read (${bwError}); bodyweight exercises are ranked by reps only.`
      : bw.isEmpty
        ? 'No body-weight log; bodyweight exercises are ranked by reps only.'
        : `Bodyweight exercises use body weight on the set date plus added weight (latest body weight ${bw.latest} lbs); marked load_note "+BW".`,
    e1rm_note: `Estimated 1RM (Epley and Brzycki) only uses sets of ${E1RM_MAX_REPS} reps or fewer; exercises with only higher-rep sets have best_e1rm_epley null and rank by heaviest load.`,
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

export async function describeSchema(ctx: ToolContext) {
  if (!ctx.describeSchema) throw new ToolError('Schema description is not configured on this server.');
  const schema = await ctx.describeSchema();
  return {
    tables: Object.fromEntries(Object.keys(schema).sort().map(t => [t, schema[t]])),
    missing_required_columns: missingColumns(schema),
  };
}

// ─── nutrition ──────────────────────────────────────────────────────────────

const MACRO_COLUMNS = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const;
const MICRO_COLUMNS = ['iron_mg', 'vitamin_b12_mcg', 'vitamin_d_iu', 'calcium_mg', 'zinc_mg', 'sodium_mg'] as const;
type NutrientColumn = (typeof MACRO_COLUMNS)[number] | (typeof MICRO_COLUMNS)[number];

/** Today's YYYY-MM-DD in the configured time zone, and the first day of a trailing window. */
function windowDates(ctx: ToolContext, daysBack: number): { today: string; since: string } {
  const now = (ctx.now ?? (() => new Date()))();
  const local = toLocalDate(now, ctx.timeZone);
  const today = ymd(local);
  const since = ymd(addDays(local, -(daysBack - 1)));
  return { today, since };
}

/** Mean over rows whose value is a number; null when no row has one. */
function averageOf(rows: NutritionDayRow[], column: NutrientColumn): { avg: number | null; days: number } {
  const values = rows.map(r => r[column]).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return { avg: null, days: 0 };
  return { avg: round1(values.reduce((a, b) => a + b, 0) / values.length), days: values.length };
}

export async function getNutritionLog(ctx: ToolContext, input: { days_back: number }) {
  const { today, since } = windowDates(ctx, input.days_back);
  // Only days that have HealthKit samples count as logged. A day absent from the
  // table, or present with sample_count 0, is "no data", never zero calories.
  const rows = (await ctx.db.listNutritionDays(since))
    .filter(r => r.sample_count > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  const complete = rows.filter(r => r.date !== today);
  const macros = {} as Record<(typeof MACRO_COLUMNS)[number], number | null>;
  for (const c of MACRO_COLUMNS) macros[c] = averageOf(complete, c).avg;
  const micros = {} as Record<(typeof MICRO_COLUMNS)[number], { avg: number | null; days_with_data: number }>;
  for (const c of MICRO_COLUMNS) {
    const { avg, days } = averageOf(complete, c);
    micros[c] = { avg, days_with_data: days };
  }
  const unreadable = [...MACRO_COLUMNS, ...MICRO_COLUMNS].filter(c => rows.length > 0 && rows.every(r => r[c] === null));

  return {
    window: { since, through: today, days: input.days_back, time_zone: ctx.timeZone },
    summary: {
      logged_days: rows.length,
      complete_days: complete.length,
      averages_exclude_partial_day: true,
      daily_averages: macros,
      micro_averages: micros,
      ...(unreadable.length ? { unreadable_in_current_app_build: unreadable } : {}),
    },
    days: rows.map(r => ({
      date: r.date,
      ...(r.date === today ? { partial: true as const } : {}),
      calories: r.calories,
      protein_g: r.protein_g,
      carbs_g: r.carbs_g,
      fat_g: r.fat_g,
      fiber_g: r.fiber_g,
      iron_mg: r.iron_mg,
      vitamin_b12_mcg: r.vitamin_b12_mcg,
      vitamin_d_iu: r.vitamin_d_iu,
      calcium_mg: r.calcium_mg,
      zinc_mg: r.zinc_mg,
      sodium_mg: r.sodium_mg,
      sample_count: r.sample_count,
      synced_at: r.synced_at ?? undefined,
    })),
    note: 'Source: Cronometer via Apple Health. Days without samples are omitted rather than shown as zero; null means the app build could not read that nutrient.',
  };
}

// ─── supplements ────────────────────────────────────────────────────────────

export async function getSupplementLog(ctx: ToolContext, input: { days_back: number }) {
  const { today, since } = windowDates(ctx, input.days_back);
  const [supplements, intakes] = await Promise.all([
    ctx.db.listSupplements(),
    ctx.db.listSupplementIntakes(since),
  ]);
  const nameById = new Map(supplements.map(s => [s.id, s.name]));

  const daysBySupplement = new Map<string, Set<string>>();
  const byDate = new Map<string, Set<string>>();
  for (const i of intakes) {
    if (i.date > today) continue;
    const days = daysBySupplement.get(i.supplement_id) ?? new Set<string>();
    days.add(i.date);
    daysBySupplement.set(i.supplement_id, days);
    const names = byDate.get(i.date) ?? new Set<string>();
    names.add(nameById.get(i.supplement_id) ?? i.supplement_id);
    byDate.set(i.date, names);
  }

  const daysInWindow = input.days_back;
  const adherence = supplements
    .filter(s => s.is_active !== false || daysBySupplement.has(s.id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    .map(s => {
      const days = daysBySupplement.get(s.id) ?? new Set<string>();
      const sorted = [...days].sort();
      return {
        id: s.id,
        name: s.name,
        is_active: s.is_active ?? true,
        days_taken: days.size,
        days_in_window: daysInWindow,
        adherence_pct: Math.round((days.size / daysInWindow) * 100),
        taken_today: days.has(today),
        last_taken: sorted.at(-1),
      };
    });

  return {
    window: { since, through: today, days: daysInWindow, time_zone: ctx.timeZone },
    supplements: adherence,
    intakes_by_day: [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, names]) => ({ date, ...(date === today ? { partial: true as const } : {}), taken: [...names].sort() })),
    note: 'The app stores supplement names and daily check-offs only; doses are not recorded.',
  };
}
