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
  describeSchema,
  epley1RM,
  getBodyWeightLog,
  getExerciseHistory,
  getFavoriteExercises,
  getNutritionLog,
  getPrs,
  getSupplementLog,
  getRecentWorkouts,
  getSleepLog,
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
    { id: 'e6', user_id: U, name: 'Pull-Up', base_name: null, primary_muscle_groups: ['lats'], secondary_muscle_groups: [], equipment: 'bodyweight', is_favorite: false },
    { id: 'e7', user_id: U, name: 'Face Pull', base_name: null, primary_muscle_groups: ['rear_delts'], secondary_muscle_groups: [], equipment: 'cable', is_favorite: false },
  ],
  workouts: [
    { id: 'w1', user_id: U, template_id: null, started_at: '2026-09-02T15:00:00Z', completed_at: '2026-09-02T16:05:00Z', location_id: 'l1', is_deload: false },
    { id: 'w2', user_id: U, template_id: null, started_at: '2026-08-26T15:00:00Z', completed_at: '2026-08-26T15:45:00Z', location_id: null, is_deload: true },
    { id: 'w3', user_id: U, template_id: null, started_at: '2026-08-19T15:00:00Z', completed_at: null, location_id: 'l1', is_deload: false },
    // Sunday Aug 30, 9pm Denver == Monday Aug 31 03:00Z: belongs to the *previous* week in Denver.
    { id: 'w4', user_id: U, template_id: null, started_at: '2026-08-31T03:00:00Z', completed_at: '2026-08-31T03:30:00Z', location_id: null, is_deload: false },
    { id: 'w9', user_id: OTHER, template_id: null, started_at: '2026-09-03T15:00:00Z', completed_at: null, location_id: null, is_deload: false },
    // Left open overnight and "finished" the next morning: 10h on paper, 40 min of lifting.
    { id: 'w5', user_id: U, template_id: null, started_at: '2026-09-03T00:45:00Z', completed_at: '2026-09-03T11:00:00Z', location_id: null, is_deload: false },
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
    { id: 's11', user_id: U, workout_id: 'w5', exercise_id: 'e6', weight: 0, reps: 10, logged_at: '2026-09-03T00:55:00Z' },
    { id: 's12', user_id: U, workout_id: 'w5', exercise_id: 'e6', weight: 25, reps: 6, logged_at: '2026-09-03T01:10:00Z' },
    { id: 's13', user_id: U, workout_id: 'w5', exercise_id: 'e7', weight: 40, reps: 15, logged_at: '2026-09-03T01:25:00Z' },
    { id: 's14', user_id: U, workout_id: 'w1', exercise_id: 'e7', weight: 45, reps: 45, logged_at: '2026-09-02T15:50:00Z' },
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
  // NOW is Friday 2026-09-04 in Denver. 09-01 is absent (not logged), 08-31 has sample_count 0.
  nutrition_days: [
    { id: 'hk-nutrition-2026-09-04', user_id: U, date: '2026-09-04', calories: 900, protein_g: 80, carbs_g: 60, fat_g: 30, fiber_g: 10, iron_mg: null, vitamin_b12_mcg: null, vitamin_d_iu: null, calcium_mg: null, zinc_mg: null, sodium_mg: 1200, sample_count: 12, source: 'healthkit', synced_at: '2026-09-04T17:00:00Z' },
    { id: 'hk-nutrition-2026-09-03', user_id: U, date: '2026-09-03', calories: 2400, protein_g: 200, carbs_g: 220, fat_g: 80, fiber_g: 30, iron_mg: null, vitamin_b12_mcg: null, vitamin_d_iu: null, calcium_mg: null, zinc_mg: null, sodium_mg: 3000, sample_count: 40, source: 'healthkit', synced_at: '2026-09-04T17:00:00Z' },
    { id: 'hk-nutrition-2026-09-02', user_id: U, date: '2026-09-02', calories: 2000, protein_g: 180, carbs_g: 180, fat_g: 70, fiber_g: 20, iron_mg: 12, vitamin_b12_mcg: null, vitamin_d_iu: null, calcium_mg: null, zinc_mg: null, sodium_mg: 2600, sample_count: 35, source: 'healthkit', synced_at: '2026-09-04T17:00:00Z' },
    { id: 'hk-nutrition-2026-08-31', user_id: U, date: '2026-08-31', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, iron_mg: null, vitamin_b12_mcg: null, vitamin_d_iu: null, calcium_mg: null, zinc_mg: null, sodium_mg: 0, sample_count: 0, source: 'healthkit', synced_at: '2026-09-04T17:00:00Z' },
    { id: 'hk-nutrition-2026-09-03', user_id: OTHER, date: '2026-09-03', calories: 5000, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 1, iron_mg: null, vitamin_b12_mcg: null, vitamin_d_iu: null, calcium_mg: null, zinc_mg: null, sodium_mg: 1, sample_count: 3, source: 'healthkit', synced_at: null },
  ],
  supplements: [
    { id: 'sup1', user_id: U, name: 'Creatine', sort_order: 0, is_active: true },
    { id: 'sup2', user_id: U, name: 'Vitamin D', sort_order: 1, is_active: true },
    { id: 'sup3', user_id: U, name: 'Old Thing', sort_order: 2, is_active: false },
  ],
  supplement_intakes: [
    { id: 'in1', user_id: U, supplement_id: 'sup1', date: '2026-09-04', taken_at: '2026-09-04T13:00:00Z' },
    { id: 'in2', user_id: U, supplement_id: 'sup1', date: '2026-09-03', taken_at: '2026-09-03T13:00:00Z' },
    { id: 'in3', user_id: U, supplement_id: 'sup1', date: '2026-09-02', taken_at: '2026-09-02T13:00:00Z' },
    { id: 'in4', user_id: U, supplement_id: 'sup2', date: '2026-09-03', taken_at: '2026-09-03T13:00:00Z' },
    { id: 'in5', user_id: U, supplement_id: 'sup1', date: '2026-08-20', taken_at: '2026-08-20T13:00:00Z' }, // outside a 7-day window
  ],
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

test('formulas: Epley as defined, Brzycki as the app computes it but null past 15 reps', () => {
  assert.equal(epley1RM(225, 1), 225);
  assert.equal(epley1RM(200, 6), 240);
  assert.equal(epley1RM(110, 45), 275);
  assert.equal(brzycki1RM(200, 6), Math.round(200 * (36 / 31)));
  assert.equal(brzycki1RM(200, 15), Math.round(200 * (36 / 22)));
  assert.equal(brzycki1RM(110, 16), null);
  assert.equal(brzycki1RM(110, 45), null, 'the app would report the raw weight here; that is not an estimate');
});

test('get_recent_workouts: newest first, user-scoped, grouped by exercise', async () => {
  const r = await getRecentWorkouts(makeCtx(), { limit: 10 });
  assert.deepEqual(r.workouts.map(w => w.id), ['w5', 'w1', 'w4', 'w2', 'w3']);
  const byId = new Map(r.workouts.map(w => [w.id, w]));
  const w1 = byId.get('w1')!;
  assert.equal(w1.duration_min, 65);
  assert.equal(w1.location, 'Planet Fitness');
  assert.equal(w1.total_sets, 6);
  assert.deepEqual(
    w1.exercises.map(e => [e.name, e.sets, e.top_set?.weight_lbs, e.top_set?.reps]),
    [['Barbell Bench Press', 3, 225, 1], ['Bulgarian Split Squat', 2, 40, 10], ['Face Pull', 1, 45, 45]],
  );
  assert.equal(byId.get('w3')!.duration_min, undefined, 'open workout has no duration');
  assert.equal(byId.get('w2')!.is_deload, true);
  const stale = byId.get('w5')!;
  assert.equal(stale.duration_min, 40, 'measured to the last set, not to the next-morning completed_at');
  assert.equal(stale.duration_truncated_to_last_set, true);
  assert.equal(stale.exercises[0]!.top_set?.load_note, '+BW');
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

test('get_exercise_history: bodyweight exercise adds body weight as of the set date', async () => {
  const r = await getExerciseHistory(makeCtx(), { exercise_name: 'Pull-Up', limit: 5 });
  assert.equal(r.exercise.is_bodyweight, true);
  assert.equal(r.load_basis, 'body_weight_plus_added');
  assert.equal(r.recent_sets[0]!.weight_lbs, 25);
  assert.equal(r.recent_sets[0]!.effective_load_lbs, 206.2);
  assert.equal(r.recent_sets[0]!.body_weight_lbs, 181.2);
  assert.equal(r.heaviest_set?.effective_load_lbs, 206.2);
  assert.equal(r.best_e1rm_epley?.e1rm_lbs, epley1RM(206.2, 6));
  assert.match(r.note ?? '', /effective_load_lbs/);
});

test('get_exercise_history: bodyweight exercise with no body-weight log falls back to reps only', async () => {
  const { client } = createFakeSupabase({ ...tables, body_measurements: [] });
  const r = await getExerciseHistory({ db: new Db(client, U), timeZone: TZ, now: () => NOW }, { exercise_name: 'Pull-Up', limit: 5 });
  assert.equal(r.load_basis, 'reps_only');
  assert.equal(r.best_e1rm_epley, null);
  assert.equal(r.most_reps_set?.reps, 10);
  assert.equal(r.recent_sets[0]!.effective_load_lbs, undefined);
});

test('describe_schema reports the columns the tools need', async () => {
  const ctx = { ...makeCtx(), describeSchema: async () => ({
    exercises: { id: 'uuid', user_id: 'uuid', name: 'text', primary_muscle_groups: 'text[]', equipment: 'text' },
    workouts: { id: 'uuid', user_id: 'uuid', started_at: 'timestamptz', completed_at: 'timestamptz' },
    workout_sets: { id: 'uuid', user_id: 'uuid', workout_id: 'uuid', exercise_id: 'text', weight: 'numeric', reps: 'integer', logged_at: 'timestamptz' },
    body_measurements: { id: 'uuid', user_id: 'uuid', date: 'date', weight_lbs: 'numeric' },
    user_settings: { user_id: 'uuid' },
    workout_locations: { id: 'text', user_id: 'uuid', name: 'text' },
    profiles: { id: 'uuid' },
  }) };
  const r = await describeSchema(ctx);
  assert.ok(r.missing_required_columns.includes('body_measurements.weight'));
  assert.ok(r.missing_required_columns.includes('nutrition_days (table not found)'));
  assert.ok('profiles' in r.tables);
  assert.equal(r.tables.body_measurements!.weight_lbs, 'numeric');
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
  assert.equal(wk0831.sets_by_muscle_group.upper_back, 2, 'legacy rear_delts credits upper_back, as the app does since V10');
  assert.equal(wk0831.sets_by_muscle_group.lats, 2, 'bodyweight sets count like any other set');
  assert.equal(r.weeks[3]!.sets_by_category.legs, 2);
  assert.equal((r as { unmapped_exercises?: unknown[] }).unmapped_exercises, undefined, 'every fixture exercise has a real mapping');
  assert.equal((r as { warning?: string }).warning, undefined);
  assert.equal('miscellaneous' in wk0831.sets_by_muscle_group, false, 'miscellaneous is not a credited group');
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

test('get_weekly_volume: duplicate primaries credit once, miscellaneous is stripped, unmapped exercises are reported loudly', async () => {
  const { client } = createFakeSupabase({
    ...tables,
    exercises: [
      ...tables.exercises!,
      // The rotator-cuff shape before the repair: chest duplicated and padded with miscellaneous.
      { id: 'e10', user_id: U, name: 'Cable (D-Handle) Rotator cuff', base_name: null, primary_muscle_groups: ['chest', 'chest', 'miscellaneous'], secondary_muscle_groups: [], equipment: 'cable', is_favorite: false, is_unilateral: false },
      { id: 'e11', user_id: U, name: 'Mystery Machine', base_name: null, primary_muscle_groups: ['miscellaneous'], secondary_muscle_groups: [], equipment: 'machine', is_favorite: false },
      { id: 'e12', user_id: U, name: 'Empty Mapping', base_name: null, primary_muscle_groups: [], secondary_muscle_groups: [], equipment: 'other', is_favorite: false },
      { id: 'e13', user_id: U, name: 'Cable External Rotation', base_name: null, primary_muscle_groups: ['rotator_cuff'], secondary_muscle_groups: [], equipment: 'cable', is_favorite: false, is_unilateral: true },
    ],
    workout_sets: [
      ...tables.workout_sets!,
      { id: 's20', user_id: U, workout_id: 'w1', exercise_id: 'e10', weight: 10, reps: 15, logged_at: '2026-09-02T15:52:00Z' },
      { id: 's21', user_id: U, workout_id: 'w1', exercise_id: 'e10', weight: 10, reps: 15, logged_at: '2026-09-02T15:53:00Z' },
      { id: 's22', user_id: U, workout_id: 'w1', exercise_id: 'e11', weight: 50, reps: 10, logged_at: '2026-09-02T15:54:00Z' },
      { id: 's23', user_id: U, workout_id: 'w1', exercise_id: 'e11', weight: 50, reps: 10, logged_at: '2026-09-02T15:55:00Z' },
      { id: 's24', user_id: U, workout_id: 'w1', exercise_id: 'e11', weight: 50, reps: 10, logged_at: '2026-09-02T15:56:00Z' },
      { id: 's25', user_id: U, workout_id: 'w1', exercise_id: 'e12', weight: 50, reps: 10, logged_at: '2026-09-02T15:57:00Z' },
      { id: 's26', user_id: U, workout_id: 'w1', exercise_id: 'e13', weight: 10, reps: 15, logged_at: '2026-09-02T15:58:00Z' },
      { id: 's27', user_id: U, workout_id: 'w1', exercise_id: 'e13', weight: 10, reps: 15, logged_at: '2026-09-02T15:59:00Z' },
    ],
  });
  const r = await getWeeklyVolume({ db: new Db(client, U), timeZone: TZ, now: () => NOW }, { weeks_back: 1 });
  const wk = r.weeks[0]!;
  assert.equal(wk.week_start, '2026-08-31');
  assert.equal(wk.sets_by_muscle_group.chest, 5, '3 bench + 2 rotator-cuff sets credited to chest once each, not twice');
  assert.equal('miscellaneous' in wk.sets_by_muscle_group, false);
  assert.equal(wk.sets_by_muscle_group.rotator_cuff, 1, 'two unilateral sets at 0.5');
  assert.equal(wk.sets_by_category.shoulders, 1, 'rotator cuff rolls up under shoulders');
  const out = r as typeof r & { warning?: string; unmapped_exercises?: Array<{ exercise_id: string; sets: number; stored_primary_muscle_groups: string[] }> };
  assert.ok(out.warning?.includes('4 sets'), out.warning);
  assert.deepEqual(
    out.unmapped_exercises?.map(u => [u.exercise_id, u.sets, u.stored_primary_muscle_groups]),
    [['e11', 3, ['miscellaneous']], ['e12', 1, []]],
  );
  const total = Object.values(wk.sets_by_muscle_group).reduce((a, b) => a + b, 0);
  assert.equal(total, 3 + 1 + 1 + 2 + 2 + 2 + 1, 'unmapped sets are credited nowhere');
});

test('get_weekly_volume: tolerates a user_settings row missing newer columns', async () => {
  const { client } = createFakeSupabase({ ...tables, user_settings: [{ user_id: U, week_start_day: 'monday' }] });
  const r = await getWeeklyVolume({ db: new Db(client, U), timeZone: TZ, now: () => NOW }, { weeks_back: 1 });
  assert.equal(r.week_start_day, 'monday');
  assert.deepEqual(r.weekly_targets, {});
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
  assert.deepEqual(r.prs.map(p => p.exercise_id), ['e2', 'e6', 'e1', 'e7', 'e4', 'e3']);
  const pullUp = r.prs.find(p => p.exercise_id === 'e6')!;
  assert.equal(pullUp.is_bodyweight, true);
  assert.equal(pullUp.load_basis, 'body_weight_plus_added');
  // 25 lb added + 181.2 lb body weight (entry dated 2026-09-01, the latest on or before 2026-09-03)
  assert.equal(pullUp.heaviest_set?.effective_load_lbs, 206.2);
  assert.equal(pullUp.heaviest_set?.body_weight_lbs, 181.2);
  assert.equal(pullUp.heaviest_set?.load_note, '+BW');
  assert.equal(pullUp.best_e1rm_epley?.e1rm_lbs, epley1RM(206.2, 6));
  const facePull = r.prs.find(p => p.exercise_id === 'e7')!;
  // Face pull sets: 40x15 (qualifies) and 45x45 (too many reps for any 1RM formula)
  assert.equal(facePull.best_e1rm_epley?.reps, 15);
  assert.equal(facePull.best_e1rm_epley?.e1rm_lbs, epley1RM(40, 15));
  assert.equal(facePull.heaviest_set?.weight_lbs, 45, 'heaviest set still counts the 45-rep set');
  assert.deepEqual(facePull.primary_muscle_groups, ['upper_back'], 'legacy rear_delts reads as upper_back');
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
  assert.equal(sets.length, 13);
  assert.equal(ctx.queryLog.filter(t => t === 'workout_sets').length, 8, '7 pages of 2 (last one short) plus the terminating empty page');
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

test('get_nutrition_log: absent and sample_count-0 days are not zeros and do not drag averages', async () => {
  const r = await getNutritionLog(makeCtx(), { days_back: 7 });
  assert.deepEqual(r.days.map(d => d.date), ['2026-09-04', '2026-09-03', '2026-09-02'], '09-01 absent and 08-31 (no samples) are omitted');
  assert.equal(r.days[0]!.partial, true, 'today is mid-logging');
  assert.equal(r.days[1]!.partial, undefined);
  assert.equal(r.summary.logged_days, 3);
  assert.equal(r.summary.complete_days, 2);
  // Averages over the two complete days only: (2400+2000)/2, (200+180)/2
  assert.equal(r.summary.daily_averages.calories, 2200);
  assert.equal(r.summary.daily_averages.protein_g, 190);
  assert.equal(r.summary.micro_averages.sodium_mg.avg, 2800);
  assert.equal(r.summary.micro_averages.iron_mg.avg, 12, 'null days do not count as zero');
  assert.equal(r.summary.micro_averages.iron_mg.days_with_data, 1);
  assert.equal(r.summary.micro_averages.vitamin_d_iu.avg, null);
  assert.deepEqual(r.summary.unreadable_in_current_app_build, ['vitamin_b12_mcg', 'vitamin_d_iu', 'calcium_mg', 'zinc_mg']);
  assert.ok(r.days.every(d => d.date >= r.window.since));
});

test('get_nutrition_log: empty table gives no days and null averages, not zeros', async () => {
  const { client } = createFakeSupabase({ ...tables, nutrition_days: [] });
  const r = await getNutritionLog({ db: new Db(client, U), timeZone: TZ, now: () => NOW }, { days_back: 14 });
  assert.equal(r.days.length, 0);
  assert.equal(r.summary.logged_days, 0);
  assert.equal(r.summary.daily_averages.calories, null);
});

const sleepNights = [
  // Denver (MDT, UTC-6). Bedtimes 23:00 / 23:30 local, wakes 06:00 / 07:00 local.
  { id: 'hk-sleep-2026-09-04', user_id: U, date: '2026-09-04', time_asleep_min: 420, time_in_bed_min: 450, bedtime: '2026-09-04T05:00:00Z', wake_time: '2026-09-04T12:00:00Z', deep_min: 60, rem_min: 90, core_min: 270, awake_min: 15, sample_count: 12, source: 'Apple Watch', synced_at: '2026-09-04T17:00:00Z' },
  { id: 'hk-sleep-2026-09-03', user_id: U, date: '2026-09-03', time_asleep_min: 480, time_in_bed_min: 510, bedtime: '2026-09-03T05:30:00Z', wake_time: '2026-09-03T13:00:00Z', deep_min: 80, rem_min: 110, core_min: 290, awake_min: null, sample_count: 10, source: 'Apple Watch', synced_at: '2026-09-04T17:00:00Z' },
  // iPhone-only night: no stages.
  { id: 'hk-sleep-2026-09-02', user_id: U, date: '2026-09-02', time_asleep_min: 300, time_in_bed_min: 330, bedtime: '2026-09-02T06:00:00Z', wake_time: '2026-09-02T11:30:00Z', deep_min: null, rem_min: null, core_min: null, awake_min: null, sample_count: 2, source: 'iPhone', synced_at: '2026-09-04T17:00:00Z' },
  // Nothing recorded: must not appear or count as zero.
  { id: 'hk-sleep-2026-09-01', user_id: U, date: '2026-09-01', time_asleep_min: 0, time_in_bed_min: 0, bedtime: '2026-09-01T05:00:00Z', wake_time: '2026-09-01T05:00:00Z', deep_min: null, rem_min: null, core_min: null, awake_min: null, sample_count: 0, source: 'iPhone', synced_at: '2026-09-04T17:00:00Z' },
  { id: 'hk-sleep-2026-09-03', user_id: OTHER, date: '2026-09-03', time_asleep_min: 60, time_in_bed_min: 60, bedtime: '2026-09-03T05:00:00Z', wake_time: '2026-09-03T06:00:00Z', deep_min: null, rem_min: null, core_min: null, awake_min: null, sample_count: 1, source: 'iPhone', synced_at: null },
  // Outside a 7-day window.
  { id: 'hk-sleep-2026-08-20', user_id: U, date: '2026-08-20', time_asleep_min: 100, time_in_bed_min: 100, bedtime: '2026-08-20T05:00:00Z', wake_time: '2026-08-20T07:00:00Z', deep_min: null, rem_min: null, core_min: null, awake_min: null, sample_count: 3, source: 'iPhone', synced_at: null },
];

test('get_sleep_log: nights newest first, no-sample nights omitted, stage averages over staged nights only', async () => {
  const { client } = createFakeSupabase({ ...tables, sleep_nights: sleepNights });
  const r = await getSleepLog({ db: new Db(client, U), timeZone: TZ, now: () => NOW }, { days_back: 7 });
  assert.deepEqual(r.nights.map(n => n.date), ['2026-09-04', '2026-09-03', '2026-09-02']);
  assert.equal(r.summary.nights_with_data, 3);
  assert.equal(r.summary.avg_time_asleep_min, 400);
  assert.equal(r.summary.avg_time_in_bed_min, 430);
  assert.equal(r.summary.avg_bedtime, '23:30', '(23:00 + 23:30 + 00:00) / 3, averaged around midnight');
  assert.equal(r.summary.avg_wake_time, '06:10', '(06:00 + 07:00 + 05:30) / 3');
  assert.equal(r.summary.nights_with_stages, 2);
  assert.deepEqual(r.summary.stage_averages_min, { deep: 70, rem: 100, core: 280, awake: 15 });
  assert.equal(r.nights[0]!.bedtime_local, '23:00');
  assert.equal(r.nights[0]!.wake_time_local, '06:00');
  assert.equal(r.nights[2]!.deep_min, null, 'iPhone night keeps null stages, not zeros');
  assert.equal(r.nights[2]!.source, 'iPhone');
});

test('get_sleep_log: empty table gives no nights and null averages, not zeros', async () => {
  const { client } = createFakeSupabase({ ...tables, sleep_nights: [] });
  const r = await getSleepLog({ db: new Db(client, U), timeZone: TZ, now: () => NOW }, { days_back: 14 });
  assert.equal(r.nights.length, 0);
  assert.equal(r.summary.nights_with_data, 0);
  assert.equal(r.summary.avg_time_asleep_min, null);
  assert.equal(r.summary.avg_bedtime, null);
  assert.equal(r.summary.stage_averages_min, null);
});

test('get_supplement_log: adherence per supplement over the window, inactive hidden unless taken', async () => {
  const r = await getSupplementLog(makeCtx(), { days_back: 7 });
  const creatine = r.supplements.find(s => s.name === 'Creatine')!;
  assert.equal(creatine.days_taken, 3, 'the 08-20 intake is outside the window');
  assert.equal(creatine.days_in_window, 7);
  assert.equal(creatine.adherence_pct, 43);
  assert.equal(creatine.taken_today, true);
  assert.equal(creatine.last_taken, '2026-09-04');
  const vitD = r.supplements.find(s => s.name === 'Vitamin D')!;
  assert.equal(vitD.days_taken, 1);
  assert.equal(vitD.taken_today, false);
  assert.equal(r.supplements.some(s => s.name === 'Old Thing'), false, 'inactive with no intakes is omitted');
  assert.deepEqual(r.intakes_by_day.map(d => [d.date, d.taken]), [
    ['2026-09-04', ['Creatine']],
    ['2026-09-03', ['Creatine', 'Vitamin D']],
    ['2026-09-02', ['Creatine']],
  ]);
  assert.equal(r.intakes_by_day[0]!.partial, true);
});

test('MCP: lists all tools as read-only and executes one', async () => {
  const { client, close } = await connectClient(makeCtx());
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map(t => t.name).sort(),
      ['describe_schema', 'get_body_weight_log', 'get_exercise_history', 'get_favorite_exercises', 'get_nutrition_log', 'get_prs', 'get_recent_workouts', 'get_sleep_log', 'get_supplement_log', 'get_weekly_volume', 'search_exercises'],
    );
    assert.ok(tools.every(t => t.annotations?.readOnlyHint === true));

    const result = await client.callTool({ name: 'get_recent_workouts', arguments: { limit: 1 } });
    assert.notEqual(result.isError, true);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]!.text) as { workouts: Array<{ id: string }> };
    assert.equal(parsed.workouts[0]!.id, 'w5');
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

test('body weights fall back to typed (type, value) rows when the weight column is missing', async () => {
  const typedRows = [
    { id: 't1', user_id: U, date: '2026-09-01', type: 'weight', value: 180.5, source: 'manual' },
    { id: 't2', user_id: U, date: '2026-08-20', type: 'waist', value: 33, source: 'manual' },
    { id: 't3', user_id: U, date: '2026-08-15', type: 'weight', value: 183, source: 'manual' },
  ];
  const { client, queryLog } = createFakeSupabase(
    { ...tables, body_measurements: typedRows },
    { missingColumns: { body_measurements: ['weight', 'body_fat_percentage'] } },
  );
  const db = new Db(client, U);
  const r = await getBodyWeightLog({ db, timeZone: TZ }, { limit: 10 });
  assert.deepEqual(r.entries.map(e => [e.date, e.weight_lbs]), [['2026-09-01', 180.5], ['2026-08-15', 183]]);
  const before = queryLog.length;
  const all = await db.listAllBodyWeights();
  assert.equal(all.length, 2);
  assert.equal(queryLog.length - before, 2, 'typed shape is remembered: one page plus the terminating empty page, no failed flat attempt');
});

test('get_prs: exercises with only high-rep sets rank by heaviest load, below any e1RM', async () => {
  const rows = [
    ...tables.workout_sets,
    // Sit-ups: 50 lb x 28 reps only. Epley would say 96.7; not a 1RM estimate.
    { id: 'x1', user_id: U, workout_id: 'w1', exercise_id: 'e8', weight: 50, reps: 28, logged_at: '2026-09-02T16:00:00Z' },
    // Heavy carry: 300 lb x 20 reps only.
    { id: 'x2', user_id: U, workout_id: 'w1', exercise_id: 'e9', weight: 300, reps: 20, logged_at: '2026-09-02T16:05:00Z' },
  ];
  const exercises = [
    ...tables.exercises,
    { id: 'e8', user_id: U, name: 'Sit Ups', base_name: null, primary_muscle_groups: ['abs'], secondary_muscle_groups: [], equipment: 'other', is_favorite: false },
    { id: 'e9', user_id: U, name: 'Farmer Carry', base_name: null, primary_muscle_groups: ['forearms'], secondary_muscle_groups: [], equipment: 'dumbbell', is_favorite: false },
  ];
  const { client } = createFakeSupabase({ ...tables, workout_sets: rows, exercises });
  const r = await getPrs({ db: new Db(client, U), timeZone: TZ }, { limit: 20 });
  const ids = r.prs.map(p => p.exercise_id);
  const sitUps = r.prs.find(p => p.exercise_id === 'e8')!;
  assert.equal(sitUps.best_e1rm_epley, null);
  assert.equal(sitUps.heaviest_set?.weight_lbs, 50);
  // every exercise with an e1RM ranks above the high-rep-only ones
  const lastWithE1rm = Math.max(...r.prs.map((p, i) => (p.best_e1rm_epley ? i : -1)));
  assert.ok(ids.indexOf('e9') > lastWithE1rm && ids.indexOf('e8') > lastWithE1rm);
  assert.ok(ids.indexOf('e9') < ids.indexOf('e8'), '300 lb carry outranks 50 lb sit-ups by load');
  assert.match(r.e1rm_note, /15 reps or fewer/);
});

test('get_prs survives an unreadable body-weight table', async () => {
  const r = await getPrs(makeCtx({ failing: { body_measurements: 'column body_measurements.weight does not exist' } }), { limit: 10 });
  assert.match(r.body_weight_basis, /could not be read/);
  assert.ok(r.prs.some(p => p.exercise_id === 'e1'), 'weighted exercises still ranked');
  const pullUp = r.prs.find(p => p.exercise_id === 'e6')!;
  assert.equal(pullUp.load_basis, 'reps_only');
});

test('MCP: a missing-column error names the actual columns', async () => {
  const ctx = {
    ...makeCtx({ failing: { body_measurements: 'column body_measurements.weight does not exist' } }),
    describeSchema: async () => ({ body_measurements: { id: 'uuid', user_id: 'uuid', date: 'date', weight_lbs: 'numeric' } }),
  };
  const { client, close } = await connectClient(ctx);
  try {
    const result = await client.callTool({ name: 'get_body_weight_log', arguments: {} });
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    assert.match(text, /Actual columns of body_measurements: date, id, user_id, weight_lbs/);
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
