/**
 * Pain log on the phone: kept in AsyncStorage so the workout warning works
 * offline, written through to the pain_log table. Opening the pain log merges
 * in anything the cloud has that the phone does not (another device).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PainLogEntry } from '../types';
import { painEntryFromRow } from './painLog';
import { fetchPainLogFromCloud, syncDeletePainLogEntry, syncPainLogEntry } from './syncService';

const KEY = '@workout_tracker/pain_log_v1';
const listeners = new Set<(entries: PainLogEntry[]) => void>();

const sortNewest = (xs: PainLogEntry[]) => [...xs].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

export async function getPainLog(): Promise<PainLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? sortNewest(JSON.parse(raw) as PainLogEntry[]) : [];
  } catch {
    return [];
  }
}

async function save(entries: PainLogEntry[]): Promise<PainLogEntry[]> {
  const sorted = sortNewest(entries);
  await AsyncStorage.setItem(KEY, JSON.stringify(sorted));
  listeners.forEach(l => l(sorted));
  return sorted;
}

export function onPainLogChange(listener: (entries: PainLogEntry[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function addPainEntry(entry: PainLogEntry): Promise<PainLogEntry[]> {
  const next = await save([...(await getPainLog()).filter(e => e.id !== entry.id), entry]);
  syncPainLogEntry(entry).catch(e => console.log('Pain log sync error:', e));
  return next;
}

export async function deletePainEntry(id: string): Promise<PainLogEntry[]> {
  const next = await save((await getPainLog()).filter(e => e.id !== id));
  syncDeletePainLogEntry(id).catch(e => console.log('Pain log delete sync error:', e));
  return next;
}

/** Adds cloud rows the phone is missing; the phone's own rows win. */
export async function mergePainLogFromCloud(): Promise<PainLogEntry[]> {
  const local = await getPainLog();
  const rows = await fetchPainLogFromCloud();
  if (!rows) return local;
  const have = new Set(local.map(e => e.id));
  const missing = rows.map(painEntryFromRow).filter(e => !have.has(e.id));
  return missing.length > 0 ? save([...local, ...missing]) : local;
}
