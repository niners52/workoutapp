/**
 * The rotation week: W1..W5 + Flex, derived from the logs.
 *
 * Covers what the spec lists: owed-list derivation, session vs template
 * edits, Flex priority order, target-met filtering, the time cap, location
 * substitution, the Monday reset in America/Chicago (late Sunday night
 * included), the 18-hour recovery warning and the progression flag.
 */
import {
  applySessionEdits,
  estimateMinutes,
  flexPlan,
  owedList,
  parseRepRange,
  progressionFlag,
  recoveryWarnings,
  rotationFromWeekdays,
  rotationState,
  sessionDiff,
  weekStartInZone,
  type PlanExercise,
  type PlanSet,
  type PlanTemplate,
  type PlanWorkout,
  type Rotation,
} from '../../../mcp-server/src/shared/weekPlan';

const TZ = 'America/Chicago';
// Week of Mon 2026-11-09 (Chicago is UTC-6 in November).
const WEEK_START = new Date('2026-11-09T06:00:00Z');
const at = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 10, day, hour + 6, minute)).toISOString(); // Chicago local -> UTC

const ex = (id: string, primary: string[], over: Partial<PlanExercise> = {}): PlanExercise => ({
  id,
  name: id,
  primary,
  locationIds: ['pf'],
  ...over,
});

const EXERCISES: PlanExercise[] = [
  ex('incline', ['chest']),
  ex('cable-fly', ['chest']),
  ex('pec-fly', ['chest']),
  ex('pulldown', ['lats']),
  ex('pullup', ['lats']),
  ex('row', ['mid_back']),
  ex('leg-press', ['quads']),
  ex('leg-ext', ['quads']),
  ex('leg-curl', ['hamstrings']),
  ex('lat-raise', ['side_delts']),
  ex('curl', ['biceps']),
  ex('pushdown', ['triceps']),
  ex('shrug', ['traps']),
  ex('crunch', ['abs']),
  ex('face-pull', ['rear_delts']),
  ex('calf', ['calves']),
  ex('cuff', ['rotator_cuff'], { defaultWarmup: true }),
  // Vasa-only machines.
  ex('vasa-row', ['mid_back'], { locationIds: ['vasa'] }),
  ex('vasa-press', ['chest'], { locationIds: ['vasa'] }),
  ex('vasa-squat', ['quads', 'hamstrings', 'glutes'], { locationIds: ['vasa'] }),
];

const TEMPLATES: PlanTemplate[] = [
  { id: 'fb1', name: 'Full Body 1', exerciseIds: ['incline', 'pulldown', 'leg-press', 'lat-raise', 'cuff'] },
  { id: 'fb2', name: 'Full Body 2', exerciseIds: ['row', 'leg-ext', 'pushdown', 'shrug'] },
  { id: 'fb3', name: 'Full Body 3', exerciseIds: ['pec-fly', 'pullup', 'leg-curl', 'curl', 'face-pull'] },
  { id: 'fb4', name: 'Full Body 4', exerciseIds: ['incline', 'row', 'crunch'] },
  { id: 'fb5', name: 'Full Body 5', exerciseIds: ['cable-fly', 'leg-curl', 'calf'] },
  { id: 'flex', name: 'Flex — day 6', exerciseIds: ['vasa-squat', 'vasa-row', 'shrug', 'calf'] },
];

const ROTATION: Rotation = rotationFromWeekdays(
  [
    { day: 0, templateIds: [] },
    { day: 1, templateIds: ['fb1'] },
    { day: 2, templateIds: ['fb2'] },
    { day: 3, templateIds: ['fb3'] },
    { day: 4, templateIds: ['fb4'] },
    { day: 5, templateIds: ['fb5'] },
    { day: 6, templateIds: ['flex'] },
  ],
);

let n = 0;
const sets = (exerciseId: string, count: number, workoutId: string, iso: string, over: Partial<PlanSet> = {}): PlanSet[] =>
  Array.from({ length: count }, (_, i) => ({
    workoutId,
    exerciseId,
    loggedAt: new Date(new Date(iso).getTime() + (n++ % 1) + i * 150_000).toISOString(),
    reps: 10,
    weight: 100,
    ...over,
  }));
