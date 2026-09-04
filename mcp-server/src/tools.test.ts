import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Db } from './db.js';
import { createFakeSupabase, type FakeOptions } from './fakeSupabase.js';
import { createMcpServer } from './server.js';
import {
  ToolError,
  brzycki1RM,
  epley1RM,
  getBodyWeightLog,
  getExerciseHistory,
  getFavoriteExercises,
  getPrs,
  getRecentWorkouts,
  getWeeklyVolume,
  searchExercises,
  type ToolContext,
} from './tools.js';
import { weekStartKey } from './dates.js';

const U = 'user-1';
const OTHER = 'user-2';
// Friday 2026-09-04, noon in Denver. Week (Monday start) = 2026-08-31 .. 2026-09-06.
const NOW = new Date('2026-09-04T18:00:00Z');
const TZ = 'America/Denver';

const tables = {
  exercises: [
    { id: 'e1', user_id: U, name: 'Barbell Bench Press', base_name: 'Bench Press', primary_muscle_groups: ['chest'], secondary_muscle_groups: ['triceps', 'front_delts'], equipment: 'barbell', is_favorite: false, is_unilateral: false },
    { id: 'e2', user_id: U, name: 'Machine Leg press machine pf', base_name: 'Leg Press', primary_muscle_groups: ['quads', 'glutes'], secondary_muscle_groups: [], equipment: 'machine', is_favorite: false },
    { id: 'e3', user_id: U, name: 'DB Lateral Raise', base_name: null, primary_muscle_groups: ['side_delts'], secondary_muscle_groups: [], equipment: 'dumbbell', is_favorite: true },
    { id: 'e4', user_id: U, name: 'Bulgarian Split Squat', base_name: null, primary_muscle_groups: ['quads', 'glutes'], secondary_muscle_groups: ['hamstrings'], equipment: 'dumbbell', is_favorite: false, is_unilateral: true },
    { id: 'e5', user_id: OTHER, name: 'Bench Press (someone else)', base_name: null, primary_muscle_groups: ['chest'], secondary_muscle_groups: [], equipment: 'barbell', is_favorite: true },
  ],
  workouts: [
    { id: 'w1', user_id: U, template_id: null, started_at: '2026-09-02T15:00:00Z', completed_at: '2026-09-02T16:05:00Z', location_id: 'l1', is_deload: false },
    { id: 'w2', user_id: U, template_id: null, started_at: '2026-08-26T15:00:00Z', completed_at: '2026-08-26T15:45:00Z', location_id: null, is_deload: true },
    { id: 'w3', user_id: U, template_id: null, started_at: '2026-08-19T15:00:00Z', completed_at: null, location_id: 'l1', is_deload: false },
    // Sunday Aug 30, 9pm Denver == Monday Aug 31 03:00Z: belongs to the *previous* week in Denver.
    { id: 'w4', user_id: U, template_id: null, started_at: '2026-08-31T03:00:00Z', completed_at: '2026-08-31T03:30:00Z', location_id: null, is_deload: false },
    { id: 'w9', user_id: OTHER, template_id: null, started_at: '2026-09-03T15:00:00Z', completed_at: null, location_id: null, is_deload: false },
  ],
  workout_sets: [
    { id: 's1', user_id: U, workout_id: 'w1', exercise_id: 'e1', weight: 185, reps: 8, logged_at: '2026-09-02T15:10:00Z' },
    { id: 's2', user_id: U, workout_id: 'w1', exercise_id: 'e1', weight: 205, reps: 5, logged_at: '2026-09-02T15:15:00Z' },
    { id: 's3', user_id: U, workout_id: 'w1', exercise_id: 'e1', weight: 225, reps: 1, logged_at: '2026-09-02T15:20:00Z' },
    { id: 's4', user_id: U, workout_id: 'w1', exercise_id: 'e4', weight: 40, reps: 10, logged_at: '2026-09-02T15:40:00Z' },
    { id: 's5', user_id: U, workout_id: 'w1', exercise_id: 'e4', weight: 40, reps: 10, logged_at: '2026-09-02T15:45:00Z' },
    { id: 's6', user_id: U, workout_id: 'w2', exercise_id: 'e1', weight: 95, reps: 10, logged_at: '2026-08-26T15:10:00Z' }, // deload
    { id: 's7', user_id: U, workout_id: 'w3', exercise_id: 'e2', weight: 400, reps: 10, logged_at: '2026-08-19T15:10:00Z' },
    { id: 's8', user_id: U, workout_id: 'w3', exercise_id: 'e2', weight: 450, reps: 6, logged_at: '2026-08-19T15:15:00Z' },
    { id: 's9', user_id: U, workout_id: 'w4', exercise_id: 'e3', weight: 20, reps: 15, logged_at: '2026-08-31T03:05:00Z' },
    { id: 's10', user_id: OTHER, workout_id: 'w9', exercise_id: 'e5', weight: 500, reps: 1, logged_at: '2026-09-03T15:10:00Z' },
  ],
  body_measurements: [
    { id: 'b1', user_id: U, date: '2026-09-01', weight: 181.2, body_fat_percentage: 17.5, source: 'healthkit' },
    { id: 'b2', user_id: U, date: '2026-08-25', weight: 182.0, body_fat_percentage: null, source: 'manual' },
    { id: 'b3', user_id: U, date: '2026-09-03', weight: null, type: 'waist', value: 33.5, source: 'manual' },
    { id: 'b4', user_id: U, date: '2026-08-18', weight: 183.4, body_fat_percentage: null, source: 'healthkit' },
    { id: 'b5', user_id: OTHER, date: '2026-09-04', weight: 250, body_fat_percentage: null, source: 'manual' },
  ],
  user_settings: [
    { user_id: U, week_start_day: 'monday', units: 'imperial', muscle_group_targets: { chest: 12, quads: 10, glutes: 0 } },
  ],
  workout_locations: [{ id: 'l1', user_id: U, name: 'Planet Fitness' }],
};

