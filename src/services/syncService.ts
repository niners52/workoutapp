import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import {
  Exercise,
  Template,
  Workout,
  WorkoutSet,
  UserSettings,
  WorkoutLocation,
  Supplement,
  SupplementIntake,
  Routine,
  BodyMeasurement,
  HealthReminder,
} from '../types';
import { upsertTolerant, OPTIONAL_COLUMNS_BY_TABLE } from './schemaTolerance';
import {
  clearPendingMigrationResync,
  getBodyMeasurementById,
  getExerciseById,
  getExercises,
  getPendingMigrationResync,
  getSets,
  getUserSettings,
  getWorkoutById,
  getWorkouts,
} from './storage';

// Storage keys for sync state
const SYNC_KEYS = {
  LAST_RECONCILE: '@workout_tracker/sync_last_reconcile',
  PENDING_OPERATIONS: '@workout_tracker/pending_sync_operations',
  LAST_CLOUD_PULL: '@workout_tracker/last_cloud_pull',
  LAST_SYNC_TIMESTAMP: '@workout_tracker/last_sync_timestamp',
};

// Pending sync operation structure
interface PendingSyncOperation {
  table: string;
  operation: 'upsert' | 'delete';
  data: any;
  timestamp: number;
  retries?: number;  // Track how many times this op has failed
}

// Simple mutex to prevent concurrent queue read/write
let queueLock = false;
async function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  while (queueLock) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  queueLock = true;
  try {
    return await fn();
  } finally {
    queueLock = false;
  }
}

// Max retries before an operation is dropped
const MAX_RETRIES = 10;


// Helper to get a dedup key for an operation
function getOpKey(op: { table: string; operation: string; data: any }): string {
  const id = op.data?.id || op.data?.user_id || 'unknown';
  return `${op.table}:${op.operation}:${id}`;
}

// Helper to get current user ID
export async function getUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

// Helper to add operation to pending queue (deduplicates at add time)
export async function addToPendingQueue(operation: Omit<PendingSyncOperation, 'timestamp'>): Promise<void> {
  await withQueueLock(async () => {
    try {
      const existing = await AsyncStorage.getItem(SYNC_KEYS.PENDING_OPERATIONS);
      const operations: PendingSyncOperation[] = existing ? JSON.parse(existing) : [];

      // Deduplicate: replace existing op for the same table+operation+id
      const newKey = getOpKey(operation);
      const filtered = operations.filter(op => getOpKey(op) !== newKey);
      filtered.push({ ...operation, timestamp: Date.now(), retries: 0 });

      await AsyncStorage.setItem(SYNC_KEYS.PENDING_OPERATIONS, JSON.stringify(filtered));
      console.log(`[Sync] Queued ${operation.operation} for ${operation.table} (${filtered.length} pending)`);
    } catch (error) {
      console.log('Failed to add to pending queue:', error);
    }
  });
}

// Helper to chunk arrays for batch operations
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ==================== ROW BUILDERS ====================
// One place that knows the cloud column names, shared by the per-item sync
// functions and by reconcileCloud().

function exerciseRow(exercise: Exercise, userId: string) {
  return {
    id: exercise.id,
    user_id: userId,
    name: exercise.name,
    base_name: exercise.baseName || null,
    primary_muscle_groups: exercise.primaryMuscleGroups || [],
    secondary_muscle_groups: exercise.secondaryMuscleGroups || [],
    equipment: exercise.equipment,
    cable_accessory: exercise.cableAccessory || null,
    machine_weight_type: exercise.machineWeightType || null,
    location_ids: exercise.locationIds || [],
    is_custom: exercise.isCustom ?? true,
    is_favorite: exercise.isFavorite ?? false,
    is_bodyweight: exercise.isBodyweight ?? exercise.equipment === 'bodyweight',
    // Volume counting needs this (0.5 credit per set); it was never sent before.
    is_unilateral: exercise.isUnilateral ?? false,
    notes: exercise.notes || null,
  };
}

function workoutRow(workout: Workout, userId: string) {
  return {
    id: workout.id,
    user_id: userId,
    template_id: workout.templateId || null,
    started_at: workout.startedAt,
    completed_at: workout.completedAt || null,
    skipped_exercise_ids: workout.skippedExerciseIds || [],
    // Which gym this happened at. Previously local-only, which meant any device
    // that restored from the cloud lost every workout's gym and then reported
    // "first time here" for exercises the user does weekly.
    location_id: workout.locationId || null,
    is_deload: workout.isDeload ?? false,
  };
}

function setRow(set: WorkoutSet, userId: string) {
  return {
    id: set.id,
    user_id: userId,
    workout_id: set.workoutId,
    exercise_id: set.exerciseId,
    reps: set.reps,
    weight: set.weight,
    logged_at: set.loggedAt || new Date().toISOString(),
  };
}

// ==================== NUTRITION DAYS ====================

