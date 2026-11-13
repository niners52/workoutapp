/**
 * The training week as a rotation: W1..Wn plus Flex.
 *
 * One implementation, two callers. The phone app imports this file directly
 * (../../mcp-server/src/shared/weekPlan) and the MCP server compiles it as its
 * own source, so the rotation, the owed list and the Flex plan can never
 * disagree between what the app shows and what get_week_status reports.
 *
 * Rules for this file, so both builds can take it:
 *   - no imports at all (Metro does not map the server's `.js` specifiers);
 *   - plain data in, plain data out — callers map their own row shapes;
 *   - no time-zone guessing: the caller passes the week's start instant
 *     (weekStartInZone does the America/Chicago arithmetic for both).
 *
 * Weekly volume is not counted here. Each caller passes the per-muscle totals
 * from its existing counting code (primary muscles only, unilateral sets at
 * half, warm-ups and deload sessions out), so there is one counting rule.
 */

// ─── Inputs ─────────────────────────────────────────────────────────────────

export type Tier = 'build' | 'maintain' | 'covered';
export type WeekStartDay = 'sunday' | 'monday';

export interface PlanExercise {
  id: string;
  name: string;
  /** Primary muscle groups as stored. 'miscellaneous' is ignored. */
  primary: string[];
  isUnilateral?: boolean;
  targetSets?: number | null;
  /** Display/target rep range, e.g. "8-12", "15", "AMRAP". Default 8-12. */
  targetReps?: string | null;
  /** Prep movement: its sets are warm-ups unless a set says otherwise. */
  defaultWarmup?: boolean;
  /** Manual "available here" tags. History adds the rest. */
  locationIds?: string[];
}

export interface PlanWorkout {
  id: string;
  templateId: string | null;
  startedAt: string;
  completedAt: string | null;
  locationId: string | null;
  isDeload?: boolean;
}

export interface PlanSet {
  workoutId: string;
  exerciseId: string;
  loggedAt: string;
  reps: number;
  weight: number;
  /** null/undefined: ask the exercise (defaultWarmup). */
  isWarmup?: boolean | null;
}

export interface PlanTemplate {
  id: string;
  name: string;
  exerciseIds: string[];
}

export interface RotationSlot {
  /** Stable id within the routine, e.g. "w1". */
  id: string;
  /** "W1", "W2"... */
  label: string;
  templateId: string;
  /** 0 = Sunday .. 6 = Saturday. A label only; it never schedules anything. */
  usualDay?: number | null;
}

export interface Rotation {
  slots: RotationSlot[];
  /** The Flex day's default template; its exercises are Flex priority (b). */
  flexTemplateId: string | null;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_TIERS: Record<string, Tier> = {
  lats: 'build',
  mid_back: 'build',
  traps: 'build',
  chest: 'build',
  abs: 'build',
  side_delts: 'maintain',
  biceps: 'maintain',
  triceps: 'maintain',
  quads: 'maintain',
  hamstrings: 'maintain',
  front_delts: 'covered',
  rear_delts: 'covered',
  lower_back: 'covered',
  glutes: 'covered',
  calves: 'covered',
  rotator_cuff: 'covered',
};

export const DEFAULT_FLEX_MINUTES = 75;
export const DEFAULT_REP_RANGE = { low: 8, high: 12 };
export const RECOVERY_WINDOW_HOURS = 18;
/** Minutes per set when there is no history to measure. */
export const FALLBACK_MINUTES_PER_SET = 2.5;

/** Muscles the plan ignores: not a muscle, just "unclassified". */
const IGNORED = new Set(['miscellaneous']);
const TIER_RANK: Record<Tier, number> = { build: 0, maintain: 1, covered: 2 };

export function tierFor(muscle: string, tiers: Partial<Record<string, Tier>> | null | undefined): Tier {
  return tiers?.[muscle] ?? DEFAULT_TIERS[muscle] ?? 'maintain';
}

function primaries(e: PlanExercise | undefined): string[] {
  return [...new Set((e?.primary ?? []).filter(g => !IGNORED.has(g)))];
}

/** The muscle that decides an exercise's tier: its highest-priority primary. */
export function leadMuscle(e: PlanExercise | undefined, tiers?: Partial<Record<string, Tier>> | null): string | null {
  const groups = primaries(e);
  if (groups.length === 0) return null;
  return [...groups].sort((a, b) => TIER_RANK[tierFor(a, tiers)] - TIER_RANK[tierFor(b, tiers)])[0] ?? null;
}

export function isWorkingSet(set: PlanSet, exercise: PlanExercise | undefined): boolean {
  return !(set.isWarmup ?? exercise?.defaultWarmup ?? false);
}

export function plannedSets(e: PlanExercise | undefined): number {
  return e?.targetSets ?? (e?.isUnilateral ? 6 : 3);
}

// ─── Week boundaries ────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localParts(at: Date, timeZone: string): { y: number; m: number; d: number; wd: number; h: number; min: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    wd: WEEKDAYS.indexOf(get('weekday')),
    h: Number(get('hour')),
    min: Number(get('minute')),
  };
}