const w = (id: string, iso: string, templateId: string | null, locationId = 'pf', over: Partial<PlanWorkout> = {}): PlanWorkout => ({
  id,
  templateId,
  startedAt: iso,
  completedAt: new Date(new Date(iso).getTime() + 3600_000).toISOString(),
  locationId,
  ...over,
});

const week = (workouts: PlanWorkout[], logged: PlanSet[], now = new Date(at(14, 8))) => {
  const input = { rotation: ROTATION, templates: TEMPLATES, workouts, sets: logged, exercises: EXERCISES, weekStart: WEEK_START, now };
  const state = rotationState(input);
  return { state, owed: owedList({ ...input, state }) };
};

describe('rotation from a weekday schedule', () => {
  test('Mon..Fri become W1..W5 and Saturday becomes the Flex default', () => {
    expect(ROTATION.slots.map(s => [s.label, s.templateId, s.usualDay])).toEqual([
      ['W1', 'fb1', 1],
      ['W2', 'fb2', 2],
      ['W3', 'fb3', 3],
      ['W4', 'fb4', 4],
      ['W5', 'fb5', 5],
    ]);
    expect(ROTATION.flexTemplateId).toBe('flex');
  });

  test('an empty Saturday falls back to the known Flex template', () => {
    const r = rotationFromWeekdays([{ day: 1, templateIds: ['fb1'] }, { day: 6, templateIds: [] }], 'flex');
    expect(r.flexTemplateId).toBe('flex');
  });
});

describe('rotation state and Next up', () => {
  test('Next up is the lowest-numbered workout not done yet, whatever day it is', () => {
    const { state } = week([w('mon', at(9, 6), 'fb1'), w('wed', at(11, 6), 'fb3')], []);
    expect(state.slots.filter(s => s.performed).map(s => s.slot.label)).toEqual(['W1', 'W3']);
    expect(state.nextUp?.slot.label).toBe('W2');
  });

  test('a session entered without its template counts against the workout it overlaps most', () => {
    const logged = [...sets('row', 3, 'hand', at(10, 6)), ...sets('shrug', 3, 'hand', at(10, 6))];
    const { state } = week([w('hand', at(10, 6), null)], logged);
    expect(state.slots.find(s => s.slot.label === 'W2')?.performed).toBe(true);
  });
});

