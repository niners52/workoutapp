import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getExercises,
  getTemplates,
  getLocations,
  getWorkouts,
  getSets,
  getUserSettings,
  getSupplements,
  getSupplementIntakes,
  getRoutines,
} from './storage';
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
import { upsertTolerant } from './schemaTolerance';

const MIGRATION_KEY = 'supabase_migration_complete';

/**
 * Check if local data has been migrated to Supabase.
 */
export async function isMigrationComplete(): Promise<boolean> {
  const value = await AsyncStorage.getItem(MIGRATION_KEY);
  return value === 'true';
}

/**
 * Migrate all local AsyncStorage data to Supabase for the current user.
 * This runs once after the user's first login.
 *
 * Returns: { success: boolean, counts: object, error?: string }
 */
export async function migrateLocalDataToSupabase(): Promise<{
  success: boolean;
  counts: {
    exercises: number;
    templates: number;
    locations: number;
    workouts: number;
    sets: number;
    supplements: number;
    supplementIntakes: number;
    routines: number;
  };
  error?: string;
}> {
  const counts = {
    exercises: 0,
    templates: 0,
    locations: 0,
    workouts: 0,
    sets: 0,
    supplements: 0,
    supplementIntakes: 0,
    routines: 0,
  };

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, counts, error: 'Not authenticated' };
    }

    const userId = user.id;

    // Check if already migrated
    const alreadyMigrated = await isMigrationComplete();
    if (alreadyMigrated) {
      return { success: true, counts, error: 'Already migrated' };
    }

    // Fetch all local data
    const [
      exercises,
      templates,
      locations,
      workouts,
      sets,
      userSettings,
      supplements,
      supplementIntakes,
      routines,
    ] = await Promise.all([
      getExercises(),
      getTemplates(),
      getLocations(),
      getWorkouts(),
      getSets(),
      getUserSettings(),
      getSupplements(),
      getSupplementIntakes(),
      getRoutines(),
    ]);

    // We need to map old string IDs to new UUIDs for foreign key references.
    // Strategy: use the old ID as the new UUID where possible,
    // or create a mapping if the old IDs aren't valid UUIDs.
    const idMap = new Map<string, string>();

    // Helper: generate a deterministic UUID-like string from an old ID
    // This ensures consistent mapping across tables
    function mapId(oldId: string): string {
      if (idMap.has(oldId)) return idMap.get(oldId)!;
      // If it already looks like a UUID, keep it
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(oldId)) {
        idMap.set(oldId, oldId);
        return oldId;
      }
      // Otherwise let Supabase generate one - we'll track the mapping
      // For now, we'll let inserts auto-generate and not try to preserve IDs
      return oldId;
    }

    // ============================================================
    // 1. LOCATIONS
    // ============================================================
    if (locations.length > 0) {
      const locationRows = locations.map(loc => ({
        id: loc.id,
        user_id: userId,
        name: loc.name,
        sort_order: loc.sortOrder ?? 0,
      }));

      const { error } = await supabase
        .from('workout_locations')
        .upsert(locationRows, { onConflict: 'id' });

      if (error) {
        console.error('Location migration error:', error);
      } else {
        counts.locations = locationRows.length;
      }
    }

    // ============================================================
    // 2. EXERCISES
    // ============================================================
    if (exercises.length > 0) {
      // Batch in chunks of 100 (Supabase limit)
      const chunks = chunkArray(exercises, 100);
      for (const chunk of chunks) {
        const exerciseRows = chunk.map(ex => ({
          id: ex.id,
          user_id: userId,
          name: ex.name,
          primary_muscle_groups: ex.primaryMuscleGroups || [],
          secondary_muscle_groups: ex.secondaryMuscleGroups || [],
          equipment: ex.equipment,
          cable_accessory: ex.cableAccessory || null,
          machine_weight_type: ex.machineWeightType || null,
          location_ids: ex.locationIds || [],
          is_custom: ex.isCustom ?? true,
          is_favorite: ex.isFavorite ?? false,
        }));

        const { error } = await upsertTolerant('exercises', exerciseRows, ['is_favorite']);

        if (error) {
          console.error('Exercise migration error:', error);
        } else {
          counts.exercises += exerciseRows.length;
        }
      }
    }

    // ============================================================
    // 3. TEMPLATES
    // ============================================================
    if (templates.length > 0) {
      const templateRows = templates.map(t => ({
        id: t.id,
        user_id: userId,
        name: t.name,
        type: t.type || null,
        location_id: t.locationId || null,
        exercise_ids: t.exerciseIds || [],
      }));

      const { error } = await supabase
        .from('templates')
        .upsert(templateRows, { onConflict: 'id' });

      if (error) {
        console.error('Template migration error:', error);
      } else {
        counts.templates = templateRows.length;
      }
    }

    // ============================================================
    // 4. ROUTINES
    // ============================================================
    if (routines.length > 0) {
      const routineRows = routines.map(r => ({
        id: r.id,
        user_id: userId,
        name: r.name,
        day_schedule: r.daySchedule || [],
        is_active: r.isActive ?? false,
      }));

      const { error } = await supabase
        .from('routines')
        .upsert(routineRows, { onConflict: 'id' });

      if (error) {
        console.error('Routine migration error:', error);
      } else {
        counts.routines = routineRows.length;
      }
    }

    // ============================================================
    // 5. SUPPLEMENTS
    // ============================================================
    if (supplements.length > 0) {
      const supplementRows = supplements.map(s => ({
        id: s.id,
        user_id: userId,
        name: s.name,
        sort_order: s.sortOrder ?? 0,
        is_active: s.isActive ?? true,
      }));

      const { error } = await supabase
        .from('supplements')
        .upsert(supplementRows, { onConflict: 'id' });

      if (error) {
        console.error('Supplement migration error:', error);
      } else {
        counts.supplements = supplementRows.length;
      }
    }

    // ============================================================
    // 6. WORKOUTS
    // ============================================================
    if (workouts.length > 0) {
      const chunks = chunkArray(workouts, 100);
      for (const chunk of chunks) {
        const workoutRows = chunk.map(w => ({
          id: w.id,
          user_id: userId,
          template_id: w.templateId || null,
          started_at: w.startedAt,
          completed_at: w.completedAt || null,
          skipped_exercise_ids: w.skippedExerciseIds || [],
          // Per-gym history depends on these surviving the upload.
          location_id: w.locationId || null,
          is_deload: w.isDeload ?? false,
        }));

        const { error } = await upsertTolerant('workouts', workoutRows, [
          'skipped_exercise_ids',
          'location_id',
          'is_deload',
        ]);

        if (error) {
          console.error('Workout migration error:', error);
        } else {
          counts.workouts += workoutRows.length;
        }
      }
    }

    // ============================================================
    // 7. WORKOUT SETS (largest table - ~8900 rows)
    // ============================================================
    if (sets.length > 0) {
      const chunks = chunkArray(sets, 100);
      for (const chunk of chunks) {
        const setRows = chunk.map(s => ({
          id: s.id,
          user_id: userId,
          workout_id: s.workoutId,
          exercise_id: s.exerciseId,
          reps: s.reps,
          weight: s.weight,
          logged_at: s.loggedAt || new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('workout_sets')
          .upsert(setRows, { onConflict: 'id' });

        if (error) {
          console.error('Set migration error (chunk):', error);
        } else {
          counts.sets += setRows.length;
        }
      }
    }

    // ============================================================
    // 8. SUPPLEMENT INTAKES
    // ============================================================
    if (supplementIntakes.length > 0) {
      const chunks = chunkArray(supplementIntakes, 100);
      for (const chunk of chunks) {
        const intakeRows = chunk.map(i => ({
          id: i.id,
          user_id: userId,
          supplement_id: i.supplementId,
          date: i.date,
          taken_at: i.takenAt || new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('supplement_intakes')
          .upsert(intakeRows, { onConflict: 'id' });

        if (error) {
          console.error('Supplement intake migration error:', error);
        } else {
          counts.supplementIntakes += intakeRows.length;
        }
      }
    }

    // ============================================================
    // 9. USER SETTINGS
    // ============================================================
    const { error: settingsError } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        week_start_day: userSettings.weekStartDay || 'sunday',
        rest_timer_seconds: userSettings.restTimerSeconds || 90,
        daily_goals: userSettings.dailyGoals || {},
        weekly_goals: userSettings.weeklyGoals || {},
        muscle_group_targets: userSettings.muscleGroupTargets || {},
      }, { onConflict: 'user_id' });

    if (settingsError) {
      console.error('Settings migration error:', settingsError);
    }

    // Mark migration as complete
    await AsyncStorage.setItem(MIGRATION_KEY, 'true');

    console.log('Migration complete:', counts);
    return { success: true, counts };
  } catch (error: any) {
    console.error('Migration failed:', error);
    return { success: false, counts, error: error.message || 'Unknown error' };
  }
}

/**
 * Get migration status/stats for display.
 */
export async function getMigrationStats(): Promise<{
  localCounts: {
    exercises: number;
    templates: number;
    workouts: number;
    sets: number;
    supplements: number;
    routines: number;
  };
  isMigrated: boolean;
}> {
  const [exercises, templates, workouts, sets, supplements, routines] = await Promise.all([
    getExercises(),
    getTemplates(),
    getWorkouts(),
    getSets(),
    getSupplements(),
    getRoutines(),
  ]);

  const isMigrated = await isMigrationComplete();

  return {
    localCounts: {
      exercises: exercises.length,
      templates: templates.length,
      workouts: workouts.length,
      sets: sets.length,
      supplements: supplements.length,
      routines: routines.length,
    },
    isMigrated,
  };
}

/**
 * Reset migration flag (for testing/re-migration).
 */
export async function resetMigration(): Promise<void> {
  await AsyncStorage.removeItem(MIGRATION_KEY);
}

// ============================================================
// HELPERS
// ============================================================

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
