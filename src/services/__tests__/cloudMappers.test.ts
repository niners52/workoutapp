/**
 * What a restore keeps. Tyler moved to a new iPhone on 2026-09-24 and the
 * restore came back with every exercise at the default 3 sets: target sets
 * were never uploaded, and unilateral flags and notes were dropped on the way
 * back down. These are the fields a restore must not lose.
 */
import { bodyMeasurementFromRow, exerciseFromRow, setFromRow, workoutFromRow } from '../cloudMappers';

test('exercise: target sets, unilateral and notes survive the round trip', () => {
  const e = exerciseFromRow({
    id: 'seated-leg-extension',
    name: 'Machine Seated Leg Extension',
    base_name: 'Seated Leg Extension',
    primary_muscle_groups: ['quads'],
    secondary_muscle_groups: [],
    equipment: 'machine',
    is_unilateral: true,
    target_sets: 6,
    notes: 'pin 9, seat 4',
    is_favorite: true,
  });
  expect(e).toMatchObject({ isUnilateral: true, targetSets: 6, notes: 'pin 9, seat 4', isFavorite: true });
});

test('exercise: absent optional columns stay absent rather than becoming false or 0', () => {
  const e = exerciseFromRow({ id: 'x', name: 'X', equipment: 'cable' });
  expect('isUnilateral' in e).toBe(false);
  expect('targetSets' in e).toBe(false);
  expect('notes' in e).toBe(false);
  expect(e.isFavorite).toBe(false);
  expect(e.primaryMuscleGroups).toEqual([]);
});

test('exercise: a false unilateral flag is kept, not dropped', () => {
  expect(exerciseFromRow({ id: 'x', name: 'X', is_unilateral: false }).isUnilateral).toBe(false);
});

test('workout: the gym and the deload flag survive', () => {
  const w = workoutFromRow({
    id: 'w1',
    started_at: '2026-09-25T13:34:31Z',
    completed_at: '2026-09-25T14:35:19Z',
    template_id: null,
    location_id: 'vasa',
    is_deload: true,
    skipped_exercise_ids: ['a'],
  });
  expect(w).toMatchObject({ locationId: 'vasa', isDeload: true, skippedExerciseIds: ['a'] });
});

test('workout: no gym recorded stays no gym', () => {
  const w = workoutFromRow({ id: 'w2', started_at: 'x', completed_at: null, template_id: null, location_id: null, is_deload: false });
  expect('locationId' in w).toBe(false);
  expect('isDeload' in w).toBe(false);
});

test('set: the Wide / Narrow variant survives', () => {
  expect(setFromRow({ id: 's1', workout_id: 'w1', exercise_id: 'fly', reps: 12, weight: 55, logged_at: 'x', variant: 'Narrow' }))
    .toMatchObject({ variant: 'Narrow', weight: 55 });
  expect('variant' in setFromRow({ id: 's2', workout_id: 'w1', exercise_id: 'curl', reps: 8, weight: 30, logged_at: 'x' })).toBe(false);
});

test('body measurement: weight and source survive', () => {
  expect(bodyMeasurementFromRow({ id: 'b1', date: '2026-09-13', weight: 183.4, source: 'healthkit' }))
    .toMatchObject({ weight: 183.4, source: 'healthkit' });
});
