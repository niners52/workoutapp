/**
 * The cloud's updated_at for each synced row, as this phone last saw it (after
 * a push or a pull). Server clock against server clock, so the phone's clock
 * never decides whether a row changed somewhere else:
 *
 * - a cloud row whose updated_at is past its stamp was edited elsewhere
 *   (Claude in the database, the MCP server, another device);
 * - a row that has a stamp but is no longer in the cloud was deleted there.
 *
 * A row with no stamp has never been seen in the cloud from this phone, so a
 * pull never deletes it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@workout_tracker/cloud_stamps_v1';
const LAST_PULL_KEY = '@workout_tracker/last_config_pull_v1';

export type StampTable =
  | 'exercises'
  | 'templates'
  | 'routines'
  | 'workout_locations'
  | 'body_measurements'
  | 'user_settings'
  | 'workouts';

type Stamps = Partial<Record<StampTable, Record<string, string>>>;

let cache: Stamps | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(): Promise<Stamps> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Stamps) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist(): Promise<void> {
  const snapshot = JSON.stringify(cache ?? {});
  writing = writing.then(() => AsyncStorage.setItem(KEY, snapshot)).catch(() => {});
  return writing;
}

export async function getStamps(table: StampTable): Promise<Record<string, string>> {
  return { ...((await load())[table] ?? {}) };
}

export async function getStamp(table: StampTable, id: string): Promise<string | undefined> {
  return (await load())[table]?.[id];
}

/** Record what the cloud said, e.g. from an upsert's returned updated_at. */
export async function setStamps(table: StampTable, entries: Array<{ id: string; updatedAt: string | null | undefined }>): Promise<void> {
  if (entries.length === 0) return;
  const all = await load();
  const t = { ...(all[table] ?? {}) };
  for (const e of entries) if (e.id && e.updatedAt) t[e.id] = e.updatedAt;
  all[table] = t;
  await persist();
}

/** Replace a table's stamps wholesale (after a pull merged it). */
export async function replaceStamps(table: StampTable, stamps: Record<string, string>): Promise<void> {
  const all = await load();
  all[table] = stamps;
  await persist();
}

export async function getLastConfigPull(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_PULL_KEY);
  } catch {
    return null;
  }
}

export async function setLastConfigPull(iso: string): Promise<void> {
  await AsyncStorage.setItem(LAST_PULL_KEY, iso).catch(() => {});
}

/** Later of two ISO timestamps (either may be missing). */
export function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

export { isAfter } from './configMerge';