/** The UTC instant of local midnight on y-m-d in timeZone (DST-safe). */
function zonedMidnight(y: number, m: number, d: number, timeZone: string): Date {
  let guess = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), timeZone);
    const asIfUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    guess -= asIfUtc - Date.UTC(y, m - 1, d);
  }
  return new Date(guess);
}

/**
 * The instant the training week containing `now` began, in `timeZone`.
 * Everything weekly — rotation state, the owed list, Flex — resets here;
 * nothing carries over and nothing doubles up.
 */
export function weekStartInZone(now: Date, timeZone: string, weekStartDay: WeekStartDay): Date {
  const p = localParts(now, timeZone);
  const startDow = weekStartDay === 'monday' ? 1 : 0;
  const back = (p.wd - startDow + 7) % 7;
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d - back));
  return zonedMidnight(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), timeZone);
}

/** Local weekday name of an instant, e.g. "Saturday". */
export function weekdayName(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(at);
}

// ─── Rotation from a weekday schedule ───────────────────────────────────────

/**
 * Convert a weekday schedule (one entry per day, 0 = Sunday) into a rotation:
 * Monday..Friday become W1..Wn in order, Saturday's first template becomes the
 * Flex default, and anything else (more Saturday templates, Sunday) is added
 * after Friday. The weekday survives as `usualDay`, a label only.
 */
export function rotationFromWeekdays(
  daySchedule: Array<{ day: number; templateIds?: string[] | null }>,
  fallbackFlexTemplateId: string | null = null,
): Rotation {
  const byDay = new Map(daySchedule.map(d => [d.day, (d.templateIds ?? []).filter(Boolean)]));
  const slots: RotationSlot[] = [];
  const push = (templateId: string, day: number) => {
    const n = slots.length + 1;
    slots.push({ id: `w${n}`, label: `W${n}`, templateId, usualDay: day });
  };
  for (const day of [1, 2, 3, 4, 5]) for (const t of byDay.get(day) ?? []) push(t, day);
  const saturday = byDay.get(6) ?? [];
  const flexTemplateId = saturday[0] ?? fallbackFlexTemplateId;
  for (const t of saturday.slice(1)) push(t, 6);
  for (const t of byDay.get(0) ?? []) push(t, 0);
  return { slots, flexTemplateId };
}

// ─── Rotation state ─────────────────────────────────────────────────────────

export interface SlotState {
  slot: RotationSlot;
  template: PlanTemplate | null;
  performed: boolean;
  /** Sessions attributed to this slot this week (normally one). */
  workoutIds: string[];
}

export interface RotationState {
  slots: SlotState[];
  /** Lowest-numbered slot not yet performed this week. */
  nextUp: SlotState | null;
  /** Sessions run against the Flex template this week. */
  flexWorkoutIds: string[];
}

interface WeekInputs {
  rotation: Rotation;
  templates: PlanTemplate[];
  workouts: PlanWorkout[];
  sets: PlanSet[];
  exercises: PlanExercise[];
  weekStart: Date;
  now: Date;
}

function inWeek(iso: string, weekStart: Date, now: Date): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= weekStart.getTime() && t <= now.getTime();
}

