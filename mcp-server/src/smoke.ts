/**
 * Smoke test against the real database. Reads the same env vars as the server,
 * checks that every column the tools depend on exists, then runs every tool once.
 * Exits non-zero with the failing tool named. Run: npm run smoke
 */
import { createClient } from '@supabase/supabase-js';
import { Db, asMinimal, fetchSchemaDescription, missingColumns } from './db.js';
import { creditedPrimaries, setCredit } from './muscles.js';
import { weekStartKey } from './dates.js';
import {
  describeSchema,
  getBodyWeightLog,
  getNutritionLog,
  getSleepLog,
  getSupplementLog,
  getExerciseHistory,
  getFavoriteExercises,
  getPrs,
  getRecentWorkouts,
  getWeeklyVolume,
  searchExercises,
  type ToolContext,
} from './tools.js';

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`smoke: ${name} is not set`);
    process.exit(2);
  }
  return v;
}

const url = env('SUPABASE_URL');
const key = env('SUPABASE_SERVICE_ROLE_KEY');
const userId = process.env.SUPABASE_USER_ID?.trim() || undefined;
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const ctx: ToolContext = {
  db: new Db(asMinimal(supabase), userId),
  timeZone: process.env.TIMEZONE?.trim() || 'UTC',
  describeSchema: () => fetchSchemaDescription(url, key),
};

let failures = 0;
async function step(name: string, fn: () => Promise<unknown>): Promise<void> {
  const started = Date.now();
  try {
    const result = await fn();
    const size = JSON.stringify(result).length;
    console.log(`ok   ${name} (${Date.now() - started}ms, ${size} bytes)`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const schema = await fetchSchemaDescription(url, key);
const missing = missingColumns(schema);
if (missing.length) {
  failures++;
  console.error(`FAIL schema: missing required columns: ${missing.join(', ')}`);
} else {
  console.log('ok   schema: all required columns present');
}

await step('describe_schema', () => describeSchema(ctx));
await step('get_recent_workouts', () => getRecentWorkouts(ctx, { limit: 3 }));
await step('search_exercises', () => searchExercises(ctx, { query: 'press', limit: 3 }));
await step('get_exercise_history', async () => {
  const found = await searchExercises(ctx, { query: 'press', limit: 1 });
  const name = found.matches[0]?.name;
  if (!name) return { skipped: 'no exercises' };
  return getExerciseHistory(ctx, { exercise_name: name, limit: 5 });
});
await step('get_weekly_volume', () => getWeeklyVolume(ctx, { weeks_back: 2 }));
await step('get_prs', () => getPrs(ctx, { limit: 5 }));
await step('get_body_weight_log', () => getBodyWeightLog(ctx, { limit: 3 }));
await step('get_favorite_exercises', () => getFavoriteExercises(ctx));
await step('get_nutrition_log', () => getNutritionLog(ctx, { days_back: 14 }));
await step('get_supplement_log', () => getSupplementLog(ctx, { days_back: 14 }));
await step('get_sleep_log', () => getSleepLog(ctx, { days_back: 14 }));

// ─── Regression fixture: week 2026-08-31 .. 2026-09-06 ──────────────────────
// Recompute the week straight from workout_sets + exercises with the counting
// rules, independently of getWeeklyVolume, and compare. Chest must be 27: the
// rotator-cuff mis-mapping once made it 67.
const REGRESSION_WEEK = { week_start: '2026-08-31', expect: { chest: 27 } };
await step(`regression week ${REGRESSION_WEEK.week_start}`, async () => {
  const settings = await ctx.db.getUserSettings();
  const weekStartDay = settings?.week_start_day === 'monday' ? 'monday' : 'sunday';
  const [exercises, sets] = await Promise.all([
    ctx.db.listExercises(),
    ctx.db.listSetsSince(`${REGRESSION_WEEK.week_start}T00:00:00Z`),
  ]);
  const workouts = await ctx.db.listWorkoutsByIds(sets.map(s => s.workout_id));
  const deload = new Set(workouts.filter(w => w.is_deload).map(w => w.id));
  const byId = new Map(exercises.map(e => [e.id, e]));
  const independent: Record<string, number> = {};
  let rawSets = 0;
  for (const s of sets) {
    if (weekStartKey(new Date(s.logged_at), ctx.timeZone, weekStartDay) !== REGRESSION_WEEK.week_start) continue;
    if (deload.has(s.workout_id)) continue;
    rawSets += 1;
    const ex = byId.get(s.exercise_id);
    if (!ex) continue;
    for (const g of creditedPrimaries(ex.primary_muscle_groups)) independent[g] = (independent[g] ?? 0) + setCredit(ex.is_unilateral);
  }
  // Ask the tool for enough weeks to include the fixture week.
  const now = new Date();
  const weeksBack = Math.min(26, Math.ceil((now.getTime() - Date.parse(`${REGRESSION_WEEK.week_start}T00:00:00Z`)) / (7 * 86400000)) + 1);
  const volume = await getWeeklyVolume(ctx, { weeks_back: weeksBack });
  const week = volume.weeks.find(w => w.week_start === REGRESSION_WEEK.week_start);
  if (!week) throw new Error(`tool did not return week ${REGRESSION_WEEK.week_start}`);
  const mismatches: string[] = [];
  for (const [g, expected] of Object.entries(REGRESSION_WEEK.expect)) {
    const got = (week.sets_by_muscle_group as Record<string, number>)[g];
    if (got !== expected) mismatches.push(`${g}: tool ${got}, expected ${expected}`);
  }
  for (const [g, v] of Object.entries(week.sets_by_muscle_group)) {
    const ind = Math.round((independent[g] ?? 0) * 10) / 10;
    if (ind !== v) mismatches.push(`${g}: tool ${v}, independent ${ind}`);
  }
  if (mismatches.length) throw new Error(`week ${REGRESSION_WEEK.week_start}: ${mismatches.join('; ')}`);
  return { raw_sets: rawSets, total_sets: week.total_sets, chest: week.sets_by_muscle_group.chest, unmapped: (volume as { unmapped_exercises?: unknown[] }).unmapped_exercises?.length ?? 0 };
});

if (failures) {
  console.error(`smoke: ${failures} failure(s)`);
  process.exit(1);
}
console.log('smoke: all tools passed');