function makeCtx(opts: FakeOptions = {}): ToolContext & { queryLog: string[] } {
  const { client, queryLog } = createFakeSupabase(tables, opts);
  return { db: new Db(client, U), timeZone: TZ, now: () => NOW, queryLog };
}

/** No SUPABASE_USER_ID configured: the Db is not scoped to a user. */
function makeUnscopedCtx(): ToolContext {
  const { client } = createFakeSupabase(tables);
  return { db: new Db(client), timeZone: TZ, now: () => NOW };
}

test('formulas match the app and the Epley definition', () => {
  assert.equal(epley1RM(225, 1), 225);
  assert.equal(epley1RM(200, 6), 240);
  assert.equal(brzycki1RM(200, 6), Math.round(200 * (36 / 31)));
  assert.equal(brzycki1RM(100, 40), 100); // app returns the weight beyond 36 reps
});

test('get_recent_workouts: newest first, user-scoped, grouped by exercise', async () => {
  const r = await getRecentWorkouts(makeCtx(), { limit: 10 });
  assert.deepEqual(r.workouts.map(w => w.id), ['w1', 'w4', 'w2', 'w3']);
  const w1 = r.workouts[0]!;
  assert.equal(w1.duration_min, 65);
  assert.equal(w1.location, 'Planet Fitness');
  assert.equal(w1.total_sets, 5);
  assert.deepEqual(
    w1.exercises.map(e => [e.name, e.sets, e.top_set?.weight_lbs, e.top_set?.reps]),
    [['Barbell Bench Press', 3, 225, 1], ['Bulgarian Split Squat', 2, 40, 10]],
  );
  assert.equal(r.workouts[3]!.duration_min, undefined, 'open workout has no duration');
  assert.equal(r.workouts[2]!.is_deload, true);
});

test('get_recent_workouts: respects limit', async () => {
  const r = await getRecentWorkouts(makeCtx(), { limit: 2 });
  assert.equal(r.workouts.length, 2);
});

test('get_exercise_history: fuzzy resolve, recent sets, bests', async () => {
  const r = await getExerciseHistory(makeCtx(), { exercise_name: 'leg press', limit: 1 });
  assert.equal(r.exercise.name, 'Machine Leg press machine pf');
  assert.equal(r.total_sets, 2);
  assert.equal(r.recent_sets.length, 1);
  assert.equal(r.recent_sets[0]!.weight_lbs, 450, 'most recent set first');
  assert.equal(r.heaviest_set?.weight_lbs, 450);
  // Epley: 400x10 = 533.3, 450x6 = 540
  assert.equal(r.best_e1rm_epley?.e1rm_lbs, 540);
  assert.equal(r.best_e1rm_epley?.e1rm_brzycki_app_lbs, brzycki1RM(450, 6));
  assert.equal(r.first_logged_at, '2026-08-19T15:10:00Z');
});

