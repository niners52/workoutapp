/**
 * Merge rules for pulling config rows (exercises, templates, routines,
 * locations, body measurements) from the cloud. Pure; configPull.ts does the
 * reading and writing.
 *
 * Per row, with `seen` = the cloud updated_at this phone last saw (cloudStamps):
 * - cloud only: insert locally.
 * - both, and the row has a pending upsert: keep local (an edit not yet
 *   uploaded wins; the queue will push it).
 * - both, seen before: take the cloud row if its updated_at is past `seen`.
 * - both, never seen: on the first pull keep local (the phone has been the
 *   source of truth until now); after that, take the cloud row if it is newer
 *   than the local updatedAt.
 * - local only: delete locally if it was seen in the cloud before (so it was
 *   deleted there) and has no pending upsert. A row never seen in the cloud is
 *   new here and stays.
 *
 * Deletions are skipped entirely when they would remove more than
 * MAX_DELETE_SHARE of the table (and more than MAX_DELETE_FLOOR rows): a
 * partial cloud read must not wipe the phone.
 */
/** a is strictly later than b (both ISO; false when either is missing). */
export const isAfter = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && new Date(a).getTime() > new Date(b).getTime();

export const MAX_DELETE_SHARE = 0.2;
export const MAX_DELETE_FLOOR = 5;

export interface CloudRow<T> {
  id: string;
  updatedAt: string;
  /** The row in local shape. */
  value: T;
}

export interface MergeInput<T extends { id: string; updatedAt?: string }> {
  local: T[];
  /** Cloud rows changed since the last pull (every row on the first pull). */
  changed: CloudRow<T>[];
  /** Every id the cloud has for this table; null when it could not be read (no deletes then). */
  cloudIds: Set<string> | null;
  stamps: Record<string, string>;
  /** Ids with an upsert waiting in the sync queue. */
  pending: Set<string>;
  firstPull: boolean;
  /** Cloud-stored optional fields: cleared locally when the newer cloud row lacks them. */
  cloudFields?: string[];
}

export interface MergeResult<T> {
  rows: T[];
  inserted: string[];
  updated: string[];
  deleted: string[];
  /** Deletes held back by the safety cap. */
  deletesSkipped: number;
  stamps: Record<string, string>;
  changed: boolean;
}

export function mergeRows<T extends { id: string; updatedAt?: string }>(input: MergeInput<T>): MergeResult<T> {
  const byId = new Map(input.local.map(r => [r.id, r]));
  const stamps = { ...input.stamps };
  const inserted: string[] = [];
  const updated: string[] = [];

  for (const c of input.changed) {
    if (input.pending.has(c.id)) continue; // local edit not uploaded yet wins
    const local = byId.get(c.id);
    const seen = input.stamps[c.id];
    if (!local) {
      byId.set(c.id, c.value);
      inserted.push(c.id);
    } else {
      const takeCloud = seen ? isAfter(c.updatedAt, seen) : !input.firstPull && isAfter(c.updatedAt, local.updatedAt ?? '1970-01-01T00:00:00Z');
      if (takeCloud) {
        const cleared = Object.fromEntries((input.cloudFields ?? []).map(f => [f, undefined]));
        byId.set(c.id, { ...local, ...cleared, ...c.value });
        updated.push(c.id);
      }
    }
    stamps[c.id] = c.updatedAt;
  }

  let deleted: string[] = [];
  let deletesSkipped = 0;
  if (input.cloudIds) {
    const gone = [...byId.keys()].filter(id => !input.cloudIds!.has(id) && input.stamps[id] && !input.pending.has(id));
    if (gone.length > MAX_DELETE_FLOOR && gone.length > input.local.length * MAX_DELETE_SHARE) {
      deletesSkipped = gone.length;
    } else {
      deleted = gone;
      for (const id of gone) byId.delete(id);
    }
    // Forget stamps for rows the cloud no longer has.
    for (const id of Object.keys(stamps)) if (!input.cloudIds.has(id)) delete stamps[id];
  }

  // Keep local order; new rows at the end.
  const order = [...input.local.map(r => r.id).filter(id => byId.has(id)), ...inserted];
  const rows = [...new Set(order)].map(id => byId.get(id)!);
  return {
    rows,
    inserted,
    updated,
    deleted,
    deletesSkipped,
    stamps,
    changed: inserted.length + updated.length + deleted.length > 0,
  };
}

/**
 * Workouts deleted in the cloud: a local workout from the last `windowDays`
 * that the cloud no longer has, that this phone saw in the cloud before, has
 * nothing pending (itself or its sets), is not the workout in progress, and
 * started more than `minAgeMs` ago.
 */
export function workoutsDeletedInCloud(input: {
  local: Array<{ id: string; startedAt: string }>;
  cloudIds: Set<string>;
  stamps: Record<string, string>;
  pending: Set<string>;
  activeWorkoutId?: string | null;
  now: Date;
  windowDays?: number;
  minAgeMs?: number;
}): string[] {
  const windowStart = input.now.getTime() - (input.windowDays ?? 14) * 24 * 60 * 60 * 1000;
  const newest = input.now.getTime() - (input.minAgeMs ?? 10 * 60 * 1000);
  const recent = input.local.filter(w => {
    const t = new Date(w.startedAt).getTime();
    return t >= windowStart && t <= newest;
  });
  const gone = recent.filter(
    w => !input.cloudIds.has(w.id) && !!input.stamps[w.id] && !input.pending.has(w.id) && w.id !== input.activeWorkoutId,
  );
  // Same guard as config tables: a bad read must not empty two weeks of training.
  if (gone.length > MAX_DELETE_FLOOR && gone.length > recent.length * MAX_DELETE_SHARE) return [];
  return gone.map(w => w.id);
}