/** One local calendar day of Apple Health nutrition; null = this build cannot read that nutrient. */
export interface NutritionDayRow {
  id: string; // hk-nutrition-YYYY-MM-DD
  date: string; // 'YYYY-MM-DD'
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  iron_mg: number | null;
  vitamin_b12_mcg: number | null;
  vitamin_d_iu: number | null;
  calcium_mg: number | null;
  zinc_mg: number | null;
  sodium_mg: number | null;
  sample_count: number;
  /** Newest HealthKit sample that day (ISO); dropped on databases without the column. */
  last_sample_at: string | null;
  source: 'healthkit';
  synced_at: string;
}

/**
 * Upsert a window of nutrition days on (user_id, date). Failed batches go to the
 * pending queue, which retries them with the same conflict key.
 */
export async function syncNutritionDays(rows: NutritionDayRow[]): Promise<void> {
  const userId = await getUserId();
  if (!userId || rows.length === 0) return;

  const withUser = rows.map(r => ({ ...r, user_id: userId }));
  for (const batch of chunkArray(withUser, 50)) {
    try {
      const { error } = await upsertTolerant(
        'nutrition_days',
        batch,
        OPTIONAL_COLUMNS_BY_TABLE.nutrition_days || [],
        'user_id,date',
      );
      if (error) {
        console.log('Nutrition sync failed, queuing:', error.message);
        for (const row of batch) await addToPendingQueue({ table: 'nutrition_days', operation: 'upsert', data: row });
      } else {
        await updateLastSyncTimestamp();
      }
    } catch (error) {
      console.log('Nutrition sync error, queuing:', error);
      for (const row of batch) await addToPendingQueue({ table: 'nutrition_days', operation: 'upsert', data: row });
    }
  }
}

// ==================== SLEEP NIGHTS ====================

/** One night of Apple Health sleep, keyed to the local morning it ended. */
export interface SleepNightRow {
  id: string; // hk-sleep-YYYY-MM-DD
  date: string; // wake date, 'YYYY-MM-DD'
  time_asleep_min: number;
  time_in_bed_min: number;
  bedtime: string; // ISO
  wake_time: string; // ISO
  deep_min: number | null;
  rem_min: number | null;
  core_min: number | null;
  awake_min: number | null;
  sample_count: number;
  source: string;
  synced_at: string;
}

export async function syncSleepNights(rows: SleepNightRow[]): Promise<void> {
  const userId = await getUserId();
  if (!userId || rows.length === 0) return;

  const withUser = rows.map(r => ({ ...r, user_id: userId }));
  for (const batch of chunkArray(withUser, 50)) {
    try {
      const { error } = await supabase
        .from('sleep_nights')
        .upsert(batch, { onConflict: 'user_id,date' });
      if (error) {
        console.log('Sleep sync failed, queuing:', error.message);
        for (const row of batch) await addToPendingQueue({ table: 'sleep_nights', operation: 'upsert', data: row });
      } else {
        await updateLastSyncTimestamp();
      }
    } catch (error) {
      console.log('Sleep sync error, queuing:', error);
      for (const row of batch) await addToPendingQueue({ table: 'sleep_nights', operation: 'upsert', data: row });
    }
  }
}

// ==================== HEALTH DASHBOARD READS ====================

export type CloudRead<T> = { ok: true; data: T } | { ok: false; missingTable: boolean; error: string };

function isMissingTableError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  // PGRST205 = table not in PostgREST's schema cache; 42P01 = Postgres undefined_table.
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  const msg = error.message || '';
  return /could not find the table/i.test(msg) || /relation .* does not exist/i.test(msg);
}

/** Cloud copy of the nutrition sync: days on or after sinceDate, newest first. */
export async function fetchNutritionDays(sinceDate: string): Promise<CloudRead<NutritionDayRow[]>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, missingTable: false, error: 'not signed in' };
  const { data, error } = await supabase
    .from('nutrition_days')
    .select('*')
    .eq('user_id', userId)
    .gte('date', sinceDate)
    .order('date', { ascending: false });
  if (error) return { ok: false, missingTable: isMissingTableError(error), error: error.message };
  return {
    ok: true,
    data: (data || []).map(row => ({ ...row, last_sample_at: row.last_sample_at ?? null }) as NutritionDayRow),
  };
}

/** The night that ended on `date` (wake date). missingTable = sleep sync not deployed yet. */
export async function fetchSleepNight(date: string): Promise<CloudRead<SleepNightRow | null>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, missingTable: false, error: 'not signed in' };
  const { data, error } = await supabase
    .from('sleep_nights')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();
  if (error) return { ok: false, missingTable: isMissingTableError(error), error: error.message };
  return { ok: true, data: (data as SleepNightRow | null) ?? null };
}

// ==================== HEALTH REMINDERS ====================

function healthReminderRow(reminder: HealthReminder, userId: string) {
  return {
    id: reminder.id,
    user_id: userId,
    title: reminder.title,
    detail: reminder.detail,
    due_date: reminder.dueDate,
    done_at: reminder.doneAt,
    sort_order: reminder.sortOrder,
    created_at: reminder.createdAt,
    updated_at: reminder.updatedAt,
  };
}

