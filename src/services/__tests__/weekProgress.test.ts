/**
 * "Left this week" and the already-done note. Tyler trains mornings and some
 * nights, so the same exercise can appear twice in one week's plan: doing it
 * once should mark it done, not nag.
 */
import type { Exercise, Workout, WorkoutSet } from '../../types';
import { doneThisWeekByExercise, remainingThisWeek } from '../weekProgress';

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

const planned = [
  { exerciseId: 'bench', dayLabel: 'Monday' },
  { exerciseId: 'row', dayLabel: 'Tuesday' },
  { exerciseId: 'curl', dayLabel: 'Thursday' },
];

test('left this week: planned exercises with no sets yet, newest skip included', () => {
  const workouts = [workout('w-mon', at(21), ['squat'])];
  const sets = [set('s1', 'bench', 'w-mon', at(21))];
  const left = remainingThisWeek(planned, workouts, sets, exercises, 'monday', now);
  expect(left.map(r => [r.exercise.id, r.reason, r.dayLabel])).toEqual([
    ['curl', 'planned', 'Thursday'],
    ['row', 'planned', 'Tuesday'],
    ['squat', 'skipped', 'Monday'],
  ]);
});

test('left this week: doing it at any point this week clears it, whatever the plan said', () => {
  const workouts = [workout('w-mon', at(21), ['squat'])];
  // Squat was skipped Monday but done Wednesday night; row done Tuesday.
  const sets = [
    set('s1', 'bench', 'w-mon', at(21)),
    set('s2', 'row', 'w-tue', at(22)),
    set('s3', 'squat', 'w-wed', at(23, 20)),
  ];
  const left = remainingThisWeek(planned, workouts, sets, exercises, 'monday', now);
  expect(left.map(r => r.exercise.id)).toEqual(['curl']);
});

test('left this week: a dropped exercise stays off the list', () => {
  const left = remainingThisWeek(planned, [], [], exercises, 'monday', now, new Set(['curl']));
  expect(left.map(r => r.exercise.id)).toEqual(['bench', 'row']);
});

test('left this week: no routine, no plan — only skips carry over', () => {
  const workouts = [workout('w-mon', at(21), ['squat'])];
  const left = remainingThisWeek([], workouts, [], exercises, 'monday', now);
  expect(left.map(r => [r.exercise.id, r.reason])).toEqual([['squat', 'skipped']]);
});
