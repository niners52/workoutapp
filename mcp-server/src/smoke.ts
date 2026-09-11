/**
 * Smoke test against the real database. Reads the same env vars as the server,
 * checks that every column the tools depend on exists, then runs every tool once.
 * Exits non-zero with the failing tool named. Run: npm run smoke
 */
import { createClient } from '@supabase/supabase-js';
import { Db, asMinimal, fetchSchemaDescription, missingColumns } from './db.js';
import {
  describeSchema,
  getBodyWeightLog,
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

if (failures) {
  console.error(`smoke: ${failures} failure(s)`);
  process.exit(1);
}
console.log('smoke: all tools passed');