/** Finished sessions this week, oldest first. Deload sessions count: they were done. */
function weekSessions({ workouts, weekStart, now }: Pick<WeekInputs, 'workouts' | 'weekStart' | 'now'>): PlanWorkout[] {
  return workouts
    .filter(w => w.completedAt && inWeek(w.startedAt, weekStart, now))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Exercise ids with at least one working set in each session. */
function workedBySession(sets: PlanSet[], byId: Map<string, PlanExercise>, ids: Set<string>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const s of sets) {
    if (!ids.has(s.workoutId) || !isWorkingSet(s, byId.get(s.exerciseId))) continue;
    const entry = out.get(s.workoutId) ?? new Set<string>();
    entry.add(s.exerciseId);
    out.set(s.workoutId, entry);
  }
  return out;
}

/**
 * Which rotation workouts were done this week, derived from the logs alone so
 * a week already in progress reads correctly the day this ships.
 *
 * A session counts against a slot when it ran that slot's template. A session
 * entered without a template counts against the unperformed slot it shares the
 * most exercises with, if it shares at least two.
 */
export function rotationState(input: WeekInputs): RotationState {
  const { rotation, templates, sets, exercises } = input;
  const byId = new Map(exercises.map(e => [e.id, e]));
  const templateById = new Map(templates.map(t => [t.id, t]));
  const sessions = weekSessions(input);
  const worked = workedBySession(sets, byId, new Set(sessions.map(w => w.id)));

  const states: SlotState[] = rotation.slots.map(slot => ({
    slot,
    template: templateById.get(slot.templateId) ?? null,
    performed: false,
    workoutIds: [],
  }));
  const flexWorkoutIds: string[] = [];
  const rotationTemplates = new Set(rotation.slots.map(s => s.templateId));

  for (const w of sessions) {
    if (w.templateId && w.templateId === rotation.flexTemplateId && !rotationTemplates.has(w.templateId)) {
      flexWorkoutIds.push(w.id);
      continue;
    }
    let target: SlotState | undefined;
    if (w.templateId && rotationTemplates.has(w.templateId)) {
      target = states.find(s => s.slot.templateId === w.templateId && !s.performed) ?? states.find(s => s.slot.templateId === w.templateId);
    } else {
      const done = worked.get(w.id) ?? new Set<string>();
      let best = 0;
      for (const s of states) {
        if (s.performed) continue;
        const overlap = (s.template?.exerciseIds ?? []).filter(id => done.has(id)).length;
        if (overlap >= 2 && overlap > best) {
          best = overlap;
          target = s;
        }
      }
    }
    if (target) {
      target.performed = true;
      target.workoutIds.push(w.id);
    }
  }

  return { slots: states, nextUp: states.find(s => !s.performed) ?? null, flexWorkoutIds };
}

// ─── Owed list ──────────────────────────────────────────────────────────────

export interface OwedItem {
  exerciseId: string;
  name: string;
  slotId: string;
  slotLabel: string;
  /** skipped: its rotation workout ran without it. unperformed: the workout has not run. */
  source: 'skipped' | 'unperformed';
  primaryMuscle: string | null;
  tier: Tier;
  sets: number;
}

/**
 * Exercises this week's rotation asked for that have not been done.
 *
 * An exercise counts as done for a slot when that slot's own session did it,
 * when that session did a same-muscle exercise the template did not name (a
 * swap — the busy-gym case), or when any other session this week did it — so
 * an exercise moved from Monday's W1 to Tuesday's W2 still credits W1. Spare
 * sessions pay performed workouts first, oldest first, then unperformed ones.
 * Prep (warm-up) exercises are never owed.
 */
