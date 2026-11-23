import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Db, missingColumns, REQUIRED_COLUMNS } from './db.js';
import { createFakeSupabase } from './fakeSupabase.js';
import { getDailyHealthMetrics, getGoals, getInbodyScans, getPainLog, type ToolContext } from './tools.js';

const U = 'user-1';
const OTHER = 'user-2';

const tables = {
  daily_health_metrics: [
    { id: 'hk-day-2026-11-22', user_id: U, date: '2026-11-22', vo2_max: '44.6', resting_hr: 53, hrv_sdnn_ms: 70, steps: 8500, active_energy_kcal: 512, bp_systolic: null, bp_diastolic: null, source: 'healthkit', synced_at: null },
    { id: 'hk-day-2026-11-21', user_id: U, date: '2026-11-21', vo2_max: null, resting_hr: 55, hrv_sdnn_ms: 61, steps: 12000, active_energy_kcal: 700, bp_systolic: 118, bp_diastolic: 76, source: 'healthkit', synced_at: null },
    { id: 'hk-day-2026-11-20', user_id: U, date: '2026-11-20', vo2_max: null, resting_hr: 54, hrv_sdnn_ms: 66, steps: 9000, active_energy_kcal: 600, bp_systolic: null, bp_diastolic: null, source: 'healthkit', synced_at: null },
    { id: 'x', user_id: OTHER, date: '2026-11-23', vo2_max: 60, resting_hr: 40, hrv_sdnn_ms: 100, steps: 1, active_energy_kcal: 1, bp_systolic: null, bp_diastolic: null, source: 'healthkit', synced_at: null },
  ],
  workout_hr_zones: [
    { id: 'hk-zones-A', user_id: U, hk_workout_id: 'A', workout_id: 'w1', activity_name: 'Traditional Strength Training', start_at: '2026-11-22T12:00:00Z', end_at: '2026-11-22T13:00:00Z', duration_min: 60, max_hr_used: 185, avg_hr: 118, peak_hr: 160, z1_min: 20, z2_min: 25, z3_min: 10, z4_min: 2, z5_min: 0 },
    { id: 'hk-zones-old', user_id: U, hk_workout_id: 'old', workout_id: null, activity_name: 'Walking', start_at: '2026-11-01T12:00:00Z', end_at: '2026-11-01T13:00:00Z', duration_min: 60, max_hr_used: 185, avg_hr: 90, peak_hr: 100, z1_min: 10, z2_min: 0, z3_min: 0, z4_min: 0, z5_min: 0 },
  ],
  body_measurements: [
    { id: 'scan', user_id: U, date: '2026-11-23', weight: 181.5, body_fat_percentage: 9, skeletal_muscle_lbs: 93.3, lean_mass_lbs: 165.1, visceral_fat_area: 33.5, ecw_tbw: 0.383, phase_angle: 6.5, scan_type: 'inbody', source: 'manual' },
    { id: 'plain', user_id: U, date: '2026-11-21', weight: 175.3, body_fat_percentage: null, skeletal_muscle_lbs: null, lean_mass_lbs: null, visceral_fat_area: null, ecw_tbw: null, phase_angle: null, scan_type: null, source: 'healthkit' },
  ],
  goals: [
    { id: 'g2', user_id: U, type: 'lift', metric_key: 'plate-loaded-incline-press', label: 'Plate-Loaded Incline', target: '300', target_max: null, target_reps: 6, direction: 'at_least', target_date: null, sort_order: 20, is_active: true },
    { id: 'g1', user_id: U, type: 'weight_band', metric_key: 'weight', label: 'Body weight', target: '175', target_max: '179', target_reps: null, direction: 'band', target_date: null, sort_order: 0, is_active: true },
    { id: 'g3', user_id: U, type: 'measurement', metric_key: 'chest', label: 'Old', target: 40, target_max: null, target_reps: null, direction: 'at_least', target_date: null, sort_order: 1, is_active: false },
  ],
  pain_log: [
    { id: 'p1', user_id: U, date: '2026-11-18', area: 'elbow', side: 'left', score: 4, note: 'pushdowns' },
    { id: 'p2', user_id: U, date: '2026-11-21', area: 'knee', side: 'right', score: 2, note: null },
    { id: 'p3', user_id: OTHER, date: '2026-11-22', area: 'neck', side: 'both', score: 9, note: null },
  ],
};

const ctx = (): ToolContext => {
  const { client } = createFakeSupabase(tables);
  return { db: new Db(client, U), timeZone: 'America/Chicago', now: () => new Date('2026-11-23T18:00:00Z') };
};

test('get_daily_health_metrics: newest days first, numbers as numbers, workouts in the span with zone minutes', async () => {
  const r = await getDailyHealthMetrics(ctx(), { limit: 2 });
  assert.deepEqual(r.days.map(d => d.date), ['2026-11-22', '2026-11-21']);
  assert.equal(r.days[0]!.vo2_max, 44.6);
  assert.equal(r.days[1]!.bp_systolic, 118);
  assert.deepEqual(r.workouts.map(w => w.start), ['2026-11-22T12:00:00Z']);
  assert.deepEqual(r.workouts[0]!.zone_minutes, { z1: 20, z2: 25, z3: 10, z4: 2, z5: 0 });
});

test('get_inbody_scans: scan rows only', async () => {
  const r = await getInbodyScans(ctx(), { limit: 10 });
  assert.equal(r.scans.length, 1);
  assert.deepEqual(r.scans[0], {
    date: '2026-11-23', scan_type: 'inbody', weight_lbs: 181.5, body_fat_percentage: 9, skeletal_muscle_lbs: 93.3,
    lean_mass_lbs: 165.1, visceral_fat_area_cm2: 33.5, ecw_tbw: 0.383, phase_angle_deg: 6.5,
  });
});

test('get_goals: active goals in order, band high and lift reps carried', async () => {
  const r = await getGoals(ctx());
  assert.deepEqual(r.goals.map(g => g.label), ['Body weight', 'Plate-Loaded Incline']);
  assert.equal(r.goals[0]!.target_max, 179);
  assert.equal(r.goals[1]!.target_reps, 6);
  assert.equal(r.goals[1]!.target, 300);
});

test('get_pain_log: this user, newest first', async () => {
  const r = await getPainLog(ctx(), { limit: 30 });
  assert.deepEqual(r.entries.map(e => [e.date, e.area, e.score]), [['2026-11-21', 'knee', 2], ['2026-11-18', 'elbow', 4]]);
});

test('describe_schema covers the new tables', () => {
  for (const t of ['daily_health_metrics', 'workout_hr_zones', 'goals', 'pain_log']) assert.ok(REQUIRED_COLUMNS[t], t);
  assert.ok(missingColumns({}).includes('pain_log (table not found)'));
});