export async function fetchHealthReminders(): Promise<CloudRead<HealthReminder[]>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, missingTable: false, error: 'not signed in' };
  const { data, error } = await supabase.from('health_reminders').select('*').eq('user_id', userId);
  if (error) return { ok: false, missingTable: isMissingTableError(error), error: error.message };
  return {
    ok: true,
    data: (data || []).map(row => ({
      id: row.id,
      title: row.title,
      detail: row.detail ?? null,
      dueDate: row.due_date ?? null,
      doneAt: row.done_at ?? null,
      sortOrder: row.sort_order ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

export async function syncHealthReminder(reminder: HealthReminder): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const row = healthReminderRow(reminder, userId);
  try {
    const { error } = await supabase.from('health_reminders').upsert(row, { onConflict: 'id' });
    if (error) {
      console.log('Health reminder sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'health_reminders', operation: 'upsert', data: row });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Health reminder sync error, queuing:', error);
    await addToPendingQueue({ table: 'health_reminders', operation: 'upsert', data: row });
  }
}

export async function syncDeleteHealthReminder(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  try {
    const { error } = await supabase.from('health_reminders').delete().eq('id', id).eq('user_id', userId);
    if (error) {
      console.log('Health reminder delete failed, queuing:', error.message);
      await addToPendingQueue({ table: 'health_reminders', operation: 'delete', data: { id, user_id: userId } });
    }
  } catch (error) {
    console.log('Health reminder delete error, queuing:', error);
    await addToPendingQueue({ table: 'health_reminders', operation: 'delete', data: { id, user_id: userId } });
  }
}

// ==================== CLOUD RECONCILIATION ====================

/** PostgREST caps a response at 1000 rows; page through everything. */
async function selectAllRows<T = any>(table: string, userId: string, columns: string = '*'): Promise<{ data: T[]; error: any }> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('user_id', userId)
      .range(from, from + PAGE - 1);
    if (error) return { data: out, error };
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < PAGE) return { data: out, error: null };
  }
}

export interface ReconcileResult {
  exercises: number;
  workouts: number;
  sets: number;
  skipped?: 'signed_out' | 'already_today';
}

/**
 * Find local rows the cloud does not have and queue them for upload.
 *
 * Sync is push-only and a queued row can be dropped after repeated failures,
 * so the cloud can silently miss sets (workout c756841c had 13 sets on the
 * phone and 12 in Supabase). Once a day, compare ids and queue the difference;
 * the sync manager batch-uploads the queue within 30 seconds.
 */
export async function reconcileCloud(force: boolean = false): Promise<ReconcileResult> {
  const userId = await getUserId();
  if (!userId) return { exercises: 0, workouts: 0, sets: 0, skipped: 'signed_out' };

  const today = new Date().toISOString().slice(0, 10);
  const last = await AsyncStorage.getItem(SYNC_KEYS.LAST_RECONCILE).catch(() => null);
  if (!force && last === today) return { exercises: 0, workouts: 0, sets: 0, skipped: 'already_today' };

  const [localExercises, localWorkouts, localSets] = await Promise.all([
    getExercises(),
    getWorkouts(),
    getSets(),
  ]);
  const [cloudExercises, cloudWorkouts, cloudSets] = await Promise.all([
    selectAllRows<{ id: string }>('exercises', userId, 'id'),
    selectAllRows<{ id: string }>('workouts', userId, 'id'),
    selectAllRows<{ id: string }>('workout_sets', userId, 'id'),
  ]);
  if (cloudExercises.error || cloudWorkouts.error || cloudSets.error) {
    console.log('[Sync] Reconcile skipped, cloud read failed:',
      (cloudExercises.error || cloudWorkouts.error || cloudSets.error)?.message);
    return { exercises: 0, workouts: 0, sets: 0 };
  }

  const have = (rows: { id: string }[]) => new Set(rows.map(r => r.id));
  const missingExercises = localExercises.filter(e => !have(cloudExercises.data).has(e.id));
  const missingWorkouts = localWorkouts.filter(w => !have(cloudWorkouts.data).has(w.id));
  const knownWorkouts = new Set(localWorkouts.map(w => w.id));
  const missingSets = localSets.filter(s => knownWorkouts.has(s.workoutId) && !have(cloudSets.data).has(s.id));

  for (const e of missingExercises) await addToPendingQueue({ table: 'exercises', operation: 'upsert', data: exerciseRow(e, userId) });
  for (const w of missingWorkouts) await addToPendingQueue({ table: 'workouts', operation: 'upsert', data: workoutRow(w, userId) });
  for (const st of missingSets) await addToPendingQueue({ table: 'workout_sets', operation: 'upsert', data: setRow(st, userId) });

  await AsyncStorage.setItem(SYNC_KEYS.LAST_RECONCILE, today).catch(() => {});
  const result = { exercises: missingExercises.length, workouts: missingWorkouts.length, sets: missingSets.length };
  console.log(`[Sync] Reconcile queued ${result.exercises} exercises, ${result.workouts} workouts, ${result.sets} sets missing from the cloud`);
  return result;
}

// ==================== EXERCISE SYNC ====================

export async function syncExercise(exercise: Exercise): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const row = exerciseRow(exercise, userId);

    const { error, rows: syncedRow } = await upsertTolerant(
      'exercises',
      row,
      OPTIONAL_COLUMNS_BY_TABLE.exercises || [],
    );

    if (error) {
      console.log('Exercise sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'exercises', operation: 'upsert', data: syncedRow });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Exercise sync error:', error);
  }
}