export function owedList(input: WeekInputs & { state?: RotationState; tiers?: Partial<Record<string, Tier>> | null }): OwedItem[] {
  const { sets, exercises } = input;
  const state = input.state ?? rotationState(input);
  const byId = new Map(exercises.map(e => [e.id, e]));
  const sessions = weekSessions(input);
  const worked = workedBySession(sets, byId, new Set(sessions.map(w => w.id)));

  interface Occ { slot: SlotState; exerciseId: string; paid: boolean }
  const occ: Occ[] = [];
  for (const s of state.slots) {
    for (const id of s.template?.exerciseIds ?? []) {
      const e = byId.get(id);
      if (!e || e.defaultWarmup) continue;
      occ.push({ slot: s, exerciseId: id, paid: false });
    }
  }

  // Exercises a workout that ran earlier left undone. Doing one of these
  // later is moving it (broken machine Monday, done Tuesday), not a swap. An
  // exercise only named by workouts that run later can be a swap: Hack Squat
  // done for Leg Press on Monday is the plan followed, even if Thursday's
  // workout lists Hack Squat and skips it.
  const startedAt = new Map(sessions.map(w => [w.id, w.startedAt]));
  const skippedByEarlierWorkout = (exceptSlot: SlotState, before: string) => {
    const out = new Set<string>();
    for (const s of state.slots) {
      if (s === exceptSlot || !s.performed) continue;
      if (!s.workoutIds.some(id => (startedAt.get(id) ?? '') < before)) continue;
      const doneThere = new Set(s.workoutIds.flatMap(id => [...(worked.get(id) ?? [])]));
      for (const id of s.template?.exerciseIds ?? []) if (!doneThere.has(id)) out.add(id);
    }
    return out;
  };

  // 1. A slot's own session pays its own occurrences, and its swaps.
  const usedInSession = new Map<string, Set<string>>(); // workoutId -> exercise ids already spent
  for (const s of state.slots) {
    for (const wid of s.workoutIds) {
      const done = worked.get(wid) ?? new Set<string>();
      const used = usedInSession.get(wid) ?? new Set<string>();
      const mine = occ.filter(o => o.slot === s && !o.paid);
      for (const o of mine) {
        if (done.has(o.exerciseId) && !used.has(o.exerciseId)) {
          o.paid = true;
          used.add(o.exerciseId);
        }
      }
      // A moved exercise is left for step 2 to credit to the workout it came from.
      const planned = new Set((s.template?.exerciseIds ?? []));
      const moved = skippedByEarlierWorkout(s, startedAt.get(wid) ?? '');
      const extras = [...done].filter(id => !planned.has(id) && !used.has(id) && !moved.has(id));
      for (const o of mine.filter(x => !x.paid)) {
        const muscles = primaries(byId.get(o.exerciseId));
        const stand = extras.find(id => !used.has(id) && primaries(byId.get(id)).some(g => muscles.includes(g)));
        if (stand) {
          o.paid = true;
          used.add(stand);
        }
      }
      usedInSession.set(wid, used);
    }
  }

  // 2. Everything else done this week pays the oldest open occurrence.
  const spare = new Map<string, number>();
  for (const w of sessions) {
    const used = usedInSession.get(w.id) ?? new Set<string>();
    for (const id of worked.get(w.id) ?? []) if (!used.has(id)) spare.set(id, (spare.get(id) ?? 0) + 1);
  }
  const ordered = [...occ.filter(o => o.slot.performed), ...occ.filter(o => !o.slot.performed)];
  for (const o of ordered) {
    if (o.paid) continue;
    const left = spare.get(o.exerciseId) ?? 0;
    if (left > 0) {
      spare.set(o.exerciseId, left - 1);
      o.paid = true;
    }
  }

  return occ
    .filter(o => !o.paid)
    .map(o => {
      const e = byId.get(o.exerciseId);
      const lead = leadMuscle(e, input.tiers);
      return {
        exerciseId: o.exerciseId,
        name: e?.name ?? o.exerciseId,
        slotId: o.slot.slot.id,
        slotLabel: o.slot.slot.label,
        source: o.slot.performed ? ('skipped' as const) : ('unperformed' as const),
        primaryMuscle: lead,
        tier: lead ? tierFor(lead, input.tiers) : 'maintain',
        sets: plannedSets(e),
      };
    });
}

// ─── Availability and duration, from history ────────────────────────────────

/** Where each exercise has been logged, and how often. */
export function loggedCounts(sets: PlanSet[], workouts: PlanWorkout[]): Map<string, Map<string, number>> {
  const loc = new Map(workouts.map(w => [w.id, w.locationId]));
  const out = new Map<string, Map<string, number>>();
  for (const s of sets) {
    const where = loc.get(s.workoutId) ?? '';
    const entry = out.get(s.exerciseId) ?? new Map<string, number>();
    entry.set(where, (entry.get(where) ?? 0) + 1);
    out.set(s.exerciseId, entry);
  }
  return out;
}

