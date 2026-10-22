/**
 * Flex: the session that absorbs whatever the week did not go to plan.
 *
 * Tyler's week is five Planet Fitness days, and real weeks lose exercises to
 * mornings that run late. Flex collects them, adds the day-6 work that used to
 * be its own scheduled day, and fits the lot to whichever gym he is at. It is
 * built fresh every time from what actually happened, then trimmed or added to
 * by hand; those edits last for the week.
 *
 * What counts as done uses the volume panel's rules indirectly: an exercise is
 * done if it has a working set this week, and a muscle already at its weekly
 * target drops its Flex items, because the point is the target, not the name.
 */
import { addDays, isSameDay, startOfDay } from 'date-fns';
import {
  DAY_NAMES,
  type Exercise,
  type MuscleGroupVolume,
  type Routine,
  type Template,
  type WeekStartDay,
  type Workout,
  type WorkoutSet,
} from '../types';
import { getTemplatesForDay } from './analytics';
import { creditedPrimaries } from './muscleGroups';
import { isWarmupSet } from './warmupSets';
import { weekStartFor } from './weekProgress';
import { dayWasTrained } from './thisWeek';

export interface FlexItem {
  exerciseId: string;
  name: string;
  /** missed: the week asked for it and it did not happen. day6: the Flex pool. added: by hand. */
  reason: 'missed' | 'day6' | 'added';
  /** missed: the day it was planned for. */
  dayLabel?: string;
  /** Set when the planned exercise is not at this gym and this one closes the same muscle. */
  insteadOf?: string;
  /** No exercise for this muscle at this gym: the original is kept and flagged. */
  notHere?: boolean;
  muscleGroups: string[];
  sets: number;
}

export interface FlexEdits {
  /** Training week these edits belong to (YYYY-MM-DD of its first day). */
  weekStart: string;
  removed: string[];
  added: string[];
}

export interface FlexPlanInput {
  routine?: Routine;
  templates: Template[];
  workouts: Workout[];
  sets: WorkoutSet[];
  exercises: Exercise[];
  /** computeWeeklyVolume(...).muscleGroups for this week. */
  volume: MuscleGroupVolume[];
  /** The day-6 template whose exercises are always on offer. */
  poolTemplateId?: string;
  locationId?: string;
  edits?: FlexEdits | null;
  weekStartDay: WeekStartDay;
  now?: Date;
}

const RECENT_DAYS = 28;