export async function syncDeleteExercise(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await supabase
      .from('exercises')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.log('Exercise delete sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'exercises', operation: 'delete', data: { id, user_id: userId } });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Exercise delete sync error:', error);
  }
}

// ==================== TEMPLATE SYNC ====================

export async function syncTemplate(template: Template): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const row = {
      id: template.id,
      user_id: userId,
      name: template.name,
      type: template.type || null,
      location_id: template.locationId || null,
      exercise_ids: template.exerciseIds || [],
    };

    const { error } = await supabase
      .from('templates')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.log('Template sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'templates', operation: 'upsert', data: row });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Template sync error:', error);
  }
}

export async function syncDeleteTemplate(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.log('Template delete sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'templates', operation: 'delete', data: { id, user_id: userId } });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Template delete sync error:', error);
  }
}

// ==================== WORKOUT SYNC ====================

export async function syncWorkout(workout: Workout): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const row = workoutRow(workout, userId);

    const { error, rows: syncedRow } = await upsertTolerant('workouts', row, [
      'location_id',
      'is_deload',
    ]);

    if (error) {
      console.log('Workout sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'workouts', operation: 'upsert', data: syncedRow });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Workout sync error:', error);
  }
}

export async function syncDeleteWorkout(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    // Supabase cascade should delete sets, but we delete workout first
    const { error } = await supabase
      .from('workouts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.log('Workout delete sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'workouts', operation: 'delete', data: { id, user_id: userId } });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Workout delete sync error:', error);
  }
}

// ==================== SET SYNC ====================

export async function syncSet(set: WorkoutSet): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const row = setRow(set, userId);

    const { error } = await supabase
      .from('workout_sets')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.log('Set sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'workout_sets', operation: 'upsert', data: row });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Set sync error:', error);
  }
}

export async function syncDeleteSet(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await supabase
      .from('workout_sets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.log('Set delete sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'workout_sets', operation: 'delete', data: { id, user_id: userId } });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Set delete sync error:', error);
  }
}

// ==================== SUPPLEMENT SYNC ====================

export async function syncSupplement(supplement: Supplement): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const row = {
      id: supplement.id,
      user_id: userId,
      name: supplement.name,
      sort_order: supplement.sortOrder ?? 0,
      is_active: supplement.isActive ?? true,
    };

    const { error } = await supabase
      .from('supplements')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.log('Supplement sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'supplements', operation: 'upsert', data: row });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Supplement sync error:', error);
  }
}

export async function syncDeleteSupplement(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await supabase
      .from('supplements')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.log('Supplement delete sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'supplements', operation: 'delete', data: { id, user_id: userId } });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Supplement delete sync error:', error);
  }
}

// ==================== SUPPLEMENT INTAKE SYNC ====================

export async function syncSupplementIntake(intake: SupplementIntake): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const row = {
      id: intake.id,
      user_id: userId,
      supplement_id: intake.supplementId,
      date: intake.date,
      taken_at: intake.takenAt || new Date().toISOString(),
    };

    const { error } = await supabase
      .from('supplement_intakes')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.log('Supplement intake sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'supplement_intakes', operation: 'upsert', data: row });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Supplement intake sync error:', error);
  }
}

export async function syncDeleteSupplementIntake(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await supabase
      .from('supplement_intakes')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.log('Supplement intake delete sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'supplement_intakes', operation: 'delete', data: { id, user_id: userId } });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Supplement intake delete sync error:', error);
  }
}

// ==================== ROUTINE SYNC ====================

export async function syncRoutine(routine: Routine): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const row = {
      id: routine.id,
      user_id: userId,
      name: routine.name,
      day_schedule: routine.daySchedule || [],
      is_active: routine.isActive ?? false,
    };

    const { error } = await supabase
      .from('routines')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.log('Routine sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'routines', operation: 'upsert', data: row });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Routine sync error:', error);
  }
}

export async function syncDeleteRoutine(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await supabase
      .from('routines')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.log('Routine delete sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'routines', operation: 'delete', data: { id, user_id: userId } });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Routine delete sync error:', error);
  }
}

// ==================== BODY MEASUREMENT SYNC ====================