/**
 * An exercise is available at a location if it has ever been logged there,
 * or is tagged for it by hand. Without a location, everything is available.
 */
export function isAvailableAt(e: PlanExercise, locationId: string | null | undefined, counts: Map<string, Map<string, number>>): boolean {
  if (!locationId) return true;
  return (counts.get(e.id)?.get(locationId) ?? 0) > 0 || (e.locationIds ?? []).includes(locationId);
}

/**
 * Minutes an exercise takes: the median gap between consecutive sets of it in
 * past sessions, times the sets planned. Gaps over 10 minutes are breaks, not
 * rest, and are ignored. No history: 2.5 minutes a set.
 */
export function estimateMinutes(exerciseId: string, setCount: number, sets: PlanSet[]): number {
  const bySession = new Map<string, number[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId) continue;
    const t = new Date(s.loggedAt).getTime();
    if (!Number.isFinite(t)) continue;
    const list = bySession.get(s.workoutId) ?? [];
    list.push(t);
    bySession.set(s.workoutId, list);
  }
  const gaps: number[] = [];
  for (const times of bySession.values()) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      const g = ((times[i] ?? 0) - (times[i - 1] ?? 0)) / 60000;
      if (g > 0.25 && g <= 10) gaps.push(g);
    }
  }
  if (gaps.length === 0) return round1(setCount * FALLBACK_MINUTES_PER_SET);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? (gaps[mid] ?? 0) : ((gaps[mid - 1] ?? 0) + (gaps[mid] ?? 0)) / 2;
  return round1(setCount * median);
}

// ─── Flex plan ──────────────────────────────────────────────────────────────

export interface FlexItem {
  exerciseId: string;
  name: string;
  /**
   * skipped: left out of a rotation workout that already ran, any tier.
   * a: owed from a workout not run yet, build tier. b: the Flex default
   * template. c: owed from a workout not run yet, maintain tier.
   */
  priority: 'skipped' | 'a' | 'b' | 'c' | 'added';
  slotLabel?: string;
  primaryMuscle: string | null;
  tier: Tier;
  sets: number;
  minutes: number;
  /** Set when the planned exercise is not at this location and this one stands in. */
  insteadOf?: { exerciseId: string; name: string };
  /** No same-muscle exercise at this location; the planned one is kept and flagged. */
  notAvailableHere?: boolean;
}

export interface FlexPlan {
  items: FlexItem[];
  /** In priority order but past the time cap: gone when the week resets. */
  expiresSunday: FlexItem[];
  totalMinutes: number;
  capMinutes: number;
  locationId: string | null;
}

export interface FlexInputs {
  owed: OwedItem[];
  flexTemplate: PlanTemplate | null;
  exercises: PlanExercise[];
  /** Working sets credited this week per muscle — from the caller's volume code. */
  doneByMuscle: Record<string, number>;
  targets: Record<string, number>;
  tiers?: Partial<Record<string, Tier>> | null;
  locationId?: string | null;
  /** History for availability and durations (all of it, or at least recent months). */
  historySets: PlanSet[];
  historyWorkouts: PlanWorkout[];
  capMinutes?: number;
  /** Hand edits on the Flex card, this week only. */
  removed?: string[];
  added?: string[];
  /**
   * The week so far. With it, a Flex default exercise already done this week
   * (or the stand-in Flex would use for it here) is left off: doing it on a
   * spare half hour midweek is doing it.
   */
  weekStart?: Date;
  now?: Date;
}

/**
 * Flex, in the order it is filled:
 *   skipped) exercises left out of a rotation workout that already ran — a
 *      specific miss, so first and whatever the tier (build, then maintain,
 *      then covered),
 *   a) owed from workouts not run yet, build tier,
 *   b) the Flex default template, minus anything whose muscles have all met
 *      their weekly target,
 *   c) owed from workouts not run yet, maintain tier.
 * Covered-tier work from workouts not run yet is left out. Each item is swapped for a same-muscle
 * exercise at this location if it is not available here, then items are taken
 * in order while they fit the time cap; the rest expire on Sunday.
 */