export function flexPlan({
  routine,
  templates,
  workouts,
  sets,
  exercises,
  volume,
  poolTemplateId,
  locationId,
  edits,
  weekStartDay,
  now = new Date(),
}: FlexPlanInput): FlexItem[] {
  const weekStart = weekStartFor(weekStartDay, now);
  const byId = new Map(exercises.map(e => [e.id, e]));
  const templateById = new Map(templates.map(t => [t.id, t]));
  const weekKey = isoDate(weekStart);
  const activeEdits = edits && edits.weekStart === weekKey ? edits : null;
  const removed = new Set(activeEdits?.removed ?? []);

  // Sessions this week in which each exercise got a working set. Deload
  // sessions are left out, as the volume panel leaves them out.
  const deloadWorkouts = new Set(workouts.filter(w => w.isDeload).map(w => w.id));
  const sessionsDone = new Map<string, Set<string>>();
  for (const s of sets) {
    const at = new Date(s.loggedAt);
    if (!(at >= weekStart && at <= now) || deloadWorkouts.has(s.workoutId) || isWarmupSet(s, byId.get(s.exerciseId))) continue;
    const seen = sessionsDone.get(s.exerciseId) ?? new Set<string>();
    seen.add(s.workoutId);
    sessionsDone.set(s.exerciseId, seen);
  }

  // Muscles still short of target this week. An item whose muscles are all
  // covered has nothing left to do, whatever its name.
  const stillOwed = new Set(volume.filter(mg => mg.target > 0 && mg.sets < mg.target).map(mg => mg.muscleGroup as string));
  const recent = recentUse(sets, byId, now);

  const candidates: Array<{ exerciseId: string; reason: FlexItem['reason']; dayLabel?: string; dayKey?: string }> = [];

  // 1. Missed: scheduled on a day that has passed and not done anywhere this
  //    week. Today counts only once today's session has finished, because
  //    until then it may still happen.
  // A swap inside a session pays off the planned exercise it replaced: Cable
  // Fly done where the plan said Incline Press is the plan, followed. Each
  // exercise the session did that the plan did not name stands in for one
  // skipped planned exercise sharing a primary muscle.
  const swapCredit = new Set<string>(); // `${exerciseId}|${dayKey}`

  if (routine) {
    const today = startOfDay(now);
    for (let date = startOfDay(weekStart); date <= today; date = addDays(date, 1)) {
      const templateIds = getTemplatesForDay(routine, date.getDay()).filter(id => id !== poolTemplateId);
      const plannedIds = templateIds.flatMap(id => templateById.get(id)?.exerciseIds ?? []);
      if (plannedIds.length === 0) continue;
      const trained = dayWasTrained(date, { templateIds, exerciseIds: new Set(plannedIds) }, workouts, sets);
      if (isSameDay(date, today) && !trained) continue;

      if (trained) {
        const sessionIds = new Set(
          workouts.filter(w => w.completedAt && !w.isDeload && isSameDay(new Date(w.startedAt), date)).map(w => w.id),
        );
        const doneThatDay = new Set(
          sets.filter(s => sessionIds.has(s.workoutId) && !isWarmupSet(s, byId.get(s.exerciseId))).map(s => s.exerciseId),
        );
        const planned = new Set(plannedIds);
        const extras = [...doneThatDay].filter(id => !planned.has(id));
        const used = new Set<string>();
        for (const skippedId of plannedIds.filter(id => !doneThatDay.has(id))) {
          const muscles = creditedPrimaries(byId.get(skippedId)?.primaryMuscleGroups ?? []) as string[];
          const stand = extras.find(
            id => !used.has(id) && (creditedPrimaries(byId.get(id)?.primaryMuscleGroups ?? []) as string[]).some(g => muscles.includes(g)),
          );
          if (stand) {
            used.add(stand);
            swapCredit.add(`${skippedId}|${isoDate(date)}`);
          }
        }
      }

      for (const exerciseId of plannedIds) {
        candidates.push({ exerciseId, reason: 'missed', dayLabel: DAY_NAMES[date.getDay()], dayKey: isoDate(date) });
      }
    }
  }

  // 2. The day-6 pool.
  for (const exerciseId of (poolTemplateId && templateById.get(poolTemplateId)?.exerciseIds) || []) {
    candidates.push({ exerciseId, reason: 'day6' });
  }

  // An exercise scheduled on two days needs two sessions. A session pays off
  // the slot on its own day first (or a swap done that day does); sessions on
  // other days then pay off the oldest open slots. So a leg press skipped
  // Monday and done Thursday reads "missed Monday", not "missed Thursday".
  const sessionDays = new Map<string, string[]>();
  for (const [exerciseId, workoutIds] of sessionsDone) {
    sessionDays.set(
      exerciseId,
      [...workoutIds].map(id => workouts.find(w => w.id === id)).filter((w): w is Workout => !!w).map(w => isoDate(new Date(w.startedAt))),
    );
  }
  const paid = new Set<number>();
  const spare = new Map<string, number>();
  for (const [exerciseId, days] of sessionDays) {
    const open = [...days];
    candidates.forEach((c, i) => {
      if (c.reason !== 'missed' || c.exerciseId !== exerciseId || !c.dayKey) return;
      const at = open.indexOf(c.dayKey);
      if (at >= 0) {
        open.splice(at, 1);
        paid.add(i);
      }
    });
    spare.set(exerciseId, open.length);
  }
  candidates.forEach((c, i) => {
    if (c.reason === 'missed' && c.dayKey && !paid.has(i) && swapCredit.has(`${c.exerciseId}|${c.dayKey}`)) paid.add(i);
  });
  candidates.forEach((c, i) => {
    if (c.reason !== 'missed' || paid.has(i)) return;
    const left = spare.get(c.exerciseId) ?? 0;
    if (left > 0) {
      spare.set(c.exerciseId, left - 1);
      paid.add(i);
    }
  });

  const out: FlexItem[] = [];
  const taken = new Set<string>();

  for (const [index, c] of candidates.entries()) {
    const planned = byId.get(c.exerciseId);
    if (!planned || planned.defaultWarmup || removed.has(c.exerciseId)) continue;
    if (c.reason === 'missed' && paid.has(index)) continue;
    if (c.reason === 'day6' && sessionsDone.has(c.exerciseId)) continue;
    const groups = creditedPrimaries(planned.primaryMuscleGroups ?? []) as string[];
    if (groups.length > 0 && !groups.some(g => stillOwed.has(g))) continue;

    // Not at this gym: the best lift here for the same muscle stands in.
    let exercise = planned;
    let insteadOf: string | undefined;
    let notHere = false;
    if (!availableAt(planned, locationId)) {
      const stand = standIn(groups, { byId, locationId, recent, exclude: new Set([...taken, ...removed]) });
      if (stand) {
        exercise = stand;
        insteadOf = planned.name;
      } else {
        notHere = true;
      }
    }
    if (taken.has(exercise.id)) continue;
    taken.add(exercise.id);

    out.push({
      exerciseId: exercise.id,
      name: exercise.name,
      reason: c.reason,
      dayLabel: c.dayLabel,
      insteadOf,
      notHere: notHere || undefined,
      muscleGroups: creditedPrimaries(exercise.primaryMuscleGroups ?? []) as string[],
      sets: exercise.targetSets ?? (exercise.isUnilateral ? 6 : 3),
    });
  }

  // A planned lift this gym does not have, with no stand-in, only earns a
  // place when nothing else on Flex trains that muscle.
  for (let i = out.length - 1; i >= 0; i--) {
    const item = out[i]!;
    if (!item.notHere) continue;
    const coveredElsewhere = item.muscleGroups.every(g => out.some((o, j) => j !== i && !o.notHere && o.muscleGroups.includes(g)));
    if (coveredElsewhere) {
      taken.delete(item.exerciseId);
      out.splice(i, 1);
    }
  }

  // 3. Added by hand: always shown, even for a muscle already at target.
  for (const exerciseId of activeEdits?.added ?? []) {
    const exercise = byId.get(exerciseId);
    if (!exercise || taken.has(exerciseId) || removed.has(exerciseId)) continue;
    taken.add(exerciseId);
    out.push({
      exerciseId,
      name: exercise.name,
      reason: 'added',
      muscleGroups: creditedPrimaries(exercise.primaryMuscleGroups ?? []) as string[],
      sets: exercise.targetSets ?? (exercise.isUnilateral ? 6 : 3),
    });
  }

  return out;
}

