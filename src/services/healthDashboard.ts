/**
 * Health dashboard state: pure functions from synced data plus HealthTargets to
 * what each homepage tile shows. No React, storage, or clock reads; the screen
 * passes `now`, so the tiles and their tests agree on time-of-day behaviour.
 *
 * No-data discipline, same as the MCP layer: a nutrition day counts only when
 * sample_count > 0, a null nutrient means this build cannot read it, and no tile
 * ever turns "nothing logged" into a zero.
 */
import { differenceInCalendarDays, format, parseISO, startOfWeek, subDays } from 'date-fns';
import {
  MUSCLE_GROUP_DISPLAY_NAMES,
  type HealthReminder,
  type HealthTargets,
  type MuscleGroupVolume,
  type WeekStartDay,
} from '../types';

export type Tone = 'normal' | 'good' | 'warning' | 'danger' | 'muted';

/** The nutrition_days fields the dashboard reads. */
export interface NutritionDaySnapshot {
  date: string; // 'YYYY-MM-DD'
  sodium_mg: number | null;
  calcium_mg: number | null;
  protein_g: number | null;
  calories: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  sample_count: number;
  last_sample_at?: string | null;
  synced_at?: string | null;
}

export function formatInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function isLogged(row: NutritionDaySnapshot | null | undefined): row is NutritionDaySnapshot {
  return !!row && row.sample_count > 0;
}