export function flexPlan(input: FlexInputs): FlexPlan {
  const byId = new Map(input.exercises.map(e => [e.id, e]));
  const counts = loggedCounts(input.historySets, input.historyWorkouts);
  const removed = new Set(input.removed ?? []);
  const doneThisWeek = new Set<string>();
  if (input.weekStart) {
    const from = input.weekStart.getTime();
    const to = (input.now ?? new Date()).getTime();
    for (const s of input.historySets) {
      const t = new Date(s.loggedAt).getTime();
      if (t >= from && t <= to && isWorkingSet(s, byId.get(s.exerciseId))) doneThisWeek.add(s.exerciseId);
    }
  }
  const cap = input.capMinutes ?? DEFAULT_FLEX_MINUTES;
  const locationId = input.locationId ?? null;

  const targetMet = (e: PlanExercise | undefined) => {
    const groups = primaries(e);
    if (groups.length === 0) return false;
    return groups.every(g => {
      const t = input.targets[g] ?? 0;
      return t > 0 && (input.doneByMuscle[g] ?? 0) >= t;
    });
  };

  type Draft = Omit<FlexItem, 'minutes'>;
  const drafts: Draft[] = [];
  const skipped = input.owed.filter(o => o.source === 'skipped');
  const ahead = input.owed.filter(o => o.source === 'unperformed');
  for (const o of [...skipped].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier])) {
    drafts.push({ exerciseId: o.exerciseId, name: o.name, priority: 'skipped', slotLabel: o.slotLabel, primaryMuscle: o.primaryMuscle, tier: o.tier, sets: o.sets });
  }
  for (const o of ahead.filter(o => o.tier === 'build')) {
    drafts.push({ exerciseId: o.exerciseId, name: o.name, priority: 'a', slotLabel: o.slotLabel, primaryMuscle: o.primaryMuscle, tier: o.tier, sets: o.sets });
  }
  for (const id of input.flexTemplate?.exerciseIds ?? []) {
    const e = byId.get(id);
    if (!e || e.defaultWarmup || targetMet(e) || doneThisWeek.has(id)) continue;
    const lead = leadMuscle(e, input.tiers);
    drafts.push({ exerciseId: id, name: e.name, priority: 'b', primaryMuscle: lead, tier: lead ? tierFor(lead, input.tiers) : 'maintain', sets: plannedSets(e) });
  }
  for (const o of ahead.filter(o => o.tier === 'maintain')) {
    drafts.push({ exerciseId: o.exerciseId, name: o.name, priority: 'c', slotLabel: o.slotLabel, primaryMuscle: o.primaryMuscle, tier: o.tier, sets: o.sets });
  }
  for (const id of input.added ?? []) {
    const e = byId.get(id);
    if (!e) continue;
    const lead = leadMuscle(e, input.tiers);
    drafts.push({ exerciseId: id, name: e.name, priority: 'added', primaryMuscle: lead, tier: lead ? tierFor(lead, input.tiers) : 'maintain', sets: plannedSets(e) });
  }

  const taken = new Set<string>();
  const resolved: FlexItem[] = [];
  for (const d of drafts) {
    if (removed.has(d.exerciseId)) continue;
    const planned = byId.get(d.exerciseId);
    if (!planned) continue;
    let chosen = planned;
    let insteadOf: FlexItem['insteadOf'];
    let notAvailableHere = false;
    if (!isAvailableAt(planned, locationId, counts)) {
      const stand = substituteFor(planned, d.primaryMuscle, locationId, { byId, counts, exclude: new Set([...taken, ...removed]) });
      if (stand) {
        insteadOf = { exerciseId: planned.id, name: planned.name };
        chosen = stand;
      } else {
        notAvailableHere = true;
      }
    }
    if (taken.has(chosen.id)) continue;
    // The Flex default item as it would be done here was already done this week.
    if (d.priority === 'b' && doneThisWeek.has(chosen.id)) continue;
    taken.add(chosen.id);
    const setCount = chosen.id === planned.id ? d.sets : plannedSets(chosen);
    resolved.push({
      ...d,
      exerciseId: chosen.id,
      name: chosen.name,
      sets: setCount,
      minutes: estimateMinutes(chosen.id, setCount, input.historySets),
      ...(insteadOf ? { insteadOf } : {}),
      ...(notAvailableHere ? { notAvailableHere: true } : {}),
    });
  }

  // Fill in priority order; an item that does not fit is passed over, so a
  // shorter one further down can still use the time.
  const items: FlexItem[] = [];
  const expiresSunday: FlexItem[] = [];
  let total = 0;
  for (const item of resolved) {
    if (item.priority === 'added' || total + item.minutes <= cap) {
      items.push(item);
      total += item.minutes;
    } else {
      expiresSunday.push(item);
    }
  }
  return { items, expiresSunday, totalMinutes: round1(total), capMinutes: cap, locationId };
}

