import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Db } from './db.js';
import { createFakeSupabase } from './fakeSupabase.js';
import { createMcpServer } from './server.js';
import type { ToolContext } from './tools.js';
import { getWeekStatus } from './weekStatus.js';

const U = 'user-1';
const TZ = 'America/Chicago';
// Thursday 2026-11-12, 6 pm Chicago. Week = Mon 2026-11-09 .. Sun 2026-11-15.
const NOW = new Date('2026-11-13T00:00:00Z');

const ex = (id: string, name: string, primary: string[], extra: Record<string, unknown> = {}) => ({
  id, user_id: U, name, base_name: null, primary_muscle_groups: primary, secondary_muscle_groups: [], equipment: 'machine',
  is_favorite: false, is_unilateral: false, location_ids: ['pf'], ...extra,
});

const set = (id: string, workout: string, exercise: string, at: string, extra: Record<string, unknown> = {}) => ({
  id, user_id: U, workout_id: workout, exercise_id: exercise, weight: 100, reps: 10, logged_at: at, ...extra,
});

function tables(rotation: unknown = undefined) {
  return {
    exercises: [
      ex('incline', 'Incline Press', ['chest']),
      ex('pulldown', 'Lat Pulldown', ['lats']),
      ex('leg-press', 'Leg Press', ['quads']),
      ex('row', 'Seated Row', ['mid_back']),
      ex('shrug', 'Shrug', ['traps']),
      ex('curl', 'Curl', ['biceps']),
      ex('calf', 'Calf Raise', ['calves']),
      ex('cuff', 'Rotator Cuff', ['rotator_cuff'], { default_warmup: true }),
      ex('vasa-row', 'Vasa ISO Row', ['mid_back'], { location_ids: ['vasa'] }),
    ],
    templates: [
      { id: 'fb1', user_id: U, name: 'Full Body 1', location_id: 'pf', exercise_ids: ['incline', 'pulldown', 'leg-press', 'cuff'] },
      { id: 'fb2', user_id: U, name: 'Full Body 2', location_id: 'pf', exercise_ids: ['row', 'shrug', 'curl'] },
      { id: 'fb3', user_id: U, name: 'Full Body 3', location_id: 'pf', exercise_ids: ['incline', 'calf'] },
      { id: 'flex', user_id: U, name: 'Flex — day 6', location_id: 'vasa', exercise_ids: ['vasa-row', 'calf'] },
    ],
    routines: [
      {
        id: 'r1', user_id: U, name: 'Five days', is_active: true,
        day_schedule: [
          { day: 1, templateIds: ['fb1'] },
          { day: 2, templateIds: ['fb2'] },
          { day: 3, templateIds: ['fb3'] },
          { day: 6, templateIds: ['flex'] },
        ],
        ...(rotation === undefined ? {} : { rotation }),
      },
    ],
    workout_locations: [
      { id: 'pf', user_id: U, name: 'Planet Fitness ' },
      { id: 'vasa', user_id: U, name: 'Vasa' },
    ],
    workouts: [
      // Mon W1 without the leg press; Tue W2 plus the leg press moved over, shrug skipped.
      { id: 'mon', user_id: U, template_id: 'fb1', started_at: '2026-11-09T12:00:00Z', completed_at: '2026-11-09T13:00:00Z', location_id: 'pf', is_deload: false },
      { id: 'tue', user_id: U, template_id: 'fb2', started_at: '2026-11-10T12:00:00Z', completed_at: '2026-11-10T13:00:00Z', location_id: 'pf', is_deload: false },
      // Last Sunday 11:30 pm Chicago — the week before, not this one.
      { id: 'lastsun', user_id: U, template_id: 'fb3', started_at: '2026-11-09T05:30:00Z', completed_at: '2026-11-09T05:50:00Z', location_id: 'pf', is_deload: false },
      { id: 'oldvasa', user_id: U, template_id: null, started_at: '2026-10-03T15:00:00Z', completed_at: '2026-10-03T16:00:00Z', location_id: 'vasa', is_deload: false },
    ],
    workout_sets: [
      set('m1', 'mon', 'incline', '2026-11-09T12:05:00Z'),
      set('m2', 'mon', 'incline', '2026-11-09T12:08:00Z'),
      set('m3', 'mon', 'pulldown', '2026-11-09T12:15:00Z'),
      set('m4', 'mon', 'cuff', '2026-11-09T12:01:00Z'),
      set('t1', 'tue', 'row', '2026-11-10T12:05:00Z'),
      set('t2', 'tue', 'curl', '2026-11-10T12:10:00Z'),
      set('t3', 'tue', 'leg-press', '2026-11-10T12:20:00Z'),
      set('s1', 'lastsun', 'calf', '2026-11-09T05:35:00Z'),
      set('v1', 'oldvasa', 'curl', '2026-10-03T15:10:00Z'),
    ],
    user_settings: [
      {
        user_id: U, week_start_day: 'monday',
        muscle_group_targets: { chest: 6, lats: 6, quads: 6, mid_back: 6, traps: 6, biceps: 6, calves: 3 },
        health_targets: { flexMinutes: 60 },
      },
    ],
  };
}

