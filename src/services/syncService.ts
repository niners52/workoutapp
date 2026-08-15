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
} from '../types';
import { upsertTolerant, OPTIONAL_COLUMNS_BY_TABLE } from './schemaTolerance';

// Storage keys for sync state
const SYNC_KEYS = {
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
async function getUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

// Helper to add operation to pending queue (deduplicates at add time)
async function addToPendingQueue(operation: Omit<PendingSyncOperation, 'timestamp'>): Promise<void> {
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

// ==================== EXERCISE SYNC ====================

export async function syncExercise(exercise: Exercise): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const row = {
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
    };

    const { error, rows: syncedRow } = await upsertTolerant('exercises', row, [
      'is_favorite',
    ]);

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
    const row = {
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
    const row = {
      id: set.id,
      user_id: userId,
      workout_id: set.workoutId,
      exercise_id: set.exerciseId,
      reps: set.reps,
      weight: set.weight,
      logged_at: set.loggedAt || new Date().toISOString(),
    };

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
    };

    const { error } = await supabase
      .from('user_settings')
      .upsert(row, { onConflict: 'user_id' });

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
      const conflictKey = table === 'user_settings' ? 'user_id' : 'id';
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
      supabase.from('exercises').select('*').eq('user_id', userId),
      supabase.from('templates').select('*').eq('user_id', userId),
      supabase.from('workouts').select('*').eq('user_id', userId),
      supabase.from('workout_sets').select('*').eq('user_id', userId),
      supabase.from('supplements').select('*').eq('user_id', userId),
      supabase.from('supplement_intakes').select('*').eq('user_id', userId),
      supabase.from('routines').select('*').eq('user_id', userId),
      supabase.from('workout_locations').select('*').eq('user_id', userId),
      supabase.from('body_measurements').select('*').eq('user_id', userId),
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