describe('owed list', () => {
  const workouts = [w('mon', at(9, 6), 'fb1'), w('tue', at(10, 6), 'fb2')];
  // Monday: W1 without the leg press (machine broken). Tuesday: W2, plus the
  // leg press moved over from Monday.
  const logged = [
    ...sets('incline', 3, 'mon', at(9, 6)),
    ...sets('pulldown', 3, 'mon', at(9, 6)),
    ...sets('lat-raise', 3, 'mon', at(9, 6)),
    ...sets('cuff', 8, 'mon', at(9, 6)),
    ...sets('row', 3, 'tue', at(10, 6)),
    ...sets('leg-ext', 3, 'tue', at(10, 6)),
    ...sets('pushdown', 3, 'tue', at(10, 6)),
    ...sets('leg-press', 3, 'tue', at(10, 6)),
  ];

  test('an exercise moved to a later session credits its original workout', () => {
    const { owed } = week(workouts, logged);
    expect(owed.filter(o => o.slotLabel === 'W1')).toEqual([]);
  });

  test("an exercise skipped from a performed workout is owed, and named as skipped", () => {
    const { owed } = week(workouts, logged);
    expect(owed.filter(o => o.source === 'skipped').map(o => [o.slotLabel, o.exerciseId])).toEqual([['W2', 'shrug']]);
  });

  test('workouts not run yet are owed whole; prep work never is', () => {
    const { owed } = week(workouts, logged);
    expect(owed.filter(o => o.slotLabel === 'W3').map(o => o.exerciseId)).toEqual(['pec-fly', 'pullup', 'leg-curl', 'curl', 'face-pull']);
    expect(owed.some(o => o.exerciseId === 'cuff')).toBe(false);
  });

  test('a same-muscle swap inside the session pays off the planned exercise', () => {
    const swapped = logged.filter(s => !(s.workoutId === 'mon' && s.exerciseId === 'incline')).concat(sets('cable-fly', 3, 'mon', at(9, 6)));
    const { owed } = week(workouts, swapped);
    expect(owed.some(o => o.slotLabel === 'W1' && o.exerciseId === 'incline')).toBe(false);
  });

  test('a moved exercise is not mistaken for a swap when the later workout skipped a same-muscle lift', () => {
    // Tuesday skipped the leg extension and did Monday's leg press: W1 is
    // credited, and W2's leg extension is still owed.
    const moved = logged.filter(s => !(s.workoutId === 'tue' && s.exerciseId === 'leg-ext'));
    const { owed } = week(workouts, moved);
    expect(owed.filter(o => o.source === 'skipped').map(o => [o.slotLabel, o.exerciseId])).toEqual([
      ['W2', 'leg-ext'],
      ['W2', 'shrug'],
    ]);
  });

  test('warm-up sets do not count as doing the exercise', () => {
    const warmOnly = logged.map(s => (s.exerciseId === 'pushdown' ? { ...s, isWarmup: true } : s));
    const { owed } = week(workouts, warmOnly);
    expect(owed.some(o => o.exerciseId === 'pushdown' && o.source === 'skipped')).toBe(true);
  });

  test('an exercise on two workouts needs two sessions', () => {
    // Incline is on W1 and W4; done once (Monday). W4 has not run.
    const { owed } = week([...workouts, w('thu', at(12, 6), 'fb4')], [...logged, ...sets('row', 3, 'thu', at(12, 6)), ...sets('crunch', 3, 'thu', at(12, 6))]);
    expect(owed.filter(o => o.exerciseId === 'incline').map(o => o.slotLabel)).toEqual(['W4']);
  });
});

describe('Monday reset in America/Chicago', () => {
  test('a late-Sunday-night session belongs to the week that is ending', () => {
    // Sunday 2026-11-15 23:30 Chicago = Monday 05:30 UTC.
    const sundayNight = new Date('2026-11-16T05:30:00Z');
    expect(weekStartInZone(sundayNight, TZ, 'monday').toISOString()).toBe('2026-11-09T06:00:00.000Z');
  });

  test('just after midnight Monday, a new week starts with nothing carried over', () => {
    const mondayEarly = new Date('2026-11-16T06:05:00Z'); // 00:05 Chicago
    const start = weekStartInZone(mondayEarly, TZ, 'monday');
    expect(start.toISOString()).toBe('2026-11-16T06:00:00.000Z');

    const lastWeek = [w('sun', '2026-11-16T05:30:00Z', 'fb1')];
    const input = { rotation: ROTATION, templates: TEMPLATES, workouts: lastWeek, sets: sets('incline', 3, 'sun', '2026-11-16T05:30:00Z'), exercises: EXERCISES, weekStart: start, now: mondayEarly };
    const state = rotationState(input);
    expect(state.nextUp?.slot.label).toBe('W1');
    // Owed is just this week's rotation, not doubled with last week's.
    expect(owedList({ ...input, state }).filter(o => o.exerciseId === 'incline')).toHaveLength(2);
  });

  test('daylight-saving change: the March week still starts at local midnight', () => {
    // DST began Sun 2026-03-08; Monday 03-09 midnight is UTC-5.
    expect(weekStartInZone(new Date('2026-03-12T18:00:00Z'), TZ, 'monday').toISOString()).toBe('2026-03-09T05:00:00.000Z');
  });
});