function atHour(now: Date, hour: number): Date {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// ─── Tier 1: sodium ─────────────────────────────────────────────────────────

export type SodiumTile =
  | { kind: 'noData' | 'unreadable'; label: string; headline: string; detail: string }
  | {
      kind: 'budget';
      tone: 'normal' | 'warning' | 'danger';
      label: string;
      headline: string;
      detail: string;
      consumedMg: number;
      budgetMg: number;
      /** Negative when over budget. */
      remainingMg: number;
      /** 0..1 share of the budget still available (0 when over). */
      fractionRemaining: number;
    };

export function sodiumTile(row: NutritionDaySnapshot | null, t: HealthTargets, now: Date): SodiumTile {
  const budget = t.sodiumBudgetMg;
  const label = now.getHours() >= t.eveningStartHour ? 'Sodium left this evening' : 'Sodium left today';

  if (!isLogged(row)) {
    return { kind: 'noData', label, headline: 'Nothing logged yet', detail: `${formatInt(budget)} mg budget` };
  }
  if (row.sodium_mg === null) {
    return { kind: 'unreadable', label, headline: 'Sodium not readable', detail: 'This build cannot read sodium from Apple Health' };
  }

  const consumed = Math.round(row.sodium_mg);
  const remaining = budget - consumed;
  const detail = `${formatInt(consumed)} of ${formatInt(budget)} mg used`;
  if (remaining < 0) {
    return {
      kind: 'budget',
      tone: 'danger',
      label: 'Sodium over budget',
      headline: `${formatInt(-remaining)} mg over`,
      detail,
      consumedMg: consumed,
      budgetMg: budget,
      remainingMg: remaining,
      fractionRemaining: 0,
    };
  }
  const fraction = budget > 0 ? remaining / budget : 0;
  return {
    kind: 'budget',
    tone: fraction <= t.sodiumWarnRemainingPct / 100 ? 'warning' : 'normal',
    label,
    headline: `${formatInt(remaining)} mg left`,
    detail,
    consumedMg: consumed,
    budgetMg: budget,
    remainingMg: remaining,
    fractionRemaining: fraction,
  };
}

// ─── Tier 1: calcium ────────────────────────────────────────────────────────

export const CALCIUM_LABEL = 'Dietary calcium — target, don’t minimize';

export type CalciumStatus = 'low' | 'inBand' | 'above' | 'farAbove';

export interface CalciumTile {
  kind: 'noData' | 'notSyncing' | 'band';
  status: CalciumStatus | null;
  tone: Tone;
  mg: number | null;
  lowMg: number;
  highMg: number;
  farAboveMg: number;
  headline: string;
  detail: string;
}

/**
 * `latestLogged` is the newest logged day (today or earlier). A null calcium on
 * it means the read path is broken, which is reported even when today is empty.
 */
export function calciumTile(
  row: NutritionDaySnapshot | null,
  latestLogged: NutritionDaySnapshot | null,
  t: HealthTargets,
): CalciumTile {
  const low = t.calciumBandLowMg;
  const high = t.calciumBandHighMg;
  const band = `${formatInt(low)}–${formatInt(high)} mg`;
  const evidence = isLogged(row) ? row : isLogged(latestLogged) ? latestLogged : null;
  const limits = { lowMg: low, highMg: high, farAboveMg: t.calciumFarAboveMg };

  if (evidence && evidence.calcium_mg === null) {
    return {
      ...limits,
      kind: 'notSyncing',
      status: null,
      tone: 'warning',
      mg: null,
      headline: 'Calcium not syncing',
      detail: 'Apple Health calcium needs a new app build',
    };
  }
  if (!isLogged(row) || row.calcium_mg === null) {
    return { ...limits, kind: 'noData', status: null, tone: 'muted', mg: null, headline: 'Nothing logged yet', detail: `Target ${band}` };
  }

  const mg = Math.round(row.calcium_mg);
  const base = { ...limits, kind: 'band' as const, mg };
  if (mg < low) {
    return { ...base, status: 'low', tone: 'warning', headline: `${formatInt(mg)} mg — low`, detail: `Below the ${band} target` };
  }
  if (mg <= high) {
    return { ...base, status: 'inBand', tone: 'good', headline: `${formatInt(mg)} mg — in band`, detail: `Target ${band}` };
  }
  if (mg < t.calciumFarAboveMg) {
    return { ...base, status: 'above', tone: 'normal', headline: `${formatInt(mg)} mg — above band`, detail: `Target ${band}` };
  }
  return {
    ...base,
    status: 'farAbove',
    tone: 'warning',
    headline: `${formatInt(mg)} mg — well above`,
    detail: `At or above ${formatInt(t.calciumFarAboveMg)} mg`,
  };
}

// ─── Tier 1: protein ────────────────────────────────────────────────────────

export type ProteinTile =
  | { kind: 'noData' | 'unreadable'; headline: string; detail: string }
  | { kind: 'progress'; grams: number; floorG: number; progressPct: number; met: boolean; headline: string; detail: string };

export function proteinTile(row: NutritionDaySnapshot | null, t: HealthTargets): ProteinTile {
  const floor = t.proteinFloorG;
  if (!isLogged(row)) return { kind: 'noData', headline: 'Nothing logged yet', detail: `${formatInt(floor)} g floor` };
  if (row.protein_g === null) return { kind: 'unreadable', headline: 'Protein not readable', detail: 'This build cannot read protein' };
  const grams = Math.round(row.protein_g);
  const met = grams >= floor;
  return {
    kind: 'progress',
    grams,
    floorG: floor,
    progressPct: floor > 0 ? Math.min(100, (grams / floor) * 100) : 100,
    met,
    headline: `${formatInt(grams)} g`,
    detail: met ? `${formatInt(floor)} g floor met` : `${formatInt(floor - grams)} g to ${formatInt(floor)} g floor`,
  };
}

// ─── Tier 1: calories (a band, not a ceiling) ───────────────────────────────

export interface CalorieBand {
  lowKcal: number;
  highKcal: number;
}

/** The band actually in force: cutting shifts both ends down by the deficit. */
export function calorieBand(t: HealthTargets): CalorieBand {
  const shift = t.macroMode === 'cutting' ? t.cuttingCalorieDeficit : 0;
  return { lowKcal: t.calorieBandLowKcal - shift, highKcal: t.calorieBandHighKcal - shift };
}

export type CalorieStatus = 'under' | 'inBand' | 'over';

export type CaloriesTile =
  | { kind: 'noData' | 'unreadable'; band: CalorieBand; status: null; tone: Tone; headline: string; detail: string }
  | {
      kind: 'band';
      band: CalorieBand;
      status: CalorieStatus;
      tone: Tone;
      kcal: number;
      headline: string;
      detail: string;
    };

/**
 * Under the band is amber ("under-fueled"), not a win — the behavioural change
 * from a cutting ceiling. Over the band is amber too; inside it is the target.
 */
export function caloriesTile(row: NutritionDaySnapshot | null, t: HealthTargets): CaloriesTile {
  const band = calorieBand(t);
  const bandText = `${formatInt(band.lowKcal)}–${formatInt(band.highKcal)} kcal`;
  const modeText = t.macroMode === 'cutting' ? 'cutting' : 'maintenance';

  if (!isLogged(row)) {
    return { kind: 'noData', band, status: null, tone: 'muted', headline: 'Nothing logged yet', detail: `${bandText} (${modeText})` };
  }
  if (row.calories === null) {
    return { kind: 'unreadable', band, status: null, tone: 'warning', headline: 'Calories not readable', detail: 'This build cannot read energy' };
  }

  const kcal = Math.round(row.calories);
  const base = { kind: 'band' as const, band, kcal };
  if (kcal < band.lowKcal) {
    return {
      ...base,
      status: 'under',
      tone: 'warning',
      headline: `${formatInt(kcal)} kcal — under-fueled`,
      detail: `${formatInt(band.lowKcal - kcal)} kcal under the ${bandText} band`,
    };
  }
  if (kcal > band.highKcal) {
    return {
      ...base,
      status: 'over',
      tone: 'warning',
      headline: `${formatInt(kcal)} kcal — over band`,
      detail: `${formatInt(kcal - band.highKcal)} kcal above the ${bandText} band`,
    };
  }
  return { ...base, status: 'inBand', tone: 'good', headline: `${formatInt(kcal)} kcal — in band`, detail: `${bandText} (${modeText})` };
}

// ─── Tier 1: fat (a floor, flagged late in the day) ─────────────────────────

export type FatTile =
  | { kind: 'noData' | 'unreadable'; floorG: number; tone: Tone; met: false; headline: string; detail: string }
  | { kind: 'progress'; floorG: number; highG: number; grams: number; met: boolean; tone: Tone; headline: string; detail: string };

/**
 * Below the floor only turns amber after the evening check hour, so a morning
 * with 20 g logged is not yet a failure. Hormone support is the reason, so the
 * copy says so rather than just showing a number.
 */
export function fatTile(row: NutritionDaySnapshot | null, t: HealthTargets, now: Date): FatTile {
  const floor = t.fatFloorG;
  if (!isLogged(row)) return { kind: 'noData', floorG: floor, tone: 'muted', met: false, headline: 'Nothing logged yet', detail: `${formatInt(floor)} g floor` };
  if (row.fat_g === null) return { kind: 'unreadable', floorG: floor, tone: 'warning', met: false, headline: 'Fat not readable', detail: 'This build cannot read fat' };

  const grams = Math.round(row.fat_g);
  const met = grams >= floor;
  const late = now.getHours() >= t.eveningLogCheckHour;
  return {
    kind: 'progress',
    floorG: floor,
    highG: t.fatTargetHighG,
    grams,
    met,
    tone: met ? 'good' : late ? 'warning' : 'normal',
    headline: `${formatInt(grams)} g`,
    detail: met
      ? `${formatInt(floor)} g floor met (${formatInt(floor)}–${formatInt(t.fatTargetHighG)} g)`
      : late
        ? 'Fat low — hormone support'
        : `${formatInt(floor - grams)} g to the ${formatInt(floor)} g floor`,
  };
}

// ─── Tier 1: carbs (flex fuel, never pass/fail) ─────────────────────────────

export interface CarbsTile {
  kind: 'noData' | 'unreadable' | 'info';
  grams: number | null;
  lowG: number;
  highG: number;
  /** Calorie-band midpoint minus logged protein and fat kcal, as carb grams. Null when protein or fat is unknown. */
  remainingAsCarbsG: number | null;
  headline: string;
  detail: string;
}

export function carbsTile(row: NutritionDaySnapshot | null, t: HealthTargets): CarbsTile {
  const range = { lowG: t.carbRangeLowG, highG: t.carbRangeHighG };
  const rangeText = `${formatInt(range.lowG)}–${formatInt(range.highG)} g range`;
  if (!isLogged(row)) return { ...range, kind: 'noData', grams: null, remainingAsCarbsG: null, headline: 'Nothing logged yet', detail: rangeText };
  if (row.carbs_g === null) return { ...range, kind: 'unreadable', grams: null, remainingAsCarbsG: null, headline: 'Carbs not readable', detail: 'This build cannot read carbohydrate' };

  const grams = Math.round(row.carbs_g);
  const band = calorieBand(t);
  const midpoint = (band.lowKcal + band.highKcal) / 2;
  const remaining =
    row.protein_g === null || row.fat_g === null
      ? null
      : Math.round((midpoint - row.protein_g * 4 - row.fat_g * 9) / 4);
  return {
    ...range,
    kind: 'info',
    grams,
    remainingAsCarbsG: remaining,
    headline: `${formatInt(grams)} g`,
    detail: remaining === null ? rangeText : `${rangeText} · ${formatInt(Math.max(0, remaining))} g left at band midpoint`,
  };
}

// ─── Day verdict: one composite call on a complete logged day ───────────────

export type DayRule = 'calories' | 'protein' | 'fat' | 'sodium' | 'calcium';

export const DAY_RULE_LABELS: Record<DayRule, string> = {
  calories: 'Calories in band',
  protein: 'Protein floor',
  fat: 'Fat floor',
  sodium: 'Sodium budget',
  calcium: 'Calcium band',
};

export type DayVerdict =
  | { kind: 'partial'; headline: string; detail: string }
  | { kind: 'incomplete'; headline: string; detail: string }
  | { kind: 'verdict'; tone: 'good' | 'warning'; passed: DayRule[]; failed: DayRule[]; unknown: DayRule[]; headline: string; detail: string };

/**
 * Green only when every rule passes. A failure names the rules that missed
 * rather than turning the whole day red with no reason, and a rule this build
 * cannot read counts as unknown, which is not a pass.
 *
 * `today` is the local date key of the current day: that day is still being
 * logged, so it never gets a verdict.
 */
export function dayVerdict(row: NutritionDaySnapshot | null, t: HealthTargets, today: string): DayVerdict {
  if (row && row.date === today) return { kind: 'partial', headline: 'Day in progress', detail: 'A verdict lands once the day is complete' };
  if (!isLogged(row)) return { kind: 'incomplete', headline: 'Not logged', detail: 'An unlogged day is incomplete, not compliant' };

  const band = calorieBand(t);
  const checks: Array<{ rule: DayRule; value: number | null; pass: (v: number) => boolean }> = [
    { rule: 'calories', value: row.calories, pass: v => v >= band.lowKcal && v <= band.highKcal },
    { rule: 'protein', value: row.protein_g, pass: v => v >= t.proteinFloorG },
    { rule: 'fat', value: row.fat_g, pass: v => v >= t.fatFloorG },
    { rule: 'sodium', value: row.sodium_mg, pass: v => v <= t.sodiumBudgetMg },
    { rule: 'calcium', value: row.calcium_mg, pass: v => v >= t.calciumBandLowMg && v <= t.calciumBandHighMg },
  ];

  const passed: DayRule[] = [];
  const failed: DayRule[] = [];
  const unknown: DayRule[] = [];
  for (const c of checks) {
    if (c.value === null) unknown.push(c.rule);
    else if (c.pass(Math.round(c.value * 10) / 10)) passed.push(c.rule);
    else failed.push(c.rule);
  }

  if (failed.length === 0 && unknown.length === 0) {
    return { kind: 'verdict', tone: 'good', passed, failed, unknown, headline: 'All five rules met', detail: 'Calories, protein, fat, sodium, calcium' };
  }
  const missed = [...failed, ...unknown].map(r => DAY_RULE_LABELS[r]);
  return {
    kind: 'verdict',
    tone: 'warning',
    passed,
    failed,
    unknown,
    headline: failed.length > 0 ? `${failed.length} of 5 rules missed` : 'Verdict incomplete',
    detail: unknown.length > 0 && failed.length === 0 ? `Unreadable: ${missed.join(', ')}` : `Missed: ${missed.join(', ')}`,
  };
}

// ─── Tier 1: logging completeness ───────────────────────────────────────────

export interface LoggingTile {
  tone: Tone;
  headline: string;
  detail: string;
  nudge: string | null;
}

/**
 * Cronometer writes its Apple Health samples stamped at local midnight rather
 * than at meal time, so a midnight time says nothing about when food was eaten.
 */
export function isMidnightStamp(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
}

/**
 * `changedAt` is when a sync on this phone saw today's totals change. It is the
 * fallback when the entries carry no real time, and it is only as fine-grained
 * as the syncs (home re-reads Apple Health every 15 minutes while open).
 */
export function loggingTile(
  row: NutritionDaySnapshot | null,
  t: HealthTargets,
  now: Date,
  changedAt: string | null = null,
): LoggingTile {
  const afterCheck = now.getHours() >= t.eveningLogCheckHour;

  if (!isLogged(row)) {
    return afterCheck
      ? { tone: 'warning', headline: 'Nothing logged today', detail: 'An unlogged day is incomplete, not compliant', nudge: 'Nothing logged today — sodium invisible' }
      : { tone: 'muted', headline: 'Nothing logged yet', detail: 'An unlogged day is incomplete, not compliant', nudge: null };
  }

  const entryTime = row.last_sample_at && !isMidnightStamp(row.last_sample_at) ? new Date(row.last_sample_at) : null;
  const changed = changedAt ? new Date(changedAt) : null;
  const last = entryTime ?? changed;
  const synced = row.synced_at ? new Date(row.synced_at) : null;
  const syncedText = synced ? `Synced ${format(synced, 'h:mm a')}` : 'Not synced yet';

  if (!last) {
    // Midnight-stamped entries and no change seen on this phone yet: the count is known, the time is not.
    return { tone: 'normal', headline: `${row.sample_count} entries today`, detail: syncedText, nudge: null };
  }

  const headline = entryTime ? `Last entry ${format(last, 'h:mm a')}` : `Updated ${format(last, 'h:mm a')}`;
  if (afterCheck && last < atHour(now, t.eveningStartHour)) {
    // Synced before the check hour: whether the evening was logged is unknown, so
    // it still reads as incomplete rather than fine.
    const nudge = synced && synced < atHour(now, t.eveningLogCheckHour)
      ? 'Evening not synced — pull to refresh'
      : 'Evening unlogged — sodium invisible';
    return { tone: 'warning', headline, detail: syncedText, nudge };
  }
  return { tone: 'normal', headline, detail: syncedText, nudge: null };
}

// ─── Tier 2: weekly volume ──────────────────────────────────────────────────

export interface VolumeRow {
  key: string;
  label: string;
  muscleGroup: string;
  sets: number;
  target: number | null;
  /** target - sets, rounded; null when the row has no target. */
  gap: number | null;
  tone: Tone;
  pinned: boolean;
}

export interface WeeklyVolumeView {
  deload: boolean;
  focus: VolumeRow[];
  /** Below target, biggest gap first. */
  open: VolumeRow[];
  /** At or over target, collapsed below the fold. */
  met: VolumeRow[];
}

export function weekStartFor(date: Date, weekStartDay: WeekStartDay): Date {
  return startOfWeek(date, { weekStartsOn: weekStartDay === 'monday' ? 1 : 0 });
}

export function isDeloadWeek(deloadWeekStart: string | null, now: Date, weekStartDay: WeekStartDay): boolean {
  if (!deloadWeekStart) return false;
  const d = parseISO(deloadWeekStart);
  if (Number.isNaN(d.getTime())) return false;
  return weekStartFor(d, weekStartDay).getTime() === weekStartFor(now, weekStartDay).getTime();
}

/** Behind the even weekly pace = warning; late in the week with over half left = danger. */
function urgency(sets: number, target: number, daysElapsed: number): Tone {
  if (sets >= (target * daysElapsed) / 7) return 'normal';
  if (daysElapsed >= 5 && target - sets > target / 2) return 'danger';
  return 'warning';
}

/**
 * `muscleGroups` must come from analytics.getWeeklyVolume (the Weekly Volume
 * panel's counting rules); this only sorts and labels it.
 */
export function weeklyVolumeView(
  muscleGroups: MuscleGroupVolume[],
  t: HealthTargets,
  now: Date,
  weekStartDay: WeekStartDay,
): WeeklyVolumeView {
  const deload = isDeloadWeek(t.deloadWeekStart, now, weekStartDay);
  const daysElapsed = Math.min(7, differenceInCalendarDays(now, weekStartFor(now, weekStartDay)) + 1);
  const byGroup = new Map<string, MuscleGroupVolume>(muscleGroups.map(mg => [mg.muscleGroup, mg]));
  const names = MUSCLE_GROUP_DISPLAY_NAMES as Record<string, string>;

  const makeRow = (key: string, label: string, muscleGroup: string, sets: number, target: number | null, pinned: boolean): VolumeRow => {
    const roundedSets = round1(sets);
    const gap = target === null ? null : round1(target - roundedSets);
    let tone: Tone = 'normal';
    if (gap !== null && gap <= 0) tone = 'muted';
    else if (gap !== null && !deload) tone = urgency(roundedSets, target!, daysElapsed);
    return { key, label, muscleGroup, sets: roundedSets, target, gap, tone, pinned };
  };

  const focus = t.focusGroups.map(f => {
    const mg = byGroup.get(f.muscleGroup);
    const filter = f.exerciseNameIncludes?.trim().toLowerCase();
    const sets = !mg
      ? 0
      : filter
        ? mg.exercises.filter(e => e.exerciseName.toLowerCase().includes(filter)).reduce((s, e) => s + e.sets, 0)
        : mg.sets;
    const target = f.targetSets && f.targetSets > 0 ? f.targetSets : !filter && mg && mg.target > 0 ? mg.target : null;
    return makeRow(`focus:${f.id}`, f.label, f.muscleGroup, sets, target, true);
  });

  // A focus row covering a whole group replaces that group's row in the sorted list.
  const pinnedWhole = new Set(t.focusGroups.filter(f => !f.exerciseNameIncludes?.trim()).map(f => f.muscleGroup as string));
  const rows = muscleGroups
    .filter(mg => mg.target > 0 && !pinnedWhole.has(mg.muscleGroup))
    .map(mg => makeRow(mg.muscleGroup, names[mg.muscleGroup] ?? mg.muscleGroup, mg.muscleGroup, mg.sets, mg.target, false));

  return {
    deload,
    focus,
    open: rows.filter(r => (r.gap ?? 0) > 0).sort((a, b) => b.gap! - a.gap! || a.label.localeCompare(b.label)),
    met: rows.filter(r => (r.gap ?? 0) <= 0),
  };
}

// ─── Tier 2: body weight ────────────────────────────────────────────────────

export interface WeightEntry {
  date: string; // 'YYYY-MM-DD'
  weight?: number;
}

export type WeightPhase = 'maintenance' | 'deficit' | 'belowGoal';

export type BodyWeightTile =
  | { kind: 'noData'; headline: string; detail: string }
  | { kind: 'stale'; headline: string; detail: string; lastDate: string; daysAgo: number }
  | {
      kind: 'trend';
      avg7: number;
      goal: number;
      delta: number;
      atGoal: boolean;
      phase: WeightPhase;
      headline: string;
      detail: string;
      calorieCopy: string;
      /** 7-day rolling average on each weigh-in day of the last 30 days, oldest first. */
      series: Array<{ date: string; avg: number }>;
    };

export function bodyWeightTile(entries: WeightEntry[], t: HealthTargets, now: Date): BodyWeightTile {
  const todayKey = format(now, 'yyyy-MM-dd');
  const byDate = new Map<string, number[]>();
  for (const e of entries) {
    if (typeof e.weight !== 'number' || !(e.weight > 0) || e.date > todayKey) continue;
    byDate.set(e.date, [...(byDate.get(e.date) ?? []), e.weight]);
  }
  const daily = [...byDate.entries()]
    .map(([date, ws]) => ({ date, weight: mean(ws) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const newest = daily[daily.length - 1];
  if (!newest) return { kind: 'noData', headline: 'No weigh-ins yet', detail: 'Step on the scale' };

  const daysAgo = differenceInCalendarDays(now, parseISO(newest.date));
  if (daysAgo > t.weighInStaleDays) {
    return {
      kind: 'stale',
      headline: 'Step on the scale',
      detail: `Last weigh-in ${format(parseISO(newest.date), 'MMM d')} (${daysAgo} days ago)`,
      lastDate: newest.date,
      daysAgo,
    };
  }

  const avgEnding = (endKey: string): number => {
    const startKey = format(subDays(parseISO(endKey), 6), 'yyyy-MM-dd');
    return mean(daily.filter(d => d.date >= startKey && d.date <= endKey).map(d => d.weight));
  };
  const avg7 = round1(avgEnding(todayKey));
  const goal = t.goalWeightLbs;
  const delta = round1(avg7 - goal);
  const atGoal = Math.abs(delta) <= t.goalWeightToleranceLbs;
  // Mode is explicit now, so it decides the phase; proximity to the goal line
  // only decides whether the tile says "at goal".
  const phase: WeightPhase = t.macroMode === 'maintenance' ? 'maintenance' : delta > 0 ? 'deficit' : 'belowGoal';
  const sinceKey = format(subDays(now, 29), 'yyyy-MM-dd');

  return {
    kind: 'trend',
    avg7,
    goal,
    delta,
    atGoal,
    phase,
    headline: `${avg7.toFixed(1)} lb`,
    detail:
      phase === 'maintenance'
        ? atGoal
          ? 'At goal — maintenance mode'
          : `${Math.abs(delta).toFixed(1)} lb ${delta > 0 ? 'above' : 'below'} ${formatInt(goal)} lb goal — maintenance mode`
        : phase === 'deficit'
          ? `${delta.toFixed(1)} lb above ${formatInt(goal)} lb goal`
          : `${(-delta).toFixed(1)} lb below ${formatInt(goal)} lb goal`,
    calorieCopy:
      phase === 'maintenance'
        ? 'Eat at maintenance calories'
        : phase === 'deficit'
          ? 'Calorie deficit toward goal'
          : 'No deficit — eat at or above maintenance',
    series: daily.filter(d => d.date >= sinceKey).map(d => ({ date: d.date, avg: round1(avgEnding(d.date)) })),
  };
}

// ─── Tier 2: sleep ──────────────────────────────────────────────────────────

export interface SleepNightSnapshot {
  date: string; // wake date
  time_asleep_min: number;
}

/**
 * notDeployed: the sleep_nights table does not exist yet. That is the feature
 * flag: the card switches to real data as soon as the table is there.
 */
export type SleepInput =
  | { state: 'notDeployed' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; night: SleepNightSnapshot | null };

export type SleepTile =
  | { kind: 'comingSoon' | 'noData' | 'unreachable'; headline: string; detail: string }
  | { kind: 'night'; tone: Tone; asleepMin: number; targetMin: number; met: boolean; headline: string; detail: string };

function hm(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function sleepTile(input: SleepInput, t: HealthTargets): SleepTile {
  if (input.state === 'notDeployed') return { kind: 'comingSoon', headline: 'Sleep sync coming', detail: `${t.sleepTargetHours} h target` };
  if (input.state === 'error') return { kind: 'unreachable', headline: 'Sleep unavailable', detail: 'Could not reach the cloud' };
  if (!input.night) return { kind: 'noData', headline: 'No sleep recorded last night', detail: `${t.sleepTargetHours} h target` };
  const targetMin = t.sleepTargetHours * 60;
  const asleep = input.night.time_asleep_min;
  const met = asleep >= targetMin;
  return {
    kind: 'night',
    tone: met ? 'good' : 'warning',
    asleepMin: asleep,
    targetMin,
    met,
    headline: `${hm(asleep)} asleep`,
    detail: met ? `${t.sleepTargetHours} h target met` : `${hm(targetMin - asleep)} under ${t.sleepTargetHours} h target`,
  };
}

// ─── Tier 3: reminders ──────────────────────────────────────────────────────

export type ReminderStatus = 'overdue' | 'dueNow' | 'upcoming';

export interface ReminderView {
  reminder: HealthReminder;
  status: ReminderStatus;
  dueLabel: string;
}

/** Undone reminders, soonest first; a null due date counts as due today. */
export function openReminders(list: HealthReminder[], now: Date): ReminderView[] {
  const todayKey = format(now, 'yyyy-MM-dd');
  return list
    .filter(r => !r.doneAt)
    .sort(
      (a, b) =>
        (a.dueDate ?? todayKey).localeCompare(b.dueDate ?? todayKey) ||
        a.sortOrder - b.sortOrder ||
        a.title.localeCompare(b.title),
    )
    .map(reminder => {
      const due = reminder.dueDate;
      if (!due) return { reminder, status: 'dueNow' as const, dueLabel: 'Due now' };
      if (due < todayKey) return { reminder, status: 'overdue' as const, dueLabel: `Overdue since ${format(parseISO(due), 'MMM d')}` };
      if (due === todayKey) return { reminder, status: 'dueNow' as const, dueLabel: 'Due today' };
      return { reminder, status: 'upcoming' as const, dueLabel: `Due ${format(parseISO(due), 'MMM d, yyyy')}` };
    });
}
