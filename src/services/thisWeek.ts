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
 * "Scheduled" is credited the same way from the rotation workouts not done yet.
 */
import {
  MUSCLE_GROUP_DISPLAY_NAMES,
  type Exercise,
  type MuscleGroupVolume,
} from '../types';
import { creditedPrimaries } from './muscleGroups';
import type { RotationState } from './rotationWeek';

export interface PlannedDay {
  /** The rotation workout still to do, e.g. "W3". */
  dayLabel: string;
  exerciseIds: string[];
}

export interface ThisWeekRow {
  muscleGroup: string;
  label: string;
  target: number;
  /** Working sets credited so far this week. */
  done: number;
  /** Sets the rotation workouts still to do will credit, capped at what is still owed. */
  scheduled: number;
  /** Which of those workouts, in rotation order: ["W3", "W4"]. */
  scheduledDays: string[];
  /** Still owed after done and scheduled: the Flex share. */
  flex: number;
  pinned: boolean;
}

/**
 * The rotation workouts not done yet this week, in order. These are what is
 * "scheduled": they will be done on whatever days come, and what they will not
 * cover is Flex's.
 */
export function remainingPlan(state: RotationState): PlannedDay[] {
  return state.slots
    .filter(s => !s.performed && s.template)
    .map(s => ({ dayLabel: s.slot.label, exerciseIds: s.template?.exerciseIds ?? [] }));
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