describe('Flex', () => {
  const doneWeek = () => {
    // Everything W1..W5 ran, with two build-tier skips (incline, shrug),
    // one maintain-tier skip (curl) and one covered-tier skip (calf).
    const ws = [
      w('w1', at(9, 6), 'fb1'),
      w('w2', at(10, 6), 'fb2'),
      w('w3', at(11, 6), 'fb3'),
      w('w4', at(12, 6), 'fb4'),
      w('w5', at(13, 6), 'fb5'),
    ];
    const logged = [
      ...['pulldown', 'leg-press', 'lat-raise'].flatMap(e => sets(e, 3, 'w1', at(9, 6))),
      ...['row', 'leg-ext', 'pushdown'].flatMap(e => sets(e, 3, 'w2', at(10, 6))),
      ...['pec-fly', 'pullup', 'leg-curl', 'face-pull'].flatMap(e => sets(e, 3, 'w3', at(11, 6))),
      ...['incline', 'row', 'crunch'].flatMap(e => sets(e, 3, 'w4', at(12, 6))),
      ...['cable-fly', 'leg-curl'].flatMap(e => sets(e, 3, 'w5', at(13, 6))),
    ];
    return { ws, logged, ...week(ws, logged, new Date(at(14, 8))) };
  };
  const plan = (over: Partial<Parameters<typeof flexPlan>[0]> = {}) => {
    const { ws, logged, owed } = doneWeek();
    return flexPlan({
      owed,
      flexTemplate: TEMPLATES.find(t => t.id === 'flex')!,
      exercises: EXERCISES,
      doneByMuscle: { chest: 9, lats: 6, mid_back: 6, traps: 0, quads: 6, hamstrings: 6, side_delts: 3 },
      targets: { chest: 15, lats: 12, mid_back: 6, traps: 9, quads: 12, hamstrings: 9, calves: 3 },
      locationId: 'pf',
      historySets: logged,
      historyWorkouts: ws,
      capMinutes: 200,
      ...over,
    });
  };

  test('priority: owed build first, then the Flex template, then owed maintain; covered left out', () => {
    const p = plan();
    const seq = p.items.map(i => [i.priority, i.insteadOf?.exerciseId ?? i.exerciseId]);
    // (a) build tier, skipped, in rotation order: W1's incline, W2's shrug.
    expect(seq.filter(([pr]) => pr === 'a')).toEqual([['a', 'incline'], ['a', 'shrug']]);
    // (c) maintain tier: W3's curl.
    expect(seq.filter(([pr]) => pr === 'c')).toEqual([['c', 'curl']]);
    // a before b before c, always.
    const order = p.items.map(i => i.priority);
    expect(order).toEqual([...order].sort());
    // W5's calf raise is covered tier: it is not owed work on Flex.
    expect(p.items.some(i => i.exerciseId === 'calf' && i.priority !== 'b')).toBe(false);
  });

  test('the Flex template skips anything whose muscles have met their weekly target', () => {
    // mid_back is at 6 of 6, so the Vasa row drops out of priority (b).
    const p = plan();
    expect(p.items.some(i => i.priority === 'b' && (i.insteadOf?.exerciseId ?? i.exerciseId) === 'vasa-row')).toBe(false);
    // Calves: 0 of 3, so the calf raise stays.
    expect(p.items.some(i => i.priority === 'b' && i.exerciseId === 'calf')).toBe(true);
  });

  test('time cap: items are taken in order while they fit; the rest expire Sunday', () => {
    const p = plan({ capMinutes: 16 });
    expect(p.totalMinutes).toBeLessThanOrEqual(16);
    expect(p.expiresSunday.length).toBeGreaterThan(0);
    // Order is still priority order within each list.
    const order = { a: 0, b: 1, c: 2, added: 3 } as const;
    const seq = p.items.map(i => order[i.priority]);
    expect(seq).toEqual([...seq].sort((x, y) => x - y));
  });

  test('location substitution: at Planet Fitness a Vasa-only machine becomes the same-muscle lift logged most there', () => {
    const p = plan();
    const squat = p.items.find(i => i.insteadOf?.exerciseId === 'vasa-squat');
    expect(squat).toBeDefined();
    expect(['leg-press', 'leg-ext', 'leg-curl']).toContain(squat!.exerciseId);
  });

  test('availability comes from history too: logged at Vasa once means available at Vasa', () => {
    const { ws, logged, owed } = doneWeek();
    const vasaVisit = w('old', '2026-10-01T15:00:00Z', null, 'vasa');
    const p = flexPlan({
      owed,
      flexTemplate: TEMPLATES.find(t => t.id === 'flex')!,
      exercises: EXERCISES,
      doneByMuscle: {},
      targets: {},
      locationId: 'vasa',
      historySets: [...logged, ...sets('curl', 3, 'old', '2026-10-01T15:00:00Z')],
      historyWorkouts: [...ws, vasaVisit],
      capMinutes: 500,
    });
    expect(p.items.find(i => i.exerciseId === 'curl')?.insteadOf).toBeUndefined();
  });

  test('a Flex default exercise done earlier this week is off Flex', () => {
    const { ws, logged } = doneWeek();
    const tonight = w('extra', at(13, 19), null);
    const withCalf = [...logged, ...sets('calf', 3, 'extra', at(13, 19))];
    const p = plan({ historySets: withCalf, historyWorkouts: [...ws, tonight], weekStart: WEEK_START, now: new Date(at(14, 8)) });
    expect(p.items.some(i => i.priority === 'b' && i.exerciseId === 'calf')).toBe(false);
  });

  test('so is a Flex default item whose stand-in at this gym was done this week', () => {
    // At Planet Fitness the Vasa squat is done as the quad lift logged most
    // here. Without the week, it is on Flex as that stand-in...
    const stand = plan().items.find(i => i.insteadOf?.exerciseId === 'vasa-squat');
    expect(stand).toBeDefined();
    // ...but that lift was already done this week (Monday's W1), so with the
    // week known the item is off.
    const p = plan({ weekStart: WEEK_START, now: new Date(at(14, 8)) });
    expect(p.items.some(i => i.insteadOf?.exerciseId === 'vasa-squat')).toBe(false);
  });

  test('done last week does not count', () => {
    const { ws, logged } = doneWeek();
    const lastWeek = w('old', '2026-11-05T18:00:00Z', null);
    const p = plan({
      historySets: [...logged, ...sets('calf', 3, 'old', '2026-11-05T18:00:00Z')],
      historyWorkouts: [...ws, lastWeek],
      weekStart: WEEK_START,
      now: new Date(at(14, 8)),
    });
    expect(p.items.some(i => i.priority === 'b' && i.exerciseId === 'calf')).toBe(true);
  });

  test('removed items stay off; added ones are always on', () => {
    const p = plan({ removed: ['shrug'], added: ['face-pull'] });
    expect(p.items.some(i => i.exerciseId === 'shrug')).toBe(false);
    expect(p.items.at(-1)).toMatchObject({ exerciseId: 'face-pull', priority: 'added' });
  });
});