/** Edits for this week, with one exercise removed. Adding it back clears the removal. */
export function withRemoved(edits: FlexEdits | null, weekStart: string, exerciseId: string): FlexEdits {
  const base = edits && edits.weekStart === weekStart ? edits : { weekStart, removed: [], added: [] };
  return {
    weekStart,
    removed: [...new Set([...base.removed, exerciseId])],
    added: base.added.filter(id => id !== exerciseId),
  };
}

export function withAdded(edits: FlexEdits | null, weekStart: string, exerciseId: string): FlexEdits {
  const base = edits && edits.weekStart === weekStart ? edits : { weekStart, removed: [], added: [] };
  return {
    weekStart,
    removed: base.removed.filter(id => id !== exerciseId),
    added: [...new Set([...base.added, exerciseId])],
  };
}

export function flexWeekKey(weekStartDay: WeekStartDay, now: Date = new Date()): string {
  return isoDate(weekStartFor(weekStartDay, now));
}

function standIn(
  groups: string[],
  ctx: { byId: Map<string, Exercise>; locationId?: string; recent: Map<string, number>; exclude: Set<string> },
): Exercise | null {
  const options = [...ctx.byId.values()]
    .filter(e => !e.defaultWarmup && !ctx.exclude.has(e.id) && availableAt(e, ctx.locationId))
    .filter(e => (creditedPrimaries(e.primaryMuscleGroups ?? []) as string[]).some(g => groups.includes(g)))
    // Only lifts actually trained lately: a stand-in nobody has done in a
    // year is not a suggestion, it is a guess.
    .filter(e => (ctx.recent.get(e.id) ?? 0) > 0)
    .sort((a, b) => (ctx.recent.get(b.id) ?? 0) - (ctx.recent.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  return options[0] ?? null;
}

function recentUse(sets: WorkoutSet[], byId: Map<string, Exercise>, now: Date): Map<string, number> {
  const since = addDays(now, -RECENT_DAYS);
  const out = new Map<string, number>();
  for (const s of sets) {
    const at = new Date(s.loggedAt);
    if (!(at >= since && at <= now) || isWarmupSet(s, byId.get(s.exerciseId))) continue;
    out.set(s.exerciseId, (out.get(s.exerciseId) ?? 0) + 1);
  }
  return out;
}

function availableAt(exercise: Exercise, locationId?: string): boolean {
  if (!locationId) return true;
  const tagged = exercise.locationIds ?? [];
  return tagged.length === 0 || tagged.includes(locationId);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
