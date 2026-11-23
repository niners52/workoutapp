/**
 * Cloud row -> local record. Every field the app keeps that the cloud also
 * stores has to be mapped here: whatever this drops is silently lost on a
 * restore to a new phone, which is how target sets, unilateral flags and notes
 * went missing when Tyler moved to a new iPhone (2026-09-24).
 *
 * Pure on purpose, so the mapping is testable without Supabase.
 */
import type { BodyMeasurement, Exercise, Routine, Template, UserSettings, Workout, WorkoutLocation, WorkoutSet } from '../types';

export function exerciseFromRow(row: any): Exercise {
  return {
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
    // Dropping this made every unilateral exercise count full credit toward
    // weekly volume and target half the sets it should.
    ...(typeof row.is_unilateral === 'boolean' ? { isUnilateral: row.is_unilateral } : {}),
    ...(typeof row.target_sets === 'number' ? { targetSets: row.target_sets } : {}),
    ...(typeof row.target_reps === 'string' && row.target_reps ? { targetReps: row.target_reps } : {}),
    ...(typeof row.default_warmup === 'boolean' ? { defaultWarmup: row.default_warmup } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  } as Exercise;
}

export function templateFromRow(row: any): Template {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    locationId: row.location_id || '',
    exerciseIds: row.exercise_ids || [],
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  } as Template;
}

export function routineFromRow(row: any): Routine {
  return {
    id: row.id,
    name: row.name,
    daySchedule: row.day_schedule || [],
    isActive: row.is_active ?? false,
    ...(row.rotation && Array.isArray(row.rotation.slots) ? { rotation: row.rotation } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  } as Routine;
}

export function locationFromRow(row: any): WorkoutLocation {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order ?? 0,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

/** The cloud-backed part of user_settings, in local field names. */
export function cloudSettingsFromRow(row: any): Partial<UserSettings> {
  const out: Partial<UserSettings> = {};
  if (row.week_start_day) out.weekStartDay = row.week_start_day;
  if (row.units) out.units = row.units;
  if (typeof row.rest_timer_seconds === 'number') out.restTimerSeconds = row.rest_timer_seconds;
  if (typeof row.minimum_sets_per_exercise === 'number') out.minimumSetsPerExercise = row.minimum_sets_per_exercise;
  if (row.daily_goals && typeof row.daily_goals === 'object') out.dailyGoals = row.daily_goals;
  if (row.weekly_goals && typeof row.weekly_goals === 'object') out.weeklyGoals = row.weekly_goals;
  if (row.muscle_group_targets && typeof row.muscle_group_targets === 'object') out.muscleGroupTargets = row.muscle_group_targets;
  if ('creatine_supplement_id' in row) out.creatineSupplementId = row.creatine_supplement_id ?? undefined;
  if (row.health_targets && typeof row.health_targets === 'object') out.healthTargets = row.health_targets;
  if (row.updated_at) out.updatedAt = row.updated_at;
  return out;
}

/**
 * Optional fields each table stores in the cloud. A newer cloud row replaces
 * them, so a field cleared in the cloud is cleared on the phone too; fields
 * the cloud does not store stay as they are.
 */
export const CLOUD_OPTIONAL_FIELDS: Record<string, string[]> = {
  exercises: ['baseName', 'cableAccessory', 'machineWeightType', 'isBodyweight', 'isUnilateral', 'targetSets', 'targetReps', 'defaultWarmup', 'notes'],
  templates: ['type', 'notes'],
  routines: ['rotation'],
  workout_locations: [],
  body_measurements: ['weight', 'bodyFatPercentage', 'heightInches', 'type', 'value', 'syncedAt', 'skeletalMuscleLbs', 'leanMassLbs', 'visceralFatArea', 'ecwTbw', 'phaseAngle', 'scanType'],
};

export function workoutFromRow(row: any): Workout {
  return {
    id: row.id,
    templateId: row.template_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    ...(row.skipped_exercise_ids?.length ? { skippedExerciseIds: row.skipped_exercise_ids } : {}),
    // Keep the gym and deload flag on restore — dropping them here is what made
    // restored devices treat every exercise as never-done-at-this-location.
    ...(row.location_id ? { locationId: row.location_id } : {}),
    ...(row.is_deload ? { isDeload: true } : {}),
  } as Workout;
}

export function setFromRow(row: any): WorkoutSet {
  return {
    id: row.id,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    reps: row.reps,
    weight: row.weight,
    loggedAt: row.logged_at,
    // Wide / Narrow on an exercise with variants.
    ...(row.variant ? { variant: row.variant } : {}),
    ...(typeof row.is_warmup === 'boolean' ? { isWarmup: row.is_warmup } : {}),
  } as WorkoutSet;
}

export function bodyMeasurementFromRow(row: any): BodyMeasurement {
  return {
    id: row.id,
    date: row.date,
    weight: row.weight ?? undefined,
    bodyFatPercentage: row.body_fat_percentage ?? undefined,
    heightInches: row.height_inches ?? undefined,
    type: row.type ?? undefined,
    value: row.value ?? undefined,
    source: row.source || 'manual',
    syncedAt: row.synced_at ?? undefined,
    ...(row.skeletal_muscle_lbs != null ? { skeletalMuscleLbs: Number(row.skeletal_muscle_lbs) } : {}),
    ...(row.lean_mass_lbs != null ? { leanMassLbs: Number(row.lean_mass_lbs) } : {}),
    ...(row.visceral_fat_area != null ? { visceralFatArea: Number(row.visceral_fat_area) } : {}),
    ...(row.ecw_tbw != null ? { ecwTbw: Number(row.ecw_tbw) } : {}),
    ...(row.phase_angle != null ? { phaseAngle: Number(row.phase_angle) } : {}),
    ...(row.scan_type ? { scanType: row.scan_type } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  } as BodyMeasurement;
}
