import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSleepNights, mergedMinutes, nightDateFor, sourcePriority } from './sleepNights.ts';

const TZ = 'America/Chicago';
const AT = '2026-09-12T15:00:00Z';

test('nightDateFor keys a segment to the local morning it ends on', () => {
  // 11:30 PM Sep 10 Chicago (CDT, UTC-5) -> belongs to the Sep 11 night.
  assert.equal(nightDateFor('2026-09-11T04:30:00Z', TZ), '2026-09-11');
  // 6:30 AM Sep 11 Chicago -> Sep 11.
  assert.equal(nightDateFor('2026-09-11T11:30:00Z', TZ), '2026-09-11');
  // 3:00 PM Sep 11 Chicago (afternoon nap) -> still Sep 11.
  assert.equal(nightDateFor('2026-09-11T20:00:00Z', TZ), '2026-09-11');
  // 7:00 PM Sep 11 Chicago (early evening) -> Sep 12.
  assert.equal(nightDateFor('2026-09-12T00:00:00Z', TZ), '2026-09-12');
});

test('a night spanning midnight becomes exactly one row on the wake date', () => {
  const w = 'Tyler’s Apple Watch';
  const rows = buildSleepNights(
    [
      { value: 'INBED', startDate: '2026-09-11T02:50:00Z', endDate: '2026-09-11T11:40:00Z', sourceName: w },
      { value: 'CORE', startDate: '2026-09-11T03:00:00Z', endDate: '2026-09-11T05:00:00Z', sourceName: w }, // 120
      { value: 'DEEP', startDate: '2026-09-11T05:00:00Z', endDate: '2026-09-11T06:30:00Z', sourceName: w }, // 90
      { value: 'AWAKE', startDate: '2026-09-11T06:30:00Z', endDate: '2026-09-11T06:40:00Z', sourceName: w }, // 10
      { value: 'CORE', startDate: '2026-09-11T06:40:00Z', endDate: '2026-09-11T10:30:00Z', sourceName: w }, // 230
      { value: 'REM', startDate: '2026-09-11T10:30:00Z', endDate: '2026-09-11T11:30:00Z', sourceName: w }, // 60
    ],
    TZ,
    AT,
  );
  assert.equal(rows.length, 1);
  const n = rows[0];
  assert.equal(n.date, '2026-09-11');
  assert.equal(n.id, 'hk-sleep-2026-09-11');
  assert.equal(n.time_asleep_min, 500);
  assert.equal(n.awake_min, 10);
  assert.equal(n.deep_min, 90);
  assert.equal(n.rem_min, 60);
  assert.equal(n.core_min, 350);
  assert.equal(n.time_in_bed_min, 530);
  assert.equal(n.bedtime, '2026-09-11T03:00:00.000Z');
  assert.equal(n.wake_time, '2026-09-11T11:30:00.000Z');
  assert.equal(n.sample_count, 6);
  assert.equal(n.source, w);
  assert.equal(n.synced_at, AT);
});

test('Watch and iPhone recording the same night: Watch wins, sources are never summed', () => {
  const rows = buildSleepNights(
    [
      { value: 'INBED', startDate: '2026-09-11T03:00:00Z', endDate: '2026-09-11T11:00:00Z', sourceName: 'iPhone' },
      { value: 'ASLEEP', startDate: '2026-09-11T03:00:00Z', endDate: '2026-09-11T10:00:00Z', sourceName: 'iPhone' }, // 420
      { value: 'CORE', startDate: '2026-09-11T03:15:00Z', endDate: '2026-09-11T10:00:00Z', sourceName: 'Apple Watch' }, // 405
    ],
    TZ,
    AT,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'Apple Watch');
  assert.equal(rows[0].time_asleep_min, 405);
  assert.equal(rows[0].sample_count, 1);
  assert.equal(rows[0].awake_min, null);
});

test('iPhone-only night has null stages and in-bed from INBED samples', () => {
  const rows = buildSleepNights(
    [
      { value: 'INBED', startDate: '2026-09-11T03:00:00Z', endDate: '2026-09-11T11:00:00Z', sourceName: 'iPhone' }, // 480
      { value: 'ASLEEP', startDate: '2026-09-11T03:20:00Z', endDate: '2026-09-11T10:40:00Z', sourceName: 'iPhone' }, // 440
    ],
    TZ,
    AT,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].time_asleep_min, 440);
  assert.equal(rows[0].time_in_bed_min, 480);
  assert.equal(rows[0].deep_min, null);
  assert.equal(rows[0].rem_min, null);
  assert.equal(rows[0].core_min, null);
  assert.equal(rows[0].awake_min, null);
});

test('overlapping duplicate samples are merged, not double counted', () => {
  assert.equal(
    mergedMinutes([
      { start: 0, end: 30 * 60000 },
      { start: 10 * 60000, end: 40 * 60000 },
      { start: 45 * 60000, end: 50 * 60000 },
      { start: 45 * 60000, end: 50 * 60000 },
    ]),
    45,
  );
  const rows = buildSleepNights(
    [
      { value: 'ASLEEP', startDate: '2026-09-11T04:00:00Z', endDate: '2026-09-11T06:00:00Z', sourceName: 'iPhone' },
      { value: 'ASLEEP', startDate: '2026-09-11T05:00:00Z', endDate: '2026-09-11T07:00:00Z', sourceName: 'iPhone' },
      { value: 'ASLEEP', startDate: '2026-09-11T04:00:00Z', endDate: '2026-09-11T06:00:00Z', sourceName: 'iPhone' },
    ],
    TZ,
    AT,
  );
  assert.equal(rows[0].time_asleep_min, 180);
  assert.equal(rows[0].sample_count, 3);
});

test('two nights come out as two rows, newest first; in-bed-only night is skipped', () => {
  const rows = buildSleepNights(
    [
      { value: 'ASLEEP', startDate: '2026-09-10T04:00:00Z', endDate: '2026-09-10T11:00:00Z', sourceName: 'iPhone' },
      { value: 'ASLEEP', startDate: '2026-09-11T04:00:00Z', endDate: '2026-09-11T11:00:00Z', sourceName: 'iPhone' },
      { value: 'INBED', startDate: '2026-09-12T04:00:00Z', endDate: '2026-09-12T11:00:00Z', sourceName: 'iPhone' },
    ],
    TZ,
    AT,
  );
  assert.deepEqual(rows.map(r => r.date), ['2026-09-11', '2026-09-10']);
});

test('source priority: Watch, then iPhone, then anything else', () => {
  assert.equal(sourcePriority('Tyler’s Apple Watch'), 0);
  assert.equal(sourcePriority('iPhone'), 1);
  assert.equal(sourcePriority('AutoSleep'), 2);
  assert.equal(sourcePriority(undefined), 2);
});
