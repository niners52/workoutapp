/**
 * The week, per muscle, in three numbers that add up: what is done, what the
 * days still to come are scheduled to do, and what is left over for Flex.
 *
 * The home screen used to show two cards — one counting done sets, one
 * counting what was owed — with colours that meant different things on each.
 * This is the one model behind the one card that replaces them.
 *
 * "Done" comes from computeWeeklyVolume, so the counting rules are the volume
 * panel's (primary groups, unilateral at half, warm-ups and deload out).
 * "Scheduled" is credited the same way from the remaining days' templates.
 */
import { addDays, isSameDay, startOfDay } from 'date-fns';
import {
  DAY_NAMES,
  MUSCLE_GROUP_DISPLAY_NAMES,
  type Exercise,
  type MuscleGroupVolume,
  type Routine,
  type Template,
  type WeekStartDay,
  type Workout,
} from '../types';
import { getTemplatesForDay } from './analytics';
import { creditedPrimaries } from './muscleGroups';
import { weekStartFor } from './weekProgress';

export interface PlannedDay {
  dayLabel: string;
  exerciseIds: string[];
}

export interface ThisWeekRow {
  muscleGroup: string;
  label: string;
  target: number;
  /** Working sets credited so far this week. */
  done: number;
  /** Sets the remaining scheduled days will credit, capped at what is still owed. */
  scheduled: number;
  /** Days those scheduled sets fall on, in order. */
  scheduledDays: string[];
  /** Still owed after done and scheduled: the Flex share. */
  flex: number;
  pinned: boolean;
}

/**
 * Scheduled days that have not happened yet. Today counts until a session from
 * today's template has been finished — a morning that ran late still leaves
 * today's plan to do tonight, and once it is finished what was skipped is
 * Flex's job, not today's.
 */
export function remainingPlan({
  routine,
  templates,
  workouts,
  weekStartDay,
  now = new Date(),
  excludeTemplateIds = [],
}: {
  routine?: Routine;
  templates: Template[];
  workouts: Workout[];
  weekStartDay: WeekStartDay;
  now?: Date;
  excludeTemplateIds?: string[];
}): PlannedDay[] {
  if (!routine) return [];
  const templateById = new Map(templates.map(t => [t.id, t]));
  const weekStart = startOfDay(weekStartFor(weekStartDay, now));
  const today = startOfDay(now);
  const out: PlannedDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    if (date < today) continue;
    const templateIds = getTemplatesForDay(routine, date.getDay()).filter(id => !excludeTemplateIds.includes(id));
    if (templateIds.length === 0) continue;
    if (isSameDay(date, today)) {
      const finished = workouts.some(
        w => w.completedAt && isSameDay(new Date(w.startedAt), today) && w.templateId && templateIds.includes(w.templateId),
      );
      if (finished) continue;
    }
    out.push({
      dayLabel: DAY_NAMES[date.getDay()],
      exerciseIds: templateIds.flatMap(id => templateById.get(id)?.exerciseIds ?? []),
    });
  }
  return out;
}

export function thisWeekRows({
  volume,
  plan,
  exercises,
  focusMuscleGroups = [],
}: {
  volume: MuscleGroupVolume[];
  plan: PlannedDay[];
  exercises: Exercise[];
  focusMuscleGroups?: string[];
}): ThisWeekRow[] {
  const byId = new Map(exercises.map(e => [e.id, e]));
  const names = MUSCLE_GROUP_DISPLAY_NAMES as Record<string, string>;
  const focus = new Set(focusMuscleGroups);

  // What the rest of the week will credit, per muscle and per day.
  const planned = new Map<string, { sets: number; days: string[] }>();
  for (const day of plan) {
    for (const id of day.exerciseIds) {
      const exercise = byId.get(id);
      if (!exercise || exercise.defaultWarmup) continue;
      const loggedSets = exercise.targetSets ?? (exercise.isUnilateral ? 6 : 3);
      const credit = loggedSets * (exercise.isUnilateral ? 0.5 : 1);
      for (const group of creditedPrimaries(exercise.primaryMuscleGroups ?? [])) {
        const entry = planned.get(group) ?? { sets: 0, days: [] };
        entry.sets += credit;
        if (!entry.days.includes(day.dayLabel)) entry.days.push(day.dayLabel);
        planned.set(group, entry);
      }
    }
  }

  return volume
    .filter(mg => mg.target > 0)
    .map(mg => {
      const group = mg.muscleGroup as string;
      const done = round1(mg.sets);
      const owed = Math.max(0, mg.target - done);
      const plannedHere = planned.get(group);
      const scheduled = round1(Math.min(owed, plannedHere?.sets ?? 0));
      return {
        muscleGroup: group,
        label: names[group] ?? group,
        target: mg.target,
        done,
        scheduled,
        scheduledDays: scheduled > 0 ? plannedHere?.days ?? [] : [],
        flex: round1(Math.max(0, owed - scheduled)),
        pinned: focus.has(group),
      };
    })
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.flex - a.flex ||
        b.scheduled - a.scheduled ||
        a.label.localeCompare(b.label),
    );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