export async function syncBodyMeasurement(measurement: BodyMeasurement): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const row = {
      id: measurement.id,
      user_id: userId,
      date: measurement.date,
      weight: measurement.weight ?? null,
      body_fat_percentage: measurement.bodyFatPercentage ?? null,
      height_inches: measurement.heightInches ?? null,
      type: measurement.type ?? null,
      value: measurement.value ?? null,
      source: measurement.source,
      synced_at: measurement.syncedAt ?? null,
    };

    const { error } = await supabase
      .from('body_measurements')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.log('Body measurement sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'body_measurements', operation: 'upsert', data: row });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Body measurement sync error:', error);
  }
}

export async function syncDeleteBodyMeasurement(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await supabase
      .from('body_measurements')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.log('Body measurement delete sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'body_measurements', operation: 'delete', data: { id, user_id: userId } });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Body measurement delete sync error:', error);
  }
}

// ==================== USER SETTINGS SYNC ====================

export async function syncUserSettings(settings: UserSettings): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const row = {
      user_id: userId,
      week_start_day: settings.weekStartDay || 'sunday',
      units: settings.units || 'imperial',
      rest_timer_seconds: settings.restTimerSeconds || 90,
      minimum_sets_per_exercise: settings.minimumSetsPerExercise ?? 3,
      daily_goals: settings.dailyGoals || {},
      weekly_goals: settings.weeklyGoals || {},
      muscle_group_targets: settings.muscleGroupTargets || {},
      creatine_supplement_id: settings.creatineSupplementId || null,
      health_targets: settings.healthTargets ?? null,
    };

    const { error } = await upsertTolerant(
      'user_settings',
      row,
      OPTIONAL_COLUMNS_BY_TABLE.user_settings || [],
      'user_id',
    );

    if (error) {
      console.log('User settings sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'user_settings', operation: 'upsert', data: row });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('User settings sync error:', error);
  }
}

// ==================== LOCATION SYNC ====================

export async function syncLocation(location: WorkoutLocation): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const row = {
      id: location.id,
      user_id: userId,
      name: location.name,
      sort_order: location.sortOrder ?? 0,
    };

    const { error } = await supabase
      .from('workout_locations')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.log('Location sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'workout_locations', operation: 'upsert', data: row });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Location sync error:', error);
  }
}

export async function syncDeleteLocation(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await supabase
      .from('workout_locations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.log('Location delete sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'workout_locations', operation: 'delete', data: { id, user_id: userId } });
    } else {
      await updateLastSyncTimestamp();
    }
  } catch (error) {
    console.log('Location delete sync error:', error);
  }
}

// ==================== PENDING SYNC PROCESSING ====================

// Deduplicate: for upserts, keep only the latest per (table, id).
// For deletes, if a later upsert exists for the same id, drop the delete.
function deduplicateOperations(operations: PendingSyncOperation[]): PendingSyncOperation[] {
  const seen = new Map<string, PendingSyncOperation>();

  for (const op of operations) {
    const id = op.operation === 'upsert'
      ? (op.table === 'user_settings' ? `${op.table}:${op.data.user_id}` : `${op.table}:${op.data.id}`)
      : `${op.table}:${op.data.id}`;

    const existing = seen.get(id);
    if (!existing || op.timestamp >= existing.timestamp) {
      seen.set(id, op);
    }
  }

  return Array.from(seen.values());
}

// Drop operations older than 30 days — they're likely stale migration artifacts
function dropStaleOperations(operations: PendingSyncOperation[]): PendingSyncOperation[] {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return operations.filter(op => op.timestamp > cutoff);
}