/**
 * The exercise to do instead when `planned` is not at this location: same
 * primary muscle, available here, logged most often here (then overall).
 */
export function substituteFor(
  planned: PlanExercise,
  muscle: string | null,
  locationId: string | null,
  ctx: { byId: Map<string, PlanExercise>; counts: Map<string, Map<string, number>>; exclude?: Set<string> },
): PlanExercise | null {
  const groups = muscle ? [muscle] : primaries(planned);
  const here = (e: PlanExercise) => ctx.counts.get(e.id)?.get(locationId ?? '') ?? 0;
  const overall = (e: PlanExercise) => [...(ctx.counts.get(e.id)?.values() ?? [])].reduce((a, b) => a + b, 0);
  const options = [...ctx.byId.values()]
    .filter(e => e.id !== planned.id && !e.defaultWarmup && !ctx.exclude?.has(e.id))
    .filter(e => primaries(e).some(g => groups.includes(g)))
    .filter(e => isAvailableAt(e, locationId, ctx.counts))
    .sort((a, b) => here(b) - here(a) || overall(b) - overall(a) || a.name.localeCompare(b.name));
  return options[0] ?? null;
}

// ─── Recovery warning ───────────────────────────────────────────────────────

export interface RecoveryWarning {
  exerciseId: string;
  muscle: string;
  lastTrainedAt: string;
  hoursAgo: number;
}

/**
 * Exercises in a session about to start whose primary muscle already had
 * working sets in the last 18 hours — a same-day double, or last night then
 * this morning. Non-blocking: the caller offers to defer them to Flex.
 */
export function recoveryWarnings(input: {
  exerciseIds: string[];
  exercises: PlanExercise[];
  sets: PlanSet[];
  now: Date;
  /** The session being started; its own sets never count against it. */
  excludeWorkoutId?: string;
  windowHours?: number;
}): RecoveryWarning[] {
  const byId = new Map(input.exercises.map(e => [e.id, e]));
  const since = input.now.getTime() - (input.windowHours ?? RECOVERY_WINDOW_HOURS) * 3600_000;
  const lastByMuscle = new Map<string, number>();
  for (const s of input.sets) {
    if (s.workoutId === input.excludeWorkoutId) continue;
    const e = byId.get(s.exerciseId);
    if (!isWorkingSet(s, e)) continue;
    const t = new Date(s.loggedAt).getTime();
    if (!(t >= since && t <= input.now.getTime())) continue;
    for (const g of primaries(e)) lastByMuscle.set(g, Math.max(lastByMuscle.get(g) ?? 0, t));
  }
  const out: RecoveryWarning[] = [];
  for (const id of input.exerciseIds) {
    const e = byId.get(id);
    const hit = primaries(e)
      .filter(g => lastByMuscle.has(g))
      .sort((a, b) => (lastByMuscle.get(b) ?? 0) - (lastByMuscle.get(a) ?? 0))[0];
    if (!hit) continue;
    const at = lastByMuscle.get(hit) ?? 0;
    out.push({ exerciseId: id, muscle: hit, lastTrainedAt: new Date(at).toISOString(), hoursAgo: round1((input.now.getTime() - at) / 3600_000) });
  }
  return out;
}

// ─── Progression ────────────────────────────────────────────────────────────

