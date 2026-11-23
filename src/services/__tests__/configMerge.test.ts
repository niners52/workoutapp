import { mergeRows, workoutsDeletedInCloud } from '../configMerge';

type Row = { id: string; name: string; exerciseIds?: string[]; notes?: string; localOnly?: string; updatedAt?: string };

const T0 = '2026-11-20T10:00:00Z';
const T1 = '2026-11-23T10:00:00Z';
const T2 = '2026-11-23T12:00:00Z';

const base = (over: Partial<Parameters<typeof mergeRows<Row>>[0]> = {}) => ({
  local: [] as Row[],
  changed: [],
  cloudIds: null,
  stamps: {},
  pending: new Set<string>(),
  firstPull: false,
  ...over,
});

describe('config pull merge', () => {
  test('a template changed in the cloud since it was last seen replaces the local one (verify 1)', () => {
    const r = mergeRows<Row>(
      base({
        local: [{ id: 't1', name: 'Full Body 1', exerciseIds: ['a', 'b'], localOnly: 'keep me' }],
        changed: [{ id: 't1', updatedAt: T2, value: { id: 't1', name: 'Full Body 1', exerciseIds: ['a', 'c'], updatedAt: T2 } }],
        stamps: { t1: T1 },
        cloudFields: ['notes'],
      }),
    );
    expect(r.updated).toEqual(['t1']);
    expect(r.rows[0]).toEqual({ id: 't1', name: 'Full Body 1', exerciseIds: ['a', 'c'], localOnly: 'keep me', updatedAt: T2 });
    expect(r.stamps.t1).toBe(T2);
  });

  test('a pending local edit wins over the cloud (verify 2)', () => {
    const r = mergeRows<Row>(
      base({
        local: [{ id: 't1', name: 'Mine', exerciseIds: ['x'] }],
        changed: [{ id: 't1', updatedAt: T2, value: { id: 't1', name: 'Cloud', exerciseIds: ['y'] } }],
        stamps: { t1: T1 },
        pending: new Set(['t1']),
      }),
    );
    expect(r.rows[0]!.name).toBe('Mine');
    expect(r.changed).toBe(false);
    expect(r.stamps.t1).toBe(T1); // the queue's push will record the new stamp
  });

  test('a row deleted in the cloud goes, if this phone had seen it there (verify 3)', () => {
    const r = mergeRows<Row>(
      base({
        local: [{ id: 'e1', name: 'Old' }, { id: 'e2', name: 'Keep' }, { id: 'e3', name: 'Never uploaded' }],
        cloudIds: new Set(['e2']),
        stamps: { e1: T0, e2: T0 },
      }),
    );
    expect(r.deleted).toEqual(['e1']);
    expect(r.rows.map(x => x.id)).toEqual(['e2', 'e3']);
    expect(r.stamps).toEqual({ e2: T0 });
  });

  test('a pending row is never deleted', () => {
    const r = mergeRows<Row>(base({ local: [{ id: 'e1', name: 'x' }], cloudIds: new Set(), stamps: { e1: T0 }, pending: new Set(['e1']) }));
    expect(r.deleted).toEqual([]);
  });

  test('the first pull is a baseline: local rows win, cloud-only rows arrive, everything is stamped', () => {
    const r = mergeRows<Row>(
      base({
        firstPull: true,
        local: [{ id: 't1', name: 'Phone' }],
        changed: [
          { id: 't1', updatedAt: T1, value: { id: 't1', name: 'Cloud' } },
          { id: 't9', updatedAt: T1, value: { id: 't9', name: 'Made by Claude' } },
        ],
        cloudIds: new Set(['t1', 't9']),
      }),
    );
    expect(r.rows.map(x => x.name)).toEqual(['Phone', 'Made by Claude']);
    expect(r.inserted).toEqual(['t9']);
    expect(r.stamps).toEqual({ t1: T1, t9: T1 });
  });

  test('a newer cloud row clears fields the cloud stores but no longer has', () => {
    const r = mergeRows<Row>(
      base({
        local: [{ id: 't1', name: 'x', notes: 'old note' }],
        changed: [{ id: 't1', updatedAt: T2, value: { id: 't1', name: 'x' } }],
        stamps: { t1: T1 },
        cloudFields: ['notes'],
      }),
    );
    expect(r.rows[0]).not.toHaveProperty('notes', 'old note');
  });

  test('a cloud read that would delete most of a table deletes nothing', () => {
    const local = Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, name: String(i) }));
    const stamps = Object.fromEntries(local.map(r => [r.id, T0]));
    const r = mergeRows<Row>(base({ local, cloudIds: new Set(['e0']), stamps }));
    expect(r.deleted).toEqual([]);
    expect(r.deletesSkipped).toBe(19);
    expect(r.rows).toHaveLength(20);
  });
});

describe('workouts deleted in the cloud', () => {
  const now = new Date('2026-11-23T18:00:00Z');
  const w = (id: string, startedAt: string) => ({ id, startedAt });

  test('an empty session opened by accident and deleted in the cloud goes', () => {
    const ids = workoutsDeletedInCloud({
      local: [w('keep', '2026-11-22T12:00:00Z'), w('oops', '2026-11-23T09:00:00Z')],
      cloudIds: new Set(['keep']),
      stamps: { keep: T0, oops: T1 },
      pending: new Set(),
      now,
    });
    expect(ids).toEqual(['oops']);
  });

  test('kept: the workout in progress, one under 10 minutes old, one never seen in the cloud, one with pending uploads, one older than 14 days', () => {
    const ids = workoutsDeletedInCloud({
      local: [
        w('active', '2026-11-23T17:00:00Z'),
        w('fresh', '2026-11-23T17:55:00Z'),
        w('unseen', '2026-11-22T12:00:00Z'),
        w('pending', '2026-11-21T12:00:00Z'),
        w('old', '2026-10-01T12:00:00Z'),
      ],
      cloudIds: new Set(),
      stamps: { active: T1, fresh: T1, pending: T1, old: T0 },
      pending: new Set(['pending']),
      activeWorkoutId: 'active',
      now,
    });
    expect(ids).toEqual([]);
  });
});