export interface SyncProgress {
  total: number;
  processed: number;
  failed: number;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export async function processPendingSync(
  onProgress?: SyncProgressCallback
): Promise<{ processed: number; failed: number; dropped: number }> {
  const userId = await getUserId();
  if (!userId) return { processed: 0, failed: 0, dropped: 0 };

  let processed = 0;
  let failed = 0;
  let dropped = 0;

  try {
    // Acquire lock to prevent race with addToPendingQueue
    const operations = await withQueueLock(async () => {
      const existing = await AsyncStorage.getItem(SYNC_KEYS.PENDING_OPERATIONS);
      if (!existing) return [];

      let ops: PendingSyncOperation[] = JSON.parse(existing);
      if (ops.length === 0) return [];

      // Clean up: drop stale ops, drop over-retried ops, then deduplicate
      const originalCount = ops.length;
      ops = dropStaleOperations(ops);
      const afterStale = ops.length;

      // Drop operations that have exceeded retry limit
      const overRetried = ops.filter(op => (op.retries || 0) >= MAX_RETRIES);
      if (overRetried.length > 0) {
        console.log(`[Sync] Dropping ${overRetried.length} operations that exceeded ${MAX_RETRIES} retries:`);
        for (const op of overRetried) {
          console.log(`  - ${op.operation} ${op.table} id=${op.data?.id || 'n/a'} (${op.retries} retries)`);
        }
        dropped += overRetried.length;
      }
      ops = ops.filter(op => (op.retries || 0) < MAX_RETRIES);

      ops = deduplicateOperations(ops);

      if (ops.length !== originalCount) {
        console.log(`[Sync] Cleaned queue: ${originalCount} → ${ops.length} (stale: ${originalCount - afterStale}, over-retried: ${overRetried.length}, deduped: ${afterStale - overRetried.length - ops.length})`);
      }

      // Clear the queue — we own these operations now.
      // New operations added via addToPendingQueue during processing
      // will go into a fresh queue (protected by the lock releasing).
      await AsyncStorage.setItem(SYNC_KEYS.PENDING_OPERATIONS, JSON.stringify([]));

      return ops;
    });

    if (operations.length === 0) {
      return { processed: 0, failed: 0, dropped };
    }

    const total = operations.length;
    console.log(`[Sync] Processing ${total} pending operations...`);
    onProgress?.({ total, processed: 0, failed: 0 });

    // Group upserts by table for batch processing
    const upsertsByTable = new Map<string, PendingSyncOperation[]>();
    const deletes: PendingSyncOperation[] = [];

    for (const op of operations) {
      if (op.operation === 'upsert') {
        const list = upsertsByTable.get(op.table) || [];
        list.push(op);
        upsertsByTable.set(op.table, list);
      } else {
        deletes.push(op);
      }
    }

    const remaining: PendingSyncOperation[] = [];

    // Process upserts in batches of 50 per table
    for (const [table, ops] of upsertsByTable) {
      const conflictKey =
        table === 'user_settings'
          ? 'user_id'
          : table === 'nutrition_days' || table === 'sleep_nights'
            ? 'user_id,date'
            : 'id';
      const batches = chunkArray(ops, 50);

      for (const batch of batches) {
        try {
          const rows = batch.map(op => op.data);
          // Tolerant so a queued row containing a post-launch column (e.g. a
          // workout's location_id) still lands on a database without it,
          // instead of retrying forever until MAX_RETRIES drops the workout.
          const { error } = await upsertTolerant(
            table,
            rows,
            OPTIONAL_COLUMNS_BY_TABLE[table] || [],
            conflictKey,
          );

          if (error) {
            console.log(`[Sync] Batch upsert failed for ${table} (${batch.length} rows):`, error.message);
            remaining.push(...batch.map(op => ({ ...op, retries: (op.retries || 0) + 1 })));
            failed += batch.length;
          } else {
            processed += batch.length;
          }
        } catch (error) {
          console.log(`[Sync] Batch upsert error for ${table}:`, error);
          remaining.push(...batch.map(op => ({ ...op, retries: (op.retries || 0) + 1 })));
          failed += batch.length;
        }
        onProgress?.({ total, processed, failed });
      }
    }

    // Process deletes individually (can't batch deletes easily)
    for (const op of deletes) {
      try {
        const { error } = await supabase
          .from(op.table)
          .delete()
          .eq('id', op.data.id)
          .eq('user_id', op.data.user_id);

        if (error) {
          console.log(`[Sync] Delete failed for ${op.table} id=${op.data.id}:`, error.message);
          remaining.push({ ...op, retries: (op.retries || 0) + 1 });
          failed++;
        } else {
          processed++;
        }
      } catch (error) {
        console.log(`[Sync] Delete error for ${op.table}:`, error);
        remaining.push({ ...op, retries: (op.retries || 0) + 1 });
        failed++;
      }
      onProgress?.({ total, processed, failed });
    }

    // Merge remaining failed ops back into queue (new ops may have been added during processing)
    await withQueueLock(async () => {
      const currentQueue = await AsyncStorage.getItem(SYNC_KEYS.PENDING_OPERATIONS);
      const newOps: PendingSyncOperation[] = currentQueue ? JSON.parse(currentQueue) : [];
      const merged = [...newOps, ...remaining];
      await AsyncStorage.setItem(SYNC_KEYS.PENDING_OPERATIONS, JSON.stringify(merged));
    });

    if (processed > 0) {
      await updateLastSyncTimestamp();
    }

    console.log(`[Sync] Complete: ${processed} synced, ${failed} failed (will retry), ${dropped} dropped, ${remaining.length} remaining`);
    return { processed, failed, dropped };
  } catch (error) {
    console.log('[Sync] Error processing pending sync:', error);
    return { processed, failed, dropped };
  }
}

// ==================== SYNC MANAGER ====================

type SyncStatusListener = (status: {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncTime: string | null;
}) => void;

class SyncManager {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private listeners: Set<SyncStatusListener> = new Set();
  private consecutiveFailures = 0;

  subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async notifyListeners() {
    const [pendingCount, lastSyncTime] = await Promise.all([
      getPendingOperationsCount(),
      getLastSyncTimestamp(),
    ]);
    const status = { pendingCount, isSyncing: this.isSyncing, lastSyncTime };
    this.listeners.forEach(l => l(status));
  }

