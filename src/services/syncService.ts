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
} from '../types';

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

// Helper to add operation to pending queue
async function addToPendingQueue(operation: Omit<PendingSyncOperation, 'timestamp'>): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(SYNC_KEYS.PENDING_OPERATIONS);
    const operations: PendingSyncOperation[] = existing ? JSON.parse(existing) : [];
    operations.push({ ...operation, timestamp: Date.now() });
    await AsyncStorage.setItem(SYNC_KEYS.PENDING_OPERATIONS, JSON.stringify(operations));
  } catch (error) {
    console.log('Failed to add to pending queue:', error);
  }
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
      primary_muscle_groups: exercise.primaryMuscleGroups || [],
      secondary_muscle_groups: exercise.secondaryMuscleGroups || [],
      equipment: exercise.equipment,
      cable_accessory: exercise.cableAccessory || null,
      machine_weight_type: exercise.machineWeightType || null,
      location_ids: exercise.locationIds || [],
      is_custom: exercise.isCustom ?? true,
    };

    const { error } = await supabase
      .from('exercises')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.log('Exercise sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'exercises', operation: 'upsert', data: row });
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
    };

    const { error } = await supabase
      .from('workouts')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.log('Workout sync failed, queuing:', error.message);
      await addToPendingQueue({ table: 'workouts', operation: 'upsert', data: row });
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

export async function processPendingSync(): Promise<{ processed: number; failed: number }> {
  const userId = await getUserId();
  if (!userId) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  try {
    const existing = await AsyncStorage.getItem(SYNC_KEYS.PENDING_OPERATIONS);
    if (!existing) return { processed: 0, failed: 0 };

    const operations: PendingSyncOperation[] = JSON.parse(existing);
    if (operations.length === 0) return { processed: 0, failed: 0 };

    console.log(`Processing ${operations.length} pending sync operations...`);

    const remaining: PendingSyncOperation[] = [];

    for (const op of operations) {
      try {
        if (op.operation === 'upsert') {
          const { error } = await supabase
            .from(op.table)
            .upsert(op.data, { onConflict: op.table === 'user_settings' ? 'user_id' : 'id' });

          if (error) {
            console.log(`Retry failed for ${op.table} upsert:`, error.message);
            remaining.push(op);
            failed++;
          } else {
            processed++;
          }
        } else if (op.operation === 'delete') {
          const { error } = await supabase
            .from(op.table)
            .delete()
            .eq('id', op.data.id)
            .eq('user_id', op.data.user_id);

          if (error) {
            console.log(`Retry failed for ${op.table} delete:`, error.message);
            remaining.push(op);
            failed++;
          } else {
            processed++;
          }
        }
      } catch (error) {
        console.log(`Error processing pending op for ${op.table}:`, error);
        remaining.push(op);
        failed++;
      }
    }

    // Save remaining operations back to queue
    await AsyncStorage.setItem(SYNC_KEYS.PENDING_OPERATIONS, JSON.stringify(remaining));

    if (processed > 0) {
      await updateLastSyncTimestamp();
    }

    console.log(`Pending sync complete: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  } catch (error) {
    console.log('Error processing pending sync:', error);
    return { processed, failed };
  }
}

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
      supabase.from('user_settings').select('*').eq('user_id', userId).single(),
    ]);

    // Map Supabase rows back to local types
    const exercises: Exercise[] = (exercisesResult.data || []).map(row => ({
      id: row.id,
      name: row.name,
      primaryMuscleGroups: row.primary_muscle_groups || [],
      secondaryMuscleGroups: row.secondary_muscle_groups || [],
      equipment: row.equipment,
      cableAccessory: row.cable_accessory,
      machineWeightType: row.machine_weight_type,
      locationIds: row.location_ids || [],
      isCustom: row.is_custom ?? true,
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
