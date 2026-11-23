/**
 * Write one cloud row onto the phone, for a push that found the cloud copy
 * newer (syncService's stale check). The row replaces the local one's
 * cloud-stored fields and keeps phone-only fields; its updated_at becomes
 * the stamp.
 */
import type { BodyMeasurement, Exercise, Routine, Template, WorkoutLocation } from '../types';
import {
  CLOUD_OPTIONAL_FIELDS,
  bodyMeasurementFromRow,
  cloudSettingsFromRow,
  exerciseFromRow,
  locationFromRow,
  routineFromRow,
  templateFromRow,
} from './cloudMappers';
import { setStamps, type StampTable } from './cloudStamps';
import {
  getBodyMeasurements,
  getExercises,
  getLocations,
  getRoutines,
  getTemplates,
  getUserSettings,
  pulledStore,
} from './storage';

export type ConfigTable = 'exercises' | 'templates' | 'routines' | 'workout_locations' | 'body_measurements';

export const CONFIG_TABLES: Record<ConfigTable, { map: (row: any) => { id: string; updatedAt?: string }; read: () => Promise<Array<{ id: string; updatedAt?: string }>>; write: (rows: any[]) => Promise<void> }> = {
  exercises: { map: exerciseFromRow, read: getExercises, write: rows => pulledStore.exercises(rows as Exercise[]) },
  templates: { map: templateFromRow, read: getTemplates, write: rows => pulledStore.templates(rows as Template[]) },
  routines: { map: routineFromRow, read: getRoutines, write: rows => pulledStore.routines(rows as Routine[]) },
  workout_locations: { map: locationFromRow, read: getLocations, write: rows => pulledStore.workout_locations(rows as WorkoutLocation[]) },
  body_measurements: {
    map: bodyMeasurementFromRow,
    read: getBodyMeasurements,
    write: rows => pulledStore.body_measurements(rows as BodyMeasurement[]),
  },
};

const listeners = new Set<() => void>();

/** Called after cloud rows were written onto the phone, so screens can reload. */
export function onCloudApplied(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyCloudApplied(): void {
  listeners.forEach(l => {
    try {
      l();
    } catch (e) {
      console.log('[ConfigPull] listener failed:', e);
    }
  });
}

export async function applyCloudRow(table: ConfigTable | 'user_settings', row: any): Promise<void> {
  if (table === 'user_settings') {
    const current = await getUserSettings();
    await pulledStore.userSettings({ ...current, ...cloudSettingsFromRow(row) });
    await setStamps('user_settings', [{ id: 'settings', updatedAt: row.updated_at }]);
    notifyCloudApplied();
    return;
  }
  const spec = CONFIG_TABLES[table];
  const value = spec.map(row);
  const local = await spec.read();
  const cleared = Object.fromEntries((CLOUD_OPTIONAL_FIELDS[table] ?? []).map(f => [f, undefined]));
  const index = local.findIndex(r => r.id === value.id);
  const next = [...local];
  if (index === -1) next.push(value);
  else next[index] = { ...local[index], ...cleared, ...value };
  await spec.write(next);
  await setStamps(table as StampTable, [{ id: value.id, updatedAt: row.updated_at }]);
  notifyCloudApplied();
}