  async start() {
    // Process immediately on start
    await this.processQueue();

    // Then every 30 seconds
    this.intervalId = setInterval(() => this.processQueue(), 30_000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async processQueue(onProgress?: SyncProgressCallback, force?: boolean): Promise<{ processed: number; failed: number }> {
    if (this.isSyncing) return { processed: 0, failed: 0 };

    const count = await getPendingOperationsCount();
    if (count === 0) {
      this.consecutiveFailures = 0;
      await this.notifyListeners();
      return { processed: 0, failed: 0 };
    }

    // Exponential backoff: skip this cycle if we've been failing
    // When force=true (manual Sync Now), always bypass backoff
    if (!force && this.consecutiveFailures > 5) {
      console.log(`[SyncManager] Backing off (${this.consecutiveFailures} consecutive failures, ${count} pending)`);
      // Still notify so UI shows current count (it may have changed from cleanup)
      await this.notifyListeners();
      return { processed: 0, failed: 0 };
    }

    // Reset backoff counter when forcing (manual sync)
    if (force) {
      this.consecutiveFailures = 0;
    }

    this.isSyncing = true;
    await this.notifyListeners();

    try {
      const result = await processPendingSync(onProgress);

      if (result.failed > 0 && result.processed === 0 && result.dropped === 0) {
        this.consecutiveFailures++;
      } else {
        // Any progress (synced or dropped) resets backoff
        this.consecutiveFailures = 0;
      }

      return result;
    } catch (error) {
      console.log('[SyncManager] Process error:', error);
      this.consecutiveFailures++;
      return { processed: 0, failed: 0 };
    } finally {
      this.isSyncing = false;
      await this.notifyListeners();
    }
  }

  // Called when app comes to foreground
  async onAppResume() {
    this.consecutiveFailures = 0; // Reset backoff on resume
    await this.processQueue();
  }
}

export const syncManager = new SyncManager();

// ==================== CLOUD PULL ====================

export interface CloudData {
  exercises: Exercise[];
  templates: Template[];
  workouts: Workout[];
  sets: WorkoutSet[];
  supplements: Supplement[];
  supplementIntakes: SupplementIntake[];
  routines: Routine[];
  locations: WorkoutLocation[];
  bodyMeasurements: BodyMeasurement[];
  userSettings: Partial<UserSettings> | null;
}

export async function pullFromCloud(): Promise<CloudData | null> {
  const userId = await getUserId();
  if (!userId) return null;

  try {
    console.log('Pulling data from cloud...');

    // Fetch all data in parallel
    const [
      exercisesResult,
      templatesResult,
      workoutsResult,
      setsResult,
      supplementsResult,
      intakesResult,
      routinesResult,
      locationsResult,
      bodyMeasurementsResult,
      settingsResult,
    ] = await Promise.all([
      // Paged: a single select is capped at 1000 rows, which silently truncated
      // set history on a restore.
      selectAllRows('exercises', userId),
      selectAllRows('templates', userId),
      selectAllRows('workouts', userId),
      selectAllRows('workout_sets', userId),
      selectAllRows('supplements', userId),
      selectAllRows('supplement_intakes', userId),
      selectAllRows('routines', userId),
      selectAllRows('workout_locations', userId),
      selectAllRows('body_measurements', userId),
      supabase.from('user_settings').select('*').eq('user_id', userId).single(),
    ]);

    // Map Supabase rows back to local types
    const exercises: Exercise[] = (exercisesResult.data || []).map(row => ({
      id: row.id,
      name: row.name,
      baseName: row.base_name || undefined,
      primaryMuscleGroups: row.primary_muscle_groups || [],
      secondaryMuscleGroups: row.secondary_muscle_groups || [],
      equipment: row.equipment,
      cableAccessory: row.cable_accessory,
      machineWeightType: row.machine_weight_type,
      locationIds: row.location_ids || [],
      isCustom: row.is_custom ?? true,
      isFavorite: row.is_favorite ?? false,
      ...(typeof row.is_bodyweight === 'boolean' ? { isBodyweight: row.is_bodyweight } : {}),
    }));

    const templates: Template[] = (templatesResult.data || []).map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      locationId: row.location_id || '',
      exerciseIds: row.exercise_ids || [],
    }));

    const workouts: Workout[] = (workoutsResult.data || []).map(row => ({
      id: row.id,
      templateId: row.template_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      ...(row.skipped_exercise_ids?.length ? { skippedExerciseIds: row.skipped_exercise_ids } : {}),
      // Keep the gym and deload flag on restore — dropping them here is what made
      // restored devices treat every exercise as never-done-at-this-location.
      ...(row.location_id ? { locationId: row.location_id } : {}),
      ...(row.is_deload ? { isDeload: true } : {}),
    }));

    const sets: WorkoutSet[] = (setsResult.data || []).map(row => ({
      id: row.id,
      workoutId: row.workout_id,
      exerciseId: row.exercise_id,
      reps: row.reps,
      weight: row.weight,
      loggedAt: row.logged_at,
    }));