test('get_exercise_history: heaviest set is the single; deload sets still count toward history and PRs', async () => {
  const r = await getExerciseHistory(makeCtx(), { exercise_name: 'Bench Press', limit: 30 });
  assert.equal(r.exercise.id, 'e1', 'does not leak another user\'s "Bench Press"');
  assert.equal(r.heaviest_set?.weight_lbs, 225);
  assert.equal(r.total_sets, 4);
  // Epley: 185x8=234.3, 205x5=239.2, 225x1=225, 95x10=126.7
  assert.equal(r.best_e1rm_epley?.e1rm_lbs, 239.2);
});

test('get_exercise_history: unknown name is a readable error with suggestions', async () => {
  await assert.rejects(
    getExerciseHistory(makeCtx(), { exercise_name: 'zzz kettlebell juggling', limit: 5 }),
    (err: unknown) => err instanceof ToolError && /No exercise matches/.test(err.message),
  );
});

test('search_exercises: ranks, scopes to user, reports last logged', async () => {
  const r = await searchExercises(makeCtx(), { query: 'bench', limit: 5 });
  assert.equal(r.matches[0]!.name, 'Barbell Bench Press');
  assert.ok(r.matches.every(m => m.id !== 'e5'));
  assert.equal(r.matches[0]!.last_logged_at, '2026-09-02T15:20:00Z');
  const messy = await searchExercises(makeCtx(), { query: 'legpress pf', limit: 3 });
  assert.equal(messy.matches[0]!.id, 'e2');
});

