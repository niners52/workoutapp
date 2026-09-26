/**
 * Cloud row -> local record. Every field the app keeps that the cloud also
 * stores has to be mapped here: whatever this drops is silently lost on a
 * restore to a new phone, which is how target sets, unilateral flags and notes
 * went missing when Tyler moved to a new iPhone (2026-09-24).
 *
 * Pure on purpose, so the mapping is testable without Supabase.
 */
import type { BodyMeasurement, Exercise, Workout, WorkoutSet } from '../types';

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
    ...(row.notes ? { notes: row.notes } : {}),
  } as Exercise;
}

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
  } as BodyMeasurement;
}
