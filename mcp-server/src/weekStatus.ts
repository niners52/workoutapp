/**
 * get_week_status: the rotation week as the app sees it.
 *
 * Rotation state, the owed list and the Flex plan come from shared/weekPlan,
 * the same file the phone app imports, so this tool and the app's home screen
 * agree by construction. Per-muscle sets come from tallyWeeklyVolume, the
 * counting get_weekly_volume uses. Only the Flex card's hand edits (removed or
 * added exercises) are not visible here: they live on the phone.
 */
import type { ExerciseRow, SetSummaryRow, TemplateRow, WorkoutRow } from './db.js';
import { weekEndKey, weekStartKey, type WeekStartDay } from './dates.js';
import { CREDITED_MUSCLE_GROUPS } from './muscles.js';
import { normalizeName } from './fuzzy.js';
import {
  DEFAULT_FLEX_MINUTES,
  flexPlan,
  owedList,
  rotationFromWeekdays,
  rotationState,
  weekStartInZone,
  weekdayName,
  type PlanExercise,
  type PlanSet,
  type PlanTemplate,
  type PlanWorkout,
  type Rotation,
  type RotationSlot,
  type Tier,
} from './shared/weekPlan.js';
import { ToolError, tallyWeeklyVolume, weeklyTargets, type ToolContext } from './tools.js';

/** The day-6 template the app treats as Flex when a routine has none. */
const KNOWN_FLEX_TEMPLATE_ID = 'fd7ebc8a-02c7-45ef-bd1d-04a40c427bba';
/** How far back durations and per-location availability are read. */
const HISTORY_DAYS = 180;

function toPlanExercise(e: ExerciseRow): PlanExercise {
  return {
    id: e.id,
    name: e.name,
    primary: (e.primary_muscle_groups ?? []).map(String),
    isUnilateral: !!e.is_unilateral,
    targetSets: e.target_sets ?? null,
    targetReps: e.target_reps ?? null,
    defaultWarmup: !!e.default_warmup,
    locationIds: e.location_ids ?? [],
  };
}

function toPlanWorkout(w: WorkoutRow): PlanWorkout {
  return {
    id: w.id,
    templateId: w.template_id,
    startedAt: w.started_at,
    completedAt: w.completed_at,
    locationId: w.location_id ?? null,
    isDeload: !!w.is_deload,
  };
}

function toPlanSet(s: SetSummaryRow): PlanSet {
  return { workoutId: s.workout_id, exerciseId: s.exercise_id, loggedAt: s.logged_at, reps: s.reps, weight: Number(s.weight), isWarmup: s.is_warmup ?? null };
}

function toPlanTemplate(t: TemplateRow): PlanTemplate {
  return { id: t.id, name: t.name, exerciseIds: t.exercise_ids ?? [] };
}

function isSlot(x: unknown): x is RotationSlot {
  return !!x && typeof x === 'object' && typeof (x as RotationSlot).id === 'string' && typeof (x as RotationSlot).templateId === 'string';
}