/** "8-12" -> 8..12, "15" -> 15..15, empty -> the 8-12 default, "AMRAP" -> null. */
export function parseRepRange(raw: string | null | undefined): { low: number; high: number } | null {
  const text = (raw ?? '').trim();
  if (!text) return { ...DEFAULT_REP_RANGE };
  const range = text.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    return high >= low ? { low, high } : { low: high, high: low };
  }
  const single = text.match(/^(\d+)$/);
  if (single) return { low: Number(single[1]), high: Number(single[1]) };
  return null;
}

export interface ProgressionFlag {
  exerciseId: string;
  topOfRange: number;
  workoutId: string;
  at: string;
  workingSets: number;
}

/**
 * "Add weight next time": the last session of an exercise (before the current
 * one, at the same location when there is history there) where every working
 * set reached the top of its rep range. Derived from the logs, so it shows when
 * the exercise next appears and clears itself once a heavier session is logged.
 */
export function progressionFlag(input: {
  exercise: PlanExercise;
  sets: PlanSet[];
  workouts: PlanWorkout[];
  locationId?: string | null;
  excludeWorkoutId?: string;
}): ProgressionFlag | null {
  const range = parseRepRange(input.exercise.targetReps);
  if (!range) return null;
  const finished = new Map(input.workouts.filter(w => w.completedAt && w.id !== input.excludeWorkoutId).map(w => [w.id, w]));
  const mine = input.sets.filter(s => s.exerciseId === input.exercise.id && finished.has(s.workoutId) && isWorkingSet(s, input.exercise));
  if (mine.length === 0) return null;

  const latestOf = (ids: Set<string>) => {
    let best: { id: string; at: string } | null = null;
    for (const s of mine) {
      if (!ids.has(s.workoutId)) continue;
      if (!best || s.loggedAt > best.at) best = { id: s.workoutId, at: s.loggedAt };
    }
    return best;
  };
  const all = new Set(mine.map(s => s.workoutId));
  const here = input.locationId ? new Set([...all].filter(id => finished.get(id)?.locationId === input.locationId)) : new Set<string>();
  const last = latestOf(here.size > 0 ? here : all);
  if (!last) return null;
  const session = mine.filter(s => s.workoutId === last.id);
  if (session.length === 0 || !session.every(s => s.reps >= range.high)) return null;
  return { exerciseId: input.exercise.id, topOfRange: range.high, workoutId: last.id, at: last.at, workingSets: session.length };
}

// ─── Session edits vs template edits ────────────────────────────────────────

export interface SessionDiff {
  added: string[];
  removed: string[];
  /** Template exercise -> what replaced it in this session. */
  swapped: Array<{ from: string; to: string }>;
}

/**
 * How a session's exercise list differs from its template. Order is ignored:
 * completed exercises move to the bottom on their own, which is not an edit.
 */
export function sessionDiff(
  templateIds: string[],
  sessionIds: string[],
  swaps: Array<{ originalExerciseId: string; currentExerciseId: string }> = [],
): SessionDiff {
  const inSession = new Set(sessionIds);
  const inTemplate = new Set(templateIds);
  const swapped = swaps
    .filter(s => inTemplate.has(s.originalExerciseId) && !inSession.has(s.originalExerciseId) && inSession.has(s.currentExerciseId))
    .map(s => ({ from: s.originalExerciseId, to: s.currentExerciseId }));
  const swappedFrom = new Set(swapped.map(s => s.from));
  const swappedTo = new Set(swapped.map(s => s.to));
  return {
    added: sessionIds.filter(id => !inTemplate.has(id) && !swappedTo.has(id)),
    removed: templateIds.filter(id => !inSession.has(id) && !swappedFrom.has(id)),
    swapped,
  };
}

/**
 * What a template becomes when "Make permanent" applies a session's edits:
 * swaps replace in place, removals drop out, additions go on the end. "Just
 * today" — the default — is the template unchanged.
 */
export function applySessionEdits(templateIds: string[], diff: SessionDiff, mode: 'today' | 'permanent'): string[] {
  if (mode === 'today') return [...templateIds];
  const replace = new Map(diff.swapped.map(s => [s.from, s.to]));
  const removed = new Set(diff.removed);
  const next = templateIds.filter(id => !removed.has(id)).map(id => replace.get(id) ?? id);
  for (const id of diff.added) if (!next.includes(id)) next.push(id);
  return [...new Set(next)];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
