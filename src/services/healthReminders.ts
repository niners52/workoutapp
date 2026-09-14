/**
 * Health reminders ("Next draws" card). Local-first like the rest of the app:
 * edits land on the phone immediately and are pushed to health_reminders, and
 * loadReminders() merges the cloud copy so another device or a SQL edit shows up.
 *
 * Seeds are written once, as ordinary rows, when neither the phone nor the cloud
 * has any reminders. Nothing downstream treats them differently.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { HealthReminder } from '../types';
import { fetchHealthReminders, syncDeleteHealthReminder, syncHealthReminder } from './syncService';

const KEYS = {
  REMINDERS: '@workout_tracker/health_reminders',
  SEEDED: '@workout_tracker/health_reminders_seeded',
  LAST_PULL: '@workout_tracker/health_reminders_last_pull',
  TOMBSTONES: '@workout_tracker/health_reminders_tombstones',
} as const;

export type ReminderInput = Pick<HealthReminder, 'title' | 'detail' | 'dueDate'>;

export const SEED_REMINDERS: ReadonlyArray<ReminderInput> = [
  { title: 'Testosterone + estradiol + CBC recheck', detail: '3–4 months off Clomid', dueDate: null },
  { title: 'Vitamin D recheck', detail: '28.5 ng/mL in May 2026', dueDate: null },
  { title: 'Repeat 24-hr urine (Litholink)', detail: '~3 months into sodium restriction', dueDate: '2026-12-01' },
  { title: 'DEXA repeat', detail: 'Interval per physician', dueDate: null },
];

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export function getLocalReminders(): Promise<HealthReminder[]> {
  return readJson<HealthReminder[]>(KEYS.REMINDERS, []);
}

function newReminder(input: ReminderInput, sortOrder: number): HealthReminder {
  const now = new Date().toISOString();
  return {
    id: Crypto.randomUUID(),
    title: input.title.trim(),
    detail: input.detail?.trim() || null,
    dueDate: input.dueDate,
    doneAt: null,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Newest updatedAt wins per id. A phone row the cloud lacks is kept (and pushed)
 * only if it changed after the last successful pull; otherwise it was deleted
 * elsewhere. Tombstoned ids still in the cloud are deleted again.
 */
export function mergeReminders(
  local: HealthReminder[],
  cloud: HealthReminder[],
  lastPullIso: string | null,
  tombstones: string[],
): { merged: HealthReminder[]; push: HealthReminder[]; deleteIds: string[] } {
  const dead = new Set(tombstones);
  const deleteIds = cloud.filter(c => dead.has(c.id)).map(c => c.id);
  const cloudById = new Map(cloud.filter(c => !dead.has(c.id)).map(c => [c.id, c]));
  const lastPull = lastPullIso ? Date.parse(lastPullIso) : null;
  const merged: HealthReminder[] = [];
  const push: HealthReminder[] = [];

  for (const l of local) {
    const c = cloudById.get(l.id);
    if (c) {
      cloudById.delete(l.id);
      if (Date.parse(l.updatedAt) > Date.parse(c.updatedAt)) {
        merged.push(l);
        push.push(l);
      } else {
        merged.push(c);
      }
    } else if (lastPull === null || Date.parse(l.updatedAt) > lastPull) {
      merged.push(l);
      push.push(l);
    }
  }
  merged.push(...cloudById.values());
  return { merged, push, deleteIds };
}

export async function loadReminders(): Promise<HealthReminder[]> {
  let local = await getLocalReminders();
  const cloud = await fetchHealthReminders();

  if (!(await AsyncStorage.getItem(KEYS.SEEDED))) {
    const cloudHasRows = cloud.ok && cloud.data.length > 0;
    if (!cloudHasRows && local.length === 0) {
      local = SEED_REMINDERS.map((s, i) => newReminder(s, i));
      await writeJson(KEYS.REMINDERS, local);
    }
    await AsyncStorage.setItem(KEYS.SEEDED, '1');
  }
  if (!cloud.ok) return local; // offline or table not deployed: the phone copy stands

  const [lastPull, tombstones] = await Promise.all([
    AsyncStorage.getItem(KEYS.LAST_PULL),
    readJson<string[]>(KEYS.TOMBSTONES, []),
  ]);
  const { merged, push, deleteIds } = mergeReminders(local, cloud.data, lastPull, tombstones);
  await writeJson(KEYS.REMINDERS, merged);
  await writeJson(KEYS.TOMBSTONES, deleteIds);
  await AsyncStorage.setItem(KEYS.LAST_PULL, new Date().toISOString());
  Promise.all([...push.map(syncHealthReminder), ...deleteIds.map(syncDeleteHealthReminder)]).catch(e =>
    console.log('Health reminder push failed:', e),
  );
  return merged;
}

export async function createReminder(input: ReminderInput): Promise<HealthReminder> {
  const list = await getLocalReminders();
  const reminder = newReminder(input, list.reduce((max, r) => Math.max(max, r.sortOrder + 1), 0));
  await writeJson(KEYS.REMINDERS, [...list, reminder]);
  syncHealthReminder(reminder).catch(() => {});
  return reminder;
}

export async function saveReminder(reminder: HealthReminder): Promise<HealthReminder> {
  const updated: HealthReminder = { ...reminder, updatedAt: new Date().toISOString() };
  const list = await getLocalReminders();
  await writeJson(KEYS.REMINDERS, list.some(r => r.id === updated.id) ? list.map(r => (r.id === updated.id ? updated : r)) : [...list, updated]);
  syncHealthReminder(updated).catch(() => {});
  return updated;
}

export async function setReminderDone(id: string, done: boolean): Promise<HealthReminder | null> {
  const existing = (await getLocalReminders()).find(r => r.id === id);
  if (!existing) return null;
  return saveReminder({ ...existing, doneAt: done ? new Date().toISOString() : null });
}

export async function deleteReminder(id: string): Promise<void> {
  const [list, tombstones] = await Promise.all([getLocalReminders(), readJson<string[]>(KEYS.TOMBSTONES, [])]);
  await writeJson(KEYS.REMINDERS, list.filter(r => r.id !== id));
  await writeJson(KEYS.TOMBSTONES, [...new Set([...tombstones, id])]);
  syncDeleteHealthReminder(id).catch(() => {});
}