describe('durations from history', () => {
  test('median gap between sets, times the sets planned; 2.5 min a set without history', () => {
    const logged: PlanSet[] = [0, 3, 6, 9].map(m => ({ workoutId: 'a', exerciseId: 'x', loggedAt: new Date(Date.UTC(2026, 0, 1, 12, m)).toISOString(), reps: 10, weight: 50 }));
    expect(estimateMinutes('x', 3, logged)).toBe(9);
    expect(estimateMinutes('never', 3, logged)).toBe(7.5);
  });
});

describe('recovery warning', () => {
  const now = new Date(at(12, 18)); // Thursday 6 pm
  const logged = [...sets('incline', 3, 'am', at(12, 6)), ...sets('cuff', 8, 'am', at(12, 6)), ...sets('row', 3, 'tue', at(10, 6))];

  test('a muscle trained in the last 18 hours is flagged for the second session of the day', () => {
    const warnings = recoveryWarnings({ exerciseIds: ['pec-fly', 'leg-curl', 'row'], exercises: EXERCISES, sets: logged, now });
    expect(warnings.map(x => [x.exerciseId, x.muscle])).toEqual([['pec-fly', 'chest']]);
    expect(warnings[0]!.hoursAgo).toBeGreaterThan(11);
  });

  test('warm-ups and the session itself do not count', () => {
    const own = [...sets('pec-fly', 3, 'pm', at(12, 18, -10))];
    const warnings = recoveryWarnings({
      exerciseIds: ['face-pull'],
      exercises: [...EXERCISES, ex('cuff-press', ['rotator_cuff'])],
      sets: [...logged, ...own],
      now,
      excludeWorkoutId: 'pm',
    });
    expect(warnings).toEqual([]);
  });

  test('outside 18 hours is fine', () => {
    expect(recoveryWarnings({ exerciseIds: ['row'], exercises: EXERCISES, sets: logged, now }).length).toBe(0);
  });
});

