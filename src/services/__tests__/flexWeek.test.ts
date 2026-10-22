/**
 * Five days and Flex, on the week of 2026-10-19 as it went: Monday's leg press
 * skipped, Tuesday's glute push skipped, Wednesday done, and Thursday morning's
 * session still to come.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  DEFAULT_USER_SETTINGS,
  type Exercise,
  type Routine,
  type Template,
  type UserSettings,
  type Workout,
  type WorkoutSet,
} from '../../types';
import { computeWeeklyVolume } from '../analytics';
import { flexPlan, flexWeekKey, withAdded, withRemoved } from '../flexPlan';
import { remainingPlan, thisWeekRows } from '../thisWeek';

const THURSDAY_EVENING = new Date(2026, 9, 22, 18, 0);
const d = (day: number, hour = 6) => new Date(2026, 9, day, hour).toISOString();

const ex = (id: string, groups: string[], locationIds: string[], over: Partial<Exercise> = {}): Exercise =>
  ({ id, name: id, equipment: 'machine', primaryMuscleGroups: groups, secondaryMuscleGroups: [], locationIds, targetSets: 3, ...over }) as Exercise;

const EXERCISES: Exercise[] = [
  ex('leg-press', ['quads'], ['gym', 'vasa-']),
  ex('leg-curl', ['hamstrings'], ['gym']),
  ex('incline', ['chest'], ['gym']),
  ex('glute-push', ['glutes'], ['gym'], { isUnilateral: true, targetSets: 6 }),
  ex('row', ['mid_back'], ['gym']),
  ex('hammer-curl', ['biceps'], ['gym', 'vasa-']),
  ex('preacher', ['biceps'], ['gym']),
  ex('v-squat', ['quads', 'hamstrings', 'glutes'], ['vasa-']), // day 6, Vasa only
  ex('glute-drive', ['glutes'], ['vasa-']), // day 6, Vasa only
  ex('cuff', ['rotator_cuff'], ['gym'], { defaultWarmup: true }),
  ex('cable-fly', ['chest'], ['gym']),
  ex('shrug', ['traps'], ['gym']),
];

const t = (id: string, exerciseIds: string[], locationId = 'gym'): Template =>
  ({ id, name: id, type: 'full_body', locationId, exerciseIds });
const TEMPLATES = [
  t('fb1', ['incline', 'leg-press']),
  t('fb2', ['row', 'glute-push']),
  t('fb3', ['preacher', 'leg-curl']),
  t('fb4', ['incline', 'row']),
  t('fb5', ['leg-curl', 'hammer-curl']),
  t('pool', ['v-squat', 'glute-drive'], 'vasa-'),
];
const ROUTINE: Routine = {
  id: 'r',
  name: 'Five days',
  isActive: true,
  daySchedule: [
    { day: 0, templateIds: [] },
    { day: 1, templateIds: ['fb1'] },
    { day: 2, templateIds: ['fb2'] },
    { day: 3, templateIds: ['fb3'] },
    { day: 4, templateIds: ['fb4'] },
    { day: 5, templateIds: ['fb5'] },
    { day: 6, templateIds: [], notes: 'Flex' },
  ],
};
const settings: UserSettings = {
  ...DEFAULT_USER_SETTINGS,
  weekStartDay: 'monday',
  muscleGroupTargets: { chest: 6, quads: 6, hamstrings: 6, glutes: 6, mid_back: 6, biceps: 6 },
};

let n = 0;
const sets = (exerciseId: string, count: number, workoutId: string, iso: string, over: Partial<WorkoutSet> = {}) =>
  Array.from({ length: count }, () => ({ id: `s${n++}`, workoutId, exerciseId, reps: 10, weight: 50, loggedAt: iso, ...over }) as WorkoutSet);
const w = (id: string, iso: string, templateId: string | null, over: Partial<Workout> = {}): Workout =>
  ({ id, startedAt: iso, completedAt: iso, templateId, locationId: 'gym', ...over }) as Workout;

// Monday: incline only (leg press skipped). Tuesday: row only (glute push
// skipped). Wednesday: both. Plus warm-ups and a deload set that must not count.
const WORKOUTS = [w('mon', d(19), 'fb1'), w('tue', d(20), 'fb2'), w('wed', d(21), 'fb3'), w('old-deload', d(21, 20), null, { isDeload: true })];
const SETS = [
  ...sets('incline', 3, 'mon', d(19)),
  ...sets('cuff', 8, 'mon', d(19)),
  ...sets('row', 3, 'tue', d(20)),
  ...sets('preacher', 3, 'wed', d(21)),
  ...sets('leg-curl', 3, 'wed', d(21)),
  ...sets('leg-press', 9, 'old-deload', d(21, 20)),
];

const volume = (s = SETS, wk = WORKOUTS) => computeWeeklyVolume(s, wk, EXERCISES, settings, THURSDAY_EVENING).muscleGroups;

describe('Flex', () => {
  const plan = (over: Partial<Parameters<typeof flexPlan>[0]> = {}) =>
    flexPlan({
      routine: ROUTINE,
      templates: TEMPLATES,
      workouts: WORKOUTS,
      sets: SETS,
      exercises: EXERCISES,
      volume: volume(),
      poolTemplateId: 'pool',
      weekStartDay: 'monday',
      now: THURSDAY_EVENING,
      locationId: 'vasa-',
      ...over,
    });

  test('collects what the week missed, oldest first, then the day-6 pool', () => {
    // At Planet Fitness: both misses, and the Vasa V-squat stands in as the
    // leg curl. The glute drive has no Planet Fitness stand-in, and glutes are
    // already on the list via the glute push, so it is left off.
    const atPf = plan({ locationId: 'gym' });
    expect(atPf.map(i => [i.exerciseId, i.reason, i.dayLabel ?? null, i.insteadOf ?? null])).toEqual([
      ['leg-press', 'missed', 'Monday', null],
      ['glute-push', 'missed', 'Tuesday', null],
      ['leg-curl', 'day6', null, 'v-squat'],
    ]);

    // At Vasa: the glute push is a Planet Fitness machine and the day-6 work
    // covers glutes, so Flex is the leg press plus Vasa's own day 6.
    expect(plan({ locationId: 'vasa-' }).map(i => [i.exerciseId, i.reason])).toEqual([
      ['leg-press', 'missed'],
      ['v-squat', 'day6'],
      ['glute-drive', 'day6'],
    ]);
  });

  test('deload sets do not make a skipped exercise count as done', () => {
    // The only leg press this week was in a deload session.
    expect(plan().find(i => i.exerciseId === 'leg-press')?.reason).toBe('missed');
  });

  test("today's plan is not missed until today's session has finished", () => {
    // Thursday's fb4 has not run yet, so incline and row are not on Flex.
    expect(plan().some(i => i.dayLabel === 'Thursday')).toBe(false);

    const ranThisMorning = [...WORKOUTS, w('thu', d(22), 'fb4')];
    const after = plan({ workouts: ranThisMorning, sets: [...SETS, ...sets('incline', 3, 'thu', d(22))] });
    // Row was skipped this morning: it is Flex's now. Incline was done.
    expect(after.find(i => i.exerciseId === 'row')).toMatchObject({ reason: 'missed', dayLabel: 'Thursday' });
    expect(after.some(i => i.exerciseId === 'incline')).toBe(false);
  });

  test('at Planet Fitness, Vasa-only work is swapped for what this gym has for the same muscle', () => {
    const items = plan({ locationId: 'gym', sets: [...SETS, ...sets('glute-push', 2, 'old', d(12))] });
    const squat = items.find(i => i.insteadOf === 'v-squat');
    expect(squat?.exerciseId).not.toBe('v-squat');
    expect(items.every(i => i.exerciseId !== 'glute-drive')).toBe(true);
  });

  test('a swap inside a session pays off the planned exercise: Cable Fly where Incline was planned', () => {
    // Monday as it really went: the plan said incline, the gym was busy, cable fly instead.
    const swappedMonday = SETS.filter(x => !(x.workoutId === 'mon' && x.exerciseId === 'incline')).concat(sets('cable-fly', 3, 'mon', d(19)));
    const items = plan({ sets: swappedMonday, volume: volume(swappedMonday), locationId: 'gym' });
    expect(items.some(i => i.exerciseId === 'incline')).toBe(false);
  });

  test('a different muscle in its place is not a swap', () => {
    const notASwap = SETS.filter(x => !(x.workoutId === 'mon' && x.exerciseId === 'incline')).concat(sets('shrug', 3, 'mon', d(19)));
    const items = plan({ sets: notASwap, volume: volume(notASwap), locationId: 'gym' });
    expect(items.find(i => i.exerciseId === 'incline')).toMatchObject({ reason: 'missed', dayLabel: 'Monday' });
  });

  test("a workout entered without its template still counts as that day's session", () => {
    // Thursday logged by hand, no template picked: rows done, incline not.
    const byHand = [...WORKOUTS, w('thu-hand', d(22, 15), null)];
    const handSets = [...SETS, ...sets('row', 3, 'thu-hand', d(22, 15))];
    const items = plan({ workouts: byHand, sets: handSets, volume: volume(handSets, byHand), locationId: 'gym' });
    expect(items.find(i => i.exerciseId === 'incline')).toMatchObject({ reason: 'missed', dayLabel: 'Thursday' });

    const scheduled = remainingPlan({ routine: ROUTINE, templates: TEMPLATES, workouts: byHand, sets: handSets, weekStartDay: 'monday', now: THURSDAY_EVENING });
    expect(scheduled.map(p => p.dayLabel)).toEqual(['Friday']);
  });

  test('an unrelated hand-entered workout does not close out today', () => {
    const unrelated = [...WORKOUTS, w('thu-other', d(22, 15), null)];
    const otherSets = [...SETS, ...sets('shrug', 3, 'thu-other', d(22, 15))];
    const scheduled = remainingPlan({ routine: ROUTINE, templates: TEMPLATES, workouts: unrelated, sets: otherSets, weekStartDay: 'monday', now: THURSDAY_EVENING });
    expect(scheduled.map(p => p.dayLabel)).toEqual(['Thursday', 'Friday']);
  });

  test('a skipped exercise done later in the week reads as missed on the day it was skipped', () => {
    // Leg press on Monday's and Thursday's plans; skipped Monday, done Thursday by hand.
    const twice: Template[] = TEMPLATES.map(x => (x.id === 'fb4' ? { ...x, exerciseIds: ['incline', 'row', 'leg-press'] } : x));
    const thu = [...WORKOUTS, w('thu', d(22, 15), null)];
    const thuSets = [...SETS, ...sets('leg-press', 3, 'thu', d(22, 15)), ...sets('incline', 3, 'thu', d(22, 15)), ...sets('row', 3, 'thu', d(22, 15))];
    const items = plan({ templates: twice, workouts: thu, sets: thuSets, volume: volume(thuSets, thu), locationId: 'gym' });
    expect(items.filter(i => i.exerciseId === 'leg-press').map(i => i.dayLabel)).toEqual(['Monday']);
  });

  test('a muscle already at target drops its Flex items', () => {
    const doneGlutes = [...SETS, ...sets('glute-push', 12, 'wed', d(21))];
    const items = plan({ sets: doneGlutes, volume: volume(doneGlutes) });
    expect(items.some(i => i.muscleGroups.length === 1 && i.muscleGroups[0] === 'glutes')).toBe(false);
  });

  test('edits stick for the week and are ignored once it ends', () => {
    const week = flexWeekKey('monday', THURSDAY_EVENING);
    let edits = withRemoved(null, week, 'glute-drive');
    edits = withAdded(edits, week, 'hammer-curl');
    const items = plan({ edits });
    expect(items.some(i => i.exerciseId === 'glute-drive')).toBe(false);
    expect(items.at(-1)).toMatchObject({ exerciseId: 'hammer-curl', reason: 'added' });

    const nextWeek = plan({ edits, now: new Date(2026, 9, 27, 18, 0) });
    expect(nextWeek.some(i => i.exerciseId === 'hammer-curl' && i.reason === 'added')).toBe(false);
  });

  test('removing then adding back clears the removal', () => {
    const week = flexWeekKey('monday', THURSDAY_EVENING);
    const edits = withAdded(withRemoved(null, week, 'leg-press'), week, 'leg-press');
    expect(edits.removed).toEqual([]);
  });

  test('prep work is never on Flex', () => {
    const items = plan({ edits: null });
    expect(items.some(i => i.exerciseId === 'cuff')).toBe(false);
  });
});

describe('This week: done, scheduled, Flex', () => {
  const plan = remainingPlan({ routine: ROUTINE, templates: TEMPLATES, workouts: WORKOUTS, weekStartDay: 'monday', now: THURSDAY_EVENING });
  const rows = thisWeekRows({ volume: volume(), plan, exercises: EXERCISES });
  const row = (g: string) => rows.find(r => r.muscleGroup === g)!;

  test("Thursday's plan still counts tonight; Saturday is Flex, so nothing is scheduled then", () => {
    expect(plan.map(p => p.dayLabel)).toEqual(['Thursday', 'Friday']);
  });

  test('the three numbers add up to the target', () => {
    for (const r of rows) {
      if (r.done < r.target) expect(r.done + r.scheduled + r.flex).toBeCloseTo(r.target);
    }
  });

  test('a muscle with nothing left on the schedule is all Flex', () => {
    // Quads: the leg press was skipped Monday, and the deload sets do not count.
    expect(row('quads')).toMatchObject({ done: 0, scheduled: 0, flex: 6 });
  });

  test('scheduled sets name their days', () => {
    expect(row('chest')).toMatchObject({ done: 3, scheduled: 3, scheduledDays: ['Thursday'], flex: 0 });
    expect(row('hamstrings')).toMatchObject({ done: 3, scheduled: 3, scheduledDays: ['Friday'], flex: 0 });
  });

  test('a swap inside a muscle closes it: hammer curl and preacher both count as biceps', () => {
    // 3 preacher done Wednesday + 3 hammer curl scheduled Friday = 6 of 6.
    expect(row('biceps')).toMatchObject({ done: 3, scheduled: 3, flex: 0 });
  });

  test('unilateral sets count half, done or scheduled', () => {
    const halfDone = [...SETS, ...sets('glute-push', 4, 'wed', d(21))];
    const r = thisWeekRows({ volume: volume(halfDone), plan, exercises: EXERCISES }).find(x => x.muscleGroup === 'glutes')!;
    expect(r.done).toBe(2);
    expect(r.flex).toBe(4);
  });

  test('warm-ups never count as done', () => {
    // 8 rotator-cuff prep sets on Monday; rotator cuff has no target and the
    // sets reach no other muscle.
    expect(rows.reduce((s, r) => s + r.done, 0)).toBe(12);
  });
});