test('get_weekly_volume: mirrors app rules (primary only, unilateral 0.5, deload excluded, tz-aware weeks)', async () => {
  const r = await getWeeklyVolume(makeCtx(), { weeks_back: 4 });
  assert.equal(r.week_start_day, 'monday');
  assert.deepEqual(r.weeks.map(w => w.week_start), ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
  const [, wk0817, wk0824, wk0831] = r.weeks as [unknown, typeof r.weeks[number], typeof r.weeks[number], typeof r.weeks[number]];

  // Current week: 3 bench sets -> chest 3; split squat 2 sets x 0.5 -> quads 1, glutes 1.
  assert.equal(wk0831.sets_by_muscle_group.chest, 3);
  assert.equal(wk0831.sets_by_muscle_group.quads, 1);
  assert.equal(wk0831.sets_by_muscle_group.glutes, 1);
  assert.equal(wk0831.sets_by_muscle_group.triceps, 0, 'secondary muscles earn no credit');
  assert.equal(wk0831.sets_by_muscle_group.side_delts, 0, 'Sunday-night Denver set is not in this week');
  assert.equal(wk0824.sets_by_muscle_group.side_delts, 1, 'it lands in the prior week');
  assert.equal(wk0824.sets_by_muscle_group.chest, 0, 'deload sets excluded');
  assert.equal(r.skipped_deload_sets, 1);
  assert.equal(wk0817.sets_by_muscle_group.quads, 2);
  assert.equal(wk0817.sets_by_category.legs, 4, 'quads 2 + glutes 2');

  // Targets: only >0 survive; total_sets counts targeted muscles only (chest 3 + quads 1).
  assert.deepEqual(r.weekly_targets, { chest: 12, quads: 10 });
  assert.equal(wk0831.total_sets, 4);
  assert.equal(wk0831.target_sets, 22);
});

test('get_weekly_volume: defaults to Sunday weeks when settings are missing', async () => {
  const { client } = createFakeSupabase({ ...tables, user_settings: [] });
  const r = await getWeeklyVolume({ db: new Db(client, U), timeZone: 'UTC', now: () => NOW }, { weeks_back: 1 });
  assert.equal(r.week_start_day, 'sunday');
  assert.equal(r.weeks[0]!.week_start, '2026-08-30');
  assert.deepEqual(r.weekly_targets, {});
});

test('weekStartKey handles time zones', () => {
  const t = new Date('2026-08-31T03:00:00Z');
  assert.equal(weekStartKey(t, 'UTC', 'monday'), '2026-08-31');
  assert.equal(weekStartKey(t, 'America/Denver', 'monday'), '2026-08-24');
  assert.equal(weekStartKey(t, 'America/Denver', 'sunday'), '2026-08-30');
});

test('get_prs: one entry per exercise with history, sorted by Epley 1RM', async () => {
  const r = await getPrs(makeCtx(), { limit: 100 });
  assert.deepEqual(r.prs.map(p => p.exercise_id), ['e2', 'e1', 'e4', 'e3']);
  const bench = r.prs.find(p => p.exercise_id === 'e1')!;
  assert.equal(bench.heaviest_set?.weight_lbs, 225);
  assert.equal(bench.best_e1rm_epley?.e1rm_lbs, 239.2);
  assert.equal(bench.total_sets, 4);
  assert.equal(r.truncated, false);
  const capped = await getPrs(makeCtx(), { limit: 2 });
  assert.equal(capped.prs.length, 2);
  assert.equal(capped.truncated, true);
});

test('get_body_weight_log: weight rows only, newest first, limited', async () => {
  const r = await getBodyWeightLog(makeCtx(), { limit: 2 });
  assert.deepEqual(r.entries.map(e => [e.date, e.weight_lbs]), [['2026-09-01', 181.2], ['2026-08-25', 182]]);
  assert.equal(r.entries[0]!.body_fat_percentage, 17.5);
  assert.equal(r.entries[1]!.body_fat_percentage, undefined);
});

test('get_favorite_exercises: only this user\'s starred exercises', async () => {
  const r = await getFavoriteExercises(makeCtx());
  assert.deepEqual(r.favorites.map(f => f.name), ['DB Lateral Raise']);
});

test('paging: full-history scans keep fetching past the PostgREST row cap', async () => {
  const ctx = makeCtx({ pageSize: 2 });
  const sets = await ctx.db.listAllSets();
  assert.equal(sets.length, 9);
  assert.equal(ctx.queryLog.filter(t => t === 'workout_sets').length, 6, '5 pages of 2 plus the terminating empty page');
});

test('without SUPABASE_USER_ID every user\'s rows are visible', async () => {
  const r = await getFavoriteExercises(makeUnscopedCtx());
  assert.equal(r.favorites.length, 2);
});

// ─── end-to-end through the MCP protocol ────────────────────────────────────

async function connectClient(ctx: ToolContext) {
  const server = createMcpServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

test('MCP: lists all tools as read-only and executes one', async () => {
  const { client, close } = await connectClient(makeCtx());
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map(t => t.name).sort(),
      ['get_body_weight_log', 'get_exercise_history', 'get_favorite_exercises', 'get_prs', 'get_recent_workouts', 'get_weekly_volume', 'search_exercises'],
    );
    assert.ok(tools.every(t => t.annotations?.readOnlyHint === true));

    const result = await client.callTool({ name: 'get_recent_workouts', arguments: { limit: 1 } });
    assert.notEqual(result.isError, true);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]!.text) as { workouts: Array<{ id: string }> };
    assert.equal(parsed.workouts[0]!.id, 'w1');
  } finally {
    await close();
  }
});

test('MCP: invalid input is rejected by zod, not by a crash', async () => {
  const { client, close } = await connectClient(makeCtx());
  try {
    const result = await client.callTool({ name: 'get_recent_workouts', arguments: { limit: 0 } });
    assert.equal(result.isError, true);
    const noName = await client.callTool({ name: 'get_exercise_history', arguments: {} });
    assert.equal(noName.isError, true);
  } finally {
    await close();
  }
});

test('MCP: database failure becomes a helpful tool error', async () => {
  const { client, close } = await connectClient(makeCtx({ failing: { workout_sets: 'relation "workout_sets" does not exist' } }));
  try {
    const result = await client.callTool({ name: 'get_prs', arguments: {} });
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    assert.match(text, /Database query failed/);
    assert.match(text, /workout_sets/);
  } finally {
    await close();
  }
});