describe('progression flag', () => {
  const workouts = [w('a', at(9, 6), 'fb1'), w('b', at(12, 6), 'fb4')];

  test('every working set at the top of the range: add weight next time', () => {
    const logged = [...sets('incline', 3, 'a', at(9, 6), { reps: 9 }), ...sets('incline', 3, 'b', at(12, 6), { reps: 12 })];
    const flag = progressionFlag({ exercise: { ...EXERCISES[0]!, targetReps: '8-12' }, sets: logged, workouts });
    expect(flag).toMatchObject({ workoutId: 'b', topOfRange: 12, workingSets: 3 });
  });

  test('one set short of the top: no flag', () => {
    const logged = [...sets('incline', 2, 'b', at(12, 6), { reps: 12 }), ...sets('incline', 1, 'b', at(12, 6, 30), { reps: 11 })];
    expect(progressionFlag({ exercise: EXERCISES[0]!, sets: logged, workouts })).toBeNull();
  });

  test('no range set means 8-12; warm-ups are ignored; AMRAP never flags', () => {
    const logged = [...sets('incline', 3, 'b', at(12, 6), { reps: 12 }), ...sets('incline', 1, 'b', at(12, 5), { reps: 5, isWarmup: true })];
    expect(progressionFlag({ exercise: EXERCISES[0]!, sets: logged, workouts })).not.toBeNull();
    expect(progressionFlag({ exercise: { ...EXERCISES[0]!, targetReps: 'AMRAP' }, sets: logged, workouts })).toBeNull();
    expect(parseRepRange('10-12')).toEqual({ low: 10, high: 12 });
    expect(parseRepRange(undefined)).toEqual({ low: 8, high: 12 });
  });

  test('the flag clears once a heavier session falls short of the top', () => {
    const logged = [...sets('incline', 3, 'a', at(9, 6), { reps: 12 }), ...sets('incline', 3, 'b', at(12, 6), { reps: 9, weight: 110 })];
    expect(progressionFlag({ exercise: EXERCISES[0]!, sets: logged, workouts })).toBeNull();
  });
});

describe('session edits vs template edits', () => {
  const template = ['incline', 'pulldown', 'leg-press', 'lat-raise'];
  const session = ['pulldown', 'cable-fly', 'lat-raise', 'curl']; // leg press dropped, incline swapped, curl added
  const swaps = [{ originalExerciseId: 'incline', currentExerciseId: 'cable-fly' }];

  test('the diff names adds, removals and swaps, and ignores order', () => {
    expect(sessionDiff(template, session, swaps)).toEqual({ added: ['curl'], removed: ['leg-press'], swapped: [{ from: 'incline', to: 'cable-fly' }] });
    expect(sessionDiff(template, [...template].reverse())).toEqual({ added: [], removed: [], swapped: [] });
  });

  test('"Just today" never changes the template', () => {
    expect(applySessionEdits(template, sessionDiff(template, session, swaps), 'today')).toEqual(template);
  });

  test('"Make permanent": swaps in place, removals out, additions on the end', () => {
    expect(applySessionEdits(template, sessionDiff(template, session, swaps), 'permanent')).toEqual(['cable-fly', 'pulldown', 'lat-raise', 'curl']);
  });
});
