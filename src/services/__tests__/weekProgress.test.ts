/**
 * The already-done note. Tyler trains mornings and some nights, so the same
 * exercise can appear twice in one week's plan: doing it once should mark it
 * done, not nag. What is still owed is counted by muscle group in weekGaps.
 */
import type { Exercise, Workout, WorkoutSet } from '../../types';
import { doneThisWeekByExercise } from '../weekProgress';

// Week of Mon 2026-09-21; "now" is Thursday evening.
const now = new Date(2026, 8, 24, 19, 0);
const at = (day: number, hour = 11) => new Date(2026, 8, day, hour).toISOString();

const ex = (id: string): Exercise => ({ id, name: id, equipment: 'cable' }) as Exercise;
const exercises = [ex('bench'), ex('row'), ex('curl'), ex('squat')];
const set = (id: string, exerciseId: string, workoutId: string, iso: string): WorkoutSet =>
  ({ id, workoutId, exerciseId, reps: 10, weight: 100, loggedAt: iso }) as WorkoutSet;
const workout = (id: string, iso: string, skipped: string[] = []): Workout =>
  ({ id, startedAt: iso, completedAt: iso, templateId: 't', ...(skipped.length ? { skippedExerciseIds: skipped } : {}) }) as Workout;

test('done this week: reports the day and set count, and whether it was an earlier session', () => {
  const sets = [
    set('s1', 'bench', 'w-mon', at(21)),
    set('s2', 'bench', 'w-mon', at(21)),
    set('s3', 'row', 'w-thu', at(24)),
  ];
  const done = doneThisWeekByExercise(sets, 'monday', now, 'w-thu');
  expect(done.get('bench')).toMatchObject({ dayLabel: 'Monday', sets: 2, inEarlierWorkout: true });
  // Logged in the session being viewed, so the card should not say "already done".
  expect(done.get('row')).toMatchObject({ dayLabel: 'Thursday', sets: 1, inEarlierWorkout: false });
  expect(done.has('curl')).toBe(false);
});

test('done this week: last week does not count', () => {
  const done = doneThisWeekByExercise([set('s1', 'bench', 'w', at(18))], 'monday', now);
  expect(done.has('bench')).toBe(false);
});