function makeCtx(rotation?: unknown): ToolContext {
  const { client } = createFakeSupabase(tables(rotation));
  return { db: new Db(client, U), timeZone: TZ, now: () => NOW };
}

test('week status: rotation derived from the weekday schedule when the routine has none stored', async () => {
  const r = await getWeekStatus(makeCtx(), {});
  assert.deepEqual(r.rotation.map(s => [s.slot, s.template, s.performed]), [
    ['W1', 'Full Body 1', true],
    ['W2', 'Full Body 2', true],
    ['W3', 'Full Body 3', false],
  ]);
  assert.deepEqual(r.next_up, { slot: 'W3', template: 'Full Body 3' });
  assert.equal(r.week_start, '2026-11-09');
});

test('week status: a late-Sunday-night session belongs to the previous week', async () => {
  const r = await getWeekStatus(makeCtx(), {});
  // W3 ran Sunday 11:30 pm the week before; this week it has not.
  assert.equal(r.rotation.find(s => s.slot === 'W3')?.performed, false);
  assert.equal(r.sets_vs_target.find(m => m.muscle === 'calves')?.sets, 0);
});

test('week status: owed list — moved exercise credited, skipped one owed, prep never', async () => {
  const r = await getWeekStatus(makeCtx(), {});
  const owed = r.owed.map(o => [o.from, o.exercise, o.source, o.tier]);
  assert.deepEqual(owed, [
    ['W2', 'Shrug', 'skipped', 'build'],
    ['W3', 'Incline Press', 'unperformed', 'build'],
    ['W3', 'Calf Raise', 'unperformed', 'covered'],
  ]);
});

test('week status: a stored rotation wins over the weekday schedule', async () => {
  const r = await getWeekStatus(
    makeCtx({ slots: [{ id: 'w1', label: 'W1', templateId: 'fb2', usualDay: null }, { id: 'w2', label: 'W2', templateId: 'fb1', usualDay: null }], flexTemplateId: 'flex' }),
    {},
  );
  assert.deepEqual(r.rotation.map(s => s.template), ['Full Body 2', 'Full Body 1']);
});

test('week status: Flex at Vasa substitutes and fills in priority order under the cap', async () => {
  const r = await getWeekStatus(makeCtx(), { location: 'vasa' });
  assert.equal(r.flex_plan.location, 'Vasa');
  assert.equal(r.flex_plan.cap_minutes, 60);
  const items = r.flex_plan.items.map(i => [i.priority, i.exercise, i.instead_of ?? null]);
  // a) owed build: Shrug (no Vasa history, no Vasa trap exercise: kept, flagged), Incline (same).
  assert.deepEqual(items.filter(([p]) => p === 'a').map(([, e]) => e), ['Shrug', 'Incline Press']);
  // b) Flex default: Vasa ISO Row (mid back 1 of 6) and Calf Raise (calves 0 of 3).
  assert.deepEqual(items.filter(([p]) => p === 'b').map(([, e]) => e), ['Vasa ISO Row', 'Calf Raise']);
  assert.ok(r.flex_plan.total_minutes <= 60);
});

test('week status: an unknown location is a readable error', async () => {
  await assert.rejects(() => getWeekStatus(makeCtx(), { location: 'Gold\'s' }), /Unknown location "Gold's"\. Known: Planet Fitness, Vasa/);
});

test('MCP: get_week_status is registered and validates input', async () => {
  const server = createMcpServer(makeCtx());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const tools = await client.listTools();
    assert.ok(tools.tools.some(t => t.name === 'get_week_status'));
    const ok = await client.callTool({ name: 'get_week_status', arguments: { location: 'Planet Fitness' } });
    assert.notEqual(ok.isError, true);
    const bad = await client.callTool({ name: 'get_week_status', arguments: { location: '' } });
    assert.equal(bad.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