export async function getWeekStatus(ctx: ToolContext, input: { location?: string }) {
  const now = (ctx.now ?? (() => new Date()))();
  const [settings, routine, templateRows, locations] = await Promise.all([
    ctx.db.getUserSettings(),
    ctx.db.getActiveRoutine(),
    ctx.db.listTemplates(),
    ctx.db.listLocations(),
  ]);
  if (!routine) throw new ToolError('No active routine. Set one as active in the app (Routines).');
  const weekStartDay: WeekStartDay = settings?.week_start_day === 'monday' ? 'monday' : 'sunday';

  const templates = templateRows.map(toPlanTemplate);
  const storedSlots = Array.isArray(routine.rotation?.slots) ? (routine.rotation?.slots as unknown[]).filter(isSlot) : [];
  const rotation: Rotation = storedSlots.length
    ? { slots: storedSlots, flexTemplateId: routine.rotation?.flexTemplateId ?? null }
    : rotationFromWeekdays(routine.day_schedule ?? [], templates.some(t => t.id === KNOWN_FLEX_TEMPLATE_ID) ? KNOWN_FLEX_TEMPLATE_ID : null);

  // History: enough for durations and "has this been done at this gym".
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();
  const historySets = await ctx.db.listSetsSince(since);
  const [historyWorkouts, exerciseRows] = await Promise.all([
    ctx.db.listWorkoutsByIds(historySets.map(s => s.workout_id)),
    ctx.db.listExercises(),
  ]);
  // A session with no sets yet still counts as started; recent ones by date.
  const recentWorkouts = await ctx.db.listRecentWorkouts(40);
  const workoutById = new Map([...historyWorkouts, ...recentWorkouts].map(w => [w.id, w]));
  const allWorkouts = [...workoutById.values()];

  const weekStart = weekStartInZone(now, ctx.timeZone, weekStartDay);
  const weekKey = weekStartKey(now, ctx.timeZone, weekStartDay);
  const exercises = exerciseRows.map(toPlanExercise);
  const planWorkouts = allWorkouts.map(toPlanWorkout);
  const planSets = historySets.map(toPlanSet);
  const base = { rotation, templates, workouts: planWorkouts, sets: planSets, exercises, weekStart, now };
  const tiers = (settings?.health_targets?.muscleTiers ?? null) as Partial<Record<string, Tier>> | null;
  const state = rotationState(base);
  const owed = owedList({ ...base, state, tiers });

  // Sets vs target, by the counting get_weekly_volume uses.
  const tally = tallyWeeklyVolume({ sets: historySets, workouts: allWorkouts, exercises: exerciseRows, weekKeys: [weekKey], timeZone: ctx.timeZone, weekStartDay });
  const done = tally.weeks.get(weekKey);
  const targets = weeklyTargets(settings);
  const doneByMuscle: Record<string, number> = {};
  for (const mg of CREDITED_MUSCLE_GROUPS) doneByMuscle[mg] = round1(done?.[mg] ?? 0);

  // Where Flex is: the named location, else wherever the last session was.
  const locationId = resolveLocation(input.location, locations, allWorkouts);
  const flexTemplate = templates.find(t => t.id === rotation.flexTemplateId) ?? null;
  const capRaw = settings?.health_targets?.flexMinutes;
  const plan = flexPlan({
    owed,
    flexTemplate,
    exercises,
    doneByMuscle,
    targets: targets as Record<string, number>,
    tiers,
    locationId,
    historySets: planSets,
    historyWorkouts: planWorkouts,
    capMinutes: typeof capRaw === 'number' && capRaw > 0 ? capRaw : DEFAULT_FLEX_MINUTES,
  });
  const locationName = (id: string | null) => locations.find(l => l.id === id)?.name?.trim() ?? id;
  const dayOf = (id: string) => {
    const w = workoutById.get(id);
    return w ? weekdayName(new Date(w.started_at), ctx.timeZone) : null;
  };

  return {
    time_zone: ctx.timeZone,
    week_start: weekKey,
    week_end: weekEndKey(weekKey),
    resets: `${weekStartDay === 'monday' ? 'Monday' : 'Sunday'} 00:00 ${ctx.timeZone}; nothing carries over`,
    routine: routine.name,
    rotation: state.slots.map(s => ({
      slot: s.slot.label,
      template: s.template?.name ?? null,
      usual_day: s.slot.usualDay == null ? null : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][s.slot.usualDay],
      performed: s.performed,
      performed_on: s.workoutIds.map(dayOf).filter(Boolean),
    })),
    next_up: state.nextUp ? { slot: state.nextUp.slot.label, template: state.nextUp.template?.name ?? null } : null,
    flex_sessions_this_week: state.flexWorkoutIds.length,
    owed: owed.map(o => ({
      exercise: o.name,
      exercise_id: o.exerciseId,
      from: o.slotLabel,
      source: o.source,
      primary_muscle: o.primaryMuscle,
      tier: o.tier,
      sets: o.sets,
    })),
    flex_plan: {
      location: locationName(plan.locationId),
      template: flexTemplate?.name ?? null,
      cap_minutes: plan.capMinutes,
      total_minutes: plan.totalMinutes,
      order: 'a) owed build-tier, b) Flex default minus muscles at target, c) owed maintain-tier; covered-tier owed work left out',
      items: plan.items.map(i => ({
        exercise: i.name,
        priority: i.priority,
        from: i.slotLabel ?? (i.priority === 'b' ? 'Flex default' : null),
        primary_muscle: i.primaryMuscle,
        tier: i.tier,
        sets: i.sets,
        minutes: i.minutes,
        ...(i.insteadOf ? { instead_of: i.insteadOf.name } : {}),
        ...(i.notAvailableHere ? { not_available_here: true } : {}),
      })),
      expires_sunday: plan.expiresSunday.map(i => ({ exercise: i.name, priority: i.priority, from: i.slotLabel ?? null, minutes: i.minutes })),
      note: 'Hand edits made on the phone\'s Flex card are not visible here.',
    },
    sets_vs_target: CREDITED_MUSCLE_GROUPS.filter(mg => targets[mg] || doneByMuscle[mg]).map(mg => ({
      muscle: mg,
      sets: doneByMuscle[mg] ?? 0,
      target: targets[mg] ?? 0,
      remaining: Math.max(0, round1((targets[mg] ?? 0) - (doneByMuscle[mg] ?? 0))),
    })),
    counting_rules: 'Sets per muscle use get_weekly_volume\'s rules: primary muscles only, unilateral sets 0.5, deload sessions and warm-up sets excluded.',
  };
}

function resolveLocation(query: string | undefined, locations: Array<{ id: string; name: string }>, workouts: WorkoutRow[]): string | null {
  if (query && query.trim()) {
    const q = normalizeName(query);
    const hit =
      locations.find(l => l.id === query) ??
      locations.find(l => normalizeName(l.name) === q) ??
      locations.find(l => normalizeName(l.name).includes(q) || q.includes(normalizeName(l.name)));
    if (!hit) {
      throw new ToolError(`Unknown location "${query}". Known: ${locations.map(l => l.name.trim()).join(', ') || 'none'}.`);
    }
    return hit.id;
  }
  const last = [...workouts].filter(w => w.location_id).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  return last?.location_id ?? null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
