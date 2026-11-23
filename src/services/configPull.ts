/**
 * Pull config changes made outside the phone — Claude through the database,
 * the MCP server, another device — for exercises, templates, routines,
 * workout_locations, body_measurements and user_settings, plus workouts
 * deleted in the cloud in the last 14 days.
 *
 * Sync used to be push-only: such edits never reached the phone, and the next
 * push could overwrite them with stale local data. syncService's stale check
 * covers the push side; this is the pull side. Merge rules: configMerge.ts.
 *
 * Runs after launch (once the queue has flushed), on return to the foreground
 * at most every THROTTLE_MS, and on pull-to-refresh with no throttle. Rows
 * changed since the last pull are read by the cloud's updated_at (server
 * time); every id is read too, to see deletions.
 */
import { supabase } from './supabase';
import { CLOUD_OPTIONAL_FIELDS, cloudSettingsFromRow } from './cloudMappers';
import { CONFIG_TABLES, notifyCloudApplied, type ConfigTable } from './configApply';
import { isAfter, mergeRows, workoutsDeletedInCloud } from './configMerge';
import { getLastConfigPull, getStamps, laterIso, replaceStamps, setLastConfigPull, setStamps } from './cloudStamps';
import { deleteWorkout, getActiveWorkoutState, getUserSettings, getWorkouts, pulledStore } from './storage';
import { getPendingUpserts, getUserId, SETTINGS_STAMP_ID } from './syncService';

export const THROTTLE_MS = 2 * 60 * 1000;
const WORKOUT_WINDOW_DAYS = 14;
const PAGE = 1000;
const CLOCK_SKEW_MS = 5000;

export interface ConfigPullResult {
  ran: boolean;
  changed: boolean;
  /** Per table: inserted / updated / deleted ids, and deletes held back by the safety cap. */
  tables: Record<string, { inserted: number; updated: number; deleted: number; deletesSkipped: number }>;
  workoutsDeleted: number;
  settingsUpdated: boolean;
  error?: string;
}

let lastRunAt = 0;
let inFlight: Promise<ConfigPullResult> | null = null;

/** Every row of a table for this user, optionally only those updated after `since`. */
async function selectPaged(table: string, userId: string, columns: string, since?: string | null): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).eq('user_id', userId);
    if (since) q = q.gt('updated_at', since);
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export function pullConfigFromCloud({ force = false, now = new Date() }: { force?: boolean; now?: Date } = {}): Promise<ConfigPullResult> {
  if (inFlight) return inFlight;
  if (!force && now.getTime() - lastRunAt < THROTTLE_MS) {
    return Promise.resolve({ ran: false, changed: false, tables: {}, workoutsDeleted: 0, settingsUpdated: false });
  }
  lastRunAt = now.getTime();
  inFlight = run(now).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(now: Date): Promise<ConfigPullResult> {
  const result: ConfigPullResult = { ran: true, changed: false, tables: {}, workoutsDeleted: 0, settingsUpdated: false };
  const userId = await getUserId();
  if (!userId) return { ...result, ran: false };

  try {
    const cursor = await getLastConfigPull();
    const firstPull = !cursor;
    const { byTable: pending, workoutsWithSets } = await getPendingUpserts();
    let maxSeen: string | null = cursor;

    for (const table of Object.keys(CONFIG_TABLES) as ConfigTable[]) {
      const spec = CONFIG_TABLES[table];
      const [changedRows, idRows] = await Promise.all([
        selectPaged(table, userId, '*', cursor),
        selectPaged(table, userId, 'id'),
      ]);
      const merge = mergeRows({
        local: await spec.read(),
        changed: changedRows.filter(r => r.updated_at).map(r => ({ id: r.id, updatedAt: r.updated_at, value: spec.map(r) })),
        cloudIds: new Set(idRows.map(r => r.id)),
        stamps: await getStamps(table),
        pending: pending.get(table) ?? new Set(),
        firstPull,
        cloudFields: CLOUD_OPTIONAL_FIELDS[table],
      });
      if (merge.changed) await spec.write(merge.rows);
      await replaceStamps(table, merge.stamps);
      for (const r of changedRows) maxSeen = laterIso(maxSeen, r.updated_at);
      result.tables[table] = {
        inserted: merge.inserted.length,
        updated: merge.updated.length,
        deleted: merge.deleted.length,
        deletesSkipped: merge.deletesSkipped,
      };
      if (merge.deletesSkipped > 0) {
        console.log(`[ConfigPull] ${table}: ${merge.deletesSkipped} rows missing from the cloud, more than the safety cap; none deleted`);
      }
      result.changed ||= merge.changed;
    }

    // user_settings: only the cloud-backed fields; deload and coach options stay.
    const { data: settingsRow } = await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
    if (settingsRow?.updated_at && !pending.get('user_settings')?.has(SETTINGS_STAMP_ID)) {
      const seen = (await getStamps('user_settings'))[SETTINGS_STAMP_ID];
      const local = await getUserSettings();
      const newer = seen
        ? isAfter(settingsRow.updated_at, seen)
        : !firstPull && !!local.updatedAt && new Date(settingsRow.updated_at).getTime() > new Date(local.updatedAt).getTime() + CLOCK_SKEW_MS;
      if (newer) {
        await pulledStore.userSettings({ ...local, ...cloudSettingsFromRow(settingsRow) });
        result.settingsUpdated = true;
        result.changed = true;
      }
      await setStamps('user_settings', [{ id: SETTINGS_STAMP_ID, updatedAt: settingsRow.updated_at }]);
      maxSeen = laterIso(maxSeen, settingsRow.updated_at);
    }

    // Workouts deleted in the cloud (an empty session opened by accident, say).
    const since = new Date(now.getTime() - WORKOUT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: cloudWorkouts, error: wErr } = await supabase
      .from('workouts')
      .select('id,updated_at')
      .eq('user_id', userId)
      .gte('started_at', since);
    if (!wErr && cloudWorkouts) {
      const previous = await getStamps('workouts');
      const active = await getActiveWorkoutState();
      const gone = workoutsDeletedInCloud({
        local: await getWorkouts(),
        cloudIds: new Set(cloudWorkouts.map(w => w.id)),
        stamps: previous,
        pending: new Set([...(pending.get('workouts') ?? []), ...workoutsWithSets]),
        activeWorkoutId: active?.workout?.id ?? null,
        now,
        windowDays: WORKOUT_WINDOW_DAYS,
      });
      for (const id of gone) await deleteWorkout(id);
      if (gone.length > 0) console.log(`[ConfigPull] Deleted ${gone.length} workout(s) removed in the cloud: ${gone.join(', ')}`);
      result.workoutsDeleted = gone.length;
      result.changed ||= gone.length > 0;
      await replaceStamps('workouts', Object.fromEntries(cloudWorkouts.map(w => [w.id, w.updated_at ?? since])));
    }

    if (maxSeen) await setLastConfigPull(maxSeen);
    if (result.changed) {
      console.log('[ConfigPull] Pulled:', JSON.stringify(result.tables), result.settingsUpdated ? '+ settings' : '', result.workoutsDeleted ? `+ ${result.workoutsDeleted} workouts deleted` : '');
      notifyCloudApplied();
    }
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log('[ConfigPull] Failed:', message);
    return { ...result, error: message };
  }
}