    const supplements: Supplement[] = (supplementsResult.data || []).map(row => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order ?? 0,
      isActive: row.is_active ?? true,
    }));

    const supplementIntakes: SupplementIntake[] = (intakesResult.data || []).map(row => ({
      id: row.id,
      supplementId: row.supplement_id,
      date: row.date,
      takenAt: row.taken_at,
    }));

    const routines: Routine[] = (routinesResult.data || []).map(row => ({
      id: row.id,
      name: row.name,
      daySchedule: row.day_schedule || [],
      isActive: row.is_active ?? false,
    }));

    const locations: WorkoutLocation[] = (locationsResult.data || []).map(row => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order ?? 0,
    }));

    const bodyMeasurements: BodyMeasurement[] = (bodyMeasurementsResult.data || []).map(row => ({
      id: row.id,
      date: row.date,
      weight: row.weight ?? undefined,
      bodyFatPercentage: row.body_fat_percentage ?? undefined,
      heightInches: row.height_inches ?? undefined,
      type: row.type ?? undefined,
      value: row.value ?? undefined,
      source: row.source || 'manual',
      syncedAt: row.synced_at ?? undefined,
    }));

    let userSettings: Partial<UserSettings> | null = null;
    if (settingsResult.data) {
      const row = settingsResult.data;
      userSettings = {
        weekStartDay: row.week_start_day,
        units: row.units,
        restTimerSeconds: row.rest_timer_seconds,
        minimumSetsPerExercise: row.minimum_sets_per_exercise ?? 3,
        dailyGoals: row.daily_goals,
        weeklyGoals: row.weekly_goals,
        muscleGroupTargets: row.muscle_group_targets,
        creatineSupplementId: row.creatine_supplement_id,
        ...(row.health_targets ? { healthTargets: row.health_targets } : {}),
      };
    }

    console.log(`Pulled from cloud: ${exercises.length} exercises, ${workouts.length} workouts, ${sets.length} sets`);

    return {
      exercises,
      templates,
      workouts,
      sets,
      supplements,
      supplementIntakes,
      routines,
      locations,
      bodyMeasurements,
      userSettings,
    };
  } catch (error) {
    console.log('Error pulling from cloud:', error);
    return null;
  }
}

// ==================== SYNC STATUS ====================

async function updateLastSyncTimestamp(): Promise<void> {
  await AsyncStorage.setItem(SYNC_KEYS.LAST_SYNC_TIMESTAMP, new Date().toISOString());
}

export async function getLastSyncTimestamp(): Promise<string | null> {
  return AsyncStorage.getItem(SYNC_KEYS.LAST_SYNC_TIMESTAMP);
}

export async function getPendingOperationsCount(): Promise<number> {
  try {
    const existing = await AsyncStorage.getItem(SYNC_KEYS.PENDING_OPERATIONS);
    if (!existing) return 0;
    const operations: PendingSyncOperation[] = JSON.parse(existing);
    return operations.length;
  } catch {
    return 0;
  }
}

export async function clearPendingSyncQueue(): Promise<void> {
  const existing = await AsyncStorage.getItem(SYNC_KEYS.PENDING_OPERATIONS);
  const count = existing ? JSON.parse(existing).length : 0;
  await AsyncStorage.removeItem(SYNC_KEYS.PENDING_OPERATIONS);
  console.log(`[Sync] Pending sync queue cleared (${count} operations removed)`);
}

/**
 * Push rows that a local storage migration rewrote. The cloud only ever receives
 * pushes from the device, so without this a migration would fix the phone and
 * leave the cloud (and the MCP connector) showing the old values.
 */
export async function flushMigrationResync(): Promise<void> {
  const pending = await getPendingMigrationResync();
  if (!pending) return;
  const userId = await getUserId();
  if (!userId) return; // stays queued until a signed-in launch

  for (const id of pending.exerciseIds) {
    const exercise = await getExerciseById(id);
    if (exercise) await syncExercise(exercise);
  }
  for (const id of pending.workoutIds) {
    const workout = await getWorkoutById(id);
    if (workout) await syncWorkout(workout);
  }
  for (const id of pending.bodyMeasurementIds ?? []) {
    const measurement = await getBodyMeasurementById(id);
    if (measurement) await syncBodyMeasurement(measurement);
  }
  if (pending.syncSettings) {
    await syncUserSettings(await getUserSettings());
  }
  await clearPendingMigrationResync();
  console.log(
    `[Sync] Re-synced ${pending.exerciseIds.length} exercises, ${pending.workoutIds.length} workouts, ` +
      `${pending.bodyMeasurementIds?.length ?? 0} body measurements after migration`,
  );
}

export async function getLastCloudPull(): Promise<string | null> {
  return AsyncStorage.getItem(SYNC_KEYS.LAST_CLOUD_PULL);
}

export async function setLastCloudPull(): Promise<void> {
  await AsyncStorage.setItem(SYNC_KEYS.LAST_CLOUD_PULL, new Date().toISOString());
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  } catch {
    return false;
  }
}

// ==================== FULL SYNC ====================

export async function syncNow(): Promise<{ processed: number; failed: number }> {
  // Process any pending operations
  return processPendingSync();
}
