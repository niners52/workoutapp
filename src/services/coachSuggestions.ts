import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  startOfWeek,
  format,
  differenceInDays,
  subDays,
} from 'date-fns';
import {
  Workout,
  WorkoutSet,
  Exercise,
  Template,
  Routine,
  UserSettings,
  PrimaryMuscleGroup,
  MUSCLE_GROUP_DISPLAY_NAMES,
} from '../types';
import { MuscleGroupShortfall } from './analytics';
import { analyzeFatigue } from './fatigueDetection';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CoachSuggestionType =
  | 'volume_gap'
  | 'muscle_imbalance'
  | 'missed_muscle_group'
  | 'recovery'
  | 'fatigue'
  | 'insight';

export interface CoachSuggestion {
  id: string;
  type: CoachSuggestionType;
  priority: number;
  icon: string;
  message: string;
  detail?: string;
  muscleGroup?: string;
}

interface DismissedSuggestion {
  id: string;
  dismissedAt: string;
  expiresAt: string;
}

// ─── Dismissed Suggestions Storage ───────────────────────────────────────────

const DISMISSED_KEY = '@workout_tracker/coach_dismissed';

async function getDismissedSuggestions(): Promise<DismissedSuggestion[]> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    if (!raw) return [];
    const all: DismissedSuggestion[] = JSON.parse(raw);
    const now = new Date().toISOString();
    return all.filter(d => d.expiresAt > now);
  } catch {
    return [];
  }
}

export async function dismissSuggestion(
  id: string,
  durationHours: number = 24
): Promise<void> {
  const existing = await getDismissedSuggestions();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
  const updated = existing.filter(d => d.id !== id);
  updated.push({
    id,
    dismissedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(updated));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getExercisePrimaryMuscles(exercise: Exercise): PrimaryMuscleGroup[] {
  if (exercise.primaryMuscleGroups?.length) return exercise.primaryMuscleGroups;
  if (exercise.primaryMuscleGroup) return [exercise.primaryMuscleGroup];
  return [];
}

function displayName(mg: string): string {
  return (MUSCLE_GROUP_DISPLAY_NAMES as Record<string, string>)[mg] || mg;
}

// ─── Push/Pull Pairs for Imbalance Detection ────────────────────────────────

const PUSH_PULL_PAIRS: [PrimaryMuscleGroup, PrimaryMuscleGroup][] = [
  ['chest', 'lats'],
  ['chest', 'upper_back'],
  ['front_delts', 'upper_back'],
  ['triceps', 'biceps'],
  ['quads', 'hamstrings'],
];

// ─── 1. Volume Gap Suggestions ──────────────────────────────────────────────

function generateVolumeGapSuggestions(
  shortfalls: MuscleGroupShortfall[]
): CoachSuggestion[] {
  return shortfalls.slice(0, 3).map(sf => ({
    id: `volume_gap:${sf.muscleGroup}`,
    type: 'volume_gap' as CoachSuggestionType,
    priority: Math.min(90, 70 + sf.shortfall * 2),
    icon: 'trending-down-outline',
    message: `${sf.displayName} under-targeted — ${sf.currentSets} of ${sf.targetSets} sets this week`,
    detail: `Need ${sf.shortfall} more sets${sf.projectedSets > 0 ? `. ${sf.projectedSets} scheduled from remaining workouts.` : '.'}`,
    muscleGroup: sf.muscleGroup,
  }));
}

// ─── 2. Muscle Imbalance Suggestions ────────────────────────────────────────

function generateMuscleImbalanceSuggestions(
  workouts: Workout[],
  sets: WorkoutSet[],
  exercises: Exercise[],
  settings: UserSettings
): CoachSuggestion[] {
  const weekStartsOn = settings.weekStartDay === 'monday' ? 1 : 0;
  const weekStart = startOfWeek(new Date(), { weekStartsOn });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  // Get completed non-deload workouts this week
  const thisWeekWorkouts = workouts.filter(w => {
    if (!w.completedAt || w.isDeload) return false;
    return format(new Date(w.completedAt), 'yyyy-MM-dd') >= weekStartStr;
  });

  if (thisWeekWorkouts.length === 0) return [];

  // Build a map: workoutId -> set of muscle groups trained
  const workoutMuscles = new Map<string, Set<PrimaryMuscleGroup>>();
  for (const w of thisWeekWorkouts) {
    workoutMuscles.set(w.id, new Set());
  }
  for (const set of sets) {
    const mgSet = workoutMuscles.get(set.workoutId);
    if (!mgSet) continue;
    const exercise = exercises.find(e => e.id === set.exerciseId);
    if (!exercise) continue;
    for (const mg of getExercisePrimaryMuscles(exercise)) {
      mgSet.add(mg);
    }
  }

  // Count how many workouts hit each muscle group
  const mgWorkoutCount = new Map<PrimaryMuscleGroup, number>();
  for (const mgSet of workoutMuscles.values()) {
    for (const mg of mgSet) {
      mgWorkoutCount.set(mg, (mgWorkoutCount.get(mg) || 0) + 1);
    }
  }

  const suggestions: CoachSuggestion[] = [];
  const seen = new Set<string>();

  for (const [mgA, mgB] of PUSH_PULL_PAIRS) {
    const countA = mgWorkoutCount.get(mgA) || 0;
    const countB = mgWorkoutCount.get(mgB) || 0;
    if (countA === 0 && countB === 0) continue;

    const max = Math.max(countA, countB);
    const min = Math.min(countA, countB);
    if (min === 0 && max >= 2) {
      // One side completely missed
      const [dominant, weak] = countA > countB ? [mgA, mgB] : [mgB, mgA];
      const key = `imbalance:${dominant}:${weak}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        id: key,
        type: 'muscle_imbalance',
        priority: Math.min(75, 55 + max * 5),
        icon: 'swap-horizontal-outline',
        message: `${displayName(dominant)} trained ${max}x this week but ${displayName(weak)} 0x`,
        muscleGroup: weak,
      });
    } else if (max >= 2 * min && min > 0) {
      const [dominant, weak] = countA > countB ? [mgA, mgB] : [mgB, mgA];
      const key = `imbalance:${dominant}:${weak}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ratio = Math.floor(max / min);
      suggestions.push({
        id: key,
        type: 'muscle_imbalance',
        priority: Math.min(75, 50 + (ratio - 1) * 10),
        icon: 'swap-horizontal-outline',
        message: `${displayName(dominant)} trained ${max}x this week but ${displayName(weak)} only ${min}x`,
        muscleGroup: weak,
      });
    }
  }

  return suggestions;
}

// ─── 3. Missed Muscle Group Suggestions ─────────────────────────────────────

function generateMissedMuscleGroupSuggestions(
  workouts: Workout[],
  sets: WorkoutSet[],
  exercises: Exercise[],
  settings: UserSettings
): CoachSuggestion[] {
  const today = new Date();

  // Build map: muscle group -> most recent date trained (non-deload only)
  const lastTrained = new Map<PrimaryMuscleGroup, Date>();

  const completedWorkouts = workouts.filter(w => w.completedAt && !w.isDeload);
  const workoutDateMap = new Map<string, Date>();
  for (const w of completedWorkouts) {
    workoutDateMap.set(w.id, new Date(w.completedAt!));
  }

  for (const set of sets) {
    const workoutDate = workoutDateMap.get(set.workoutId);
    if (!workoutDate) continue;
    const exercise = exercises.find(e => e.id === set.exerciseId);
    if (!exercise) continue;
    for (const mg of getExercisePrimaryMuscles(exercise)) {
      const existing = lastTrained.get(mg);
      if (!existing || workoutDate > existing) {
        lastTrained.set(mg, workoutDate);
      }
    }
  }

  const suggestions: CoachSuggestion[] = [];

  for (const [mg, target] of Object.entries(settings.muscleGroupTargets)) {
    if (target <= 0) continue;
    const lastDate = lastTrained.get(mg as PrimaryMuscleGroup);
    if (!lastDate) {
      // Never trained but has a target — only suggest if they have any workout history at all
      if (completedWorkouts.length > 7) {
        suggestions.push({
          id: `missed:${mg}`,
          type: 'missed_muscle_group',
          priority: 75,
          icon: 'alert-circle-outline',
          message: `${displayName(mg)} hasn't been trained recently`,
          muscleGroup: mg,
        });
      }
      continue;
    }

    const daysSince = differenceInDays(today, lastDate);
    if (daysSince >= 14) {
      suggestions.push({
        id: `missed:${mg}`,
        type: 'missed_muscle_group',
        priority: Math.min(80, 60 + (daysSince - 14)),
        icon: 'alert-circle-outline',
        message: `You haven't trained ${displayName(mg)} in ${daysSince} days`,
        muscleGroup: mg,
      });
    }
  }

  return suggestions;
}

// ─── 4. Recovery Suggestions ────────────────────────────────────────────────

function isFullBodyRoutine(
  routine: Routine | undefined,
  templates: Template[]
): boolean {
  if (!routine) return false;

  // Get all template IDs used in the routine's schedule
  const routineTemplateIds = routine.daySchedule
    .flatMap(day => day.templateIds)
    .filter(id => id);
  if (routineTemplateIds.length === 0) return false;

  // Count how many are full_body vs other types
  let fullBodyCount = 0;
  for (const id of routineTemplateIds) {
    const template = templates.find(t => t.id === id);
    if (template?.type === 'full_body') fullBodyCount++;
  }

  // If majority of training days use full_body templates, it's a full body routine
  return fullBodyCount > routineTemplateIds.length / 2;
}

function generateRecoverySuggestions(
  workouts: Workout[],
  sets: WorkoutSet[],
  exercises: Exercise[],
  routine: Routine | undefined,
  templates: Template[]
): CoachSuggestion[] {
  const fullBody = isFullBodyRoutine(routine, templates);

  // Full body routines intentionally hit every muscle each session —
  // per-muscle consecutive day warnings are not useful
  if (fullBody) return [];

  const today = new Date();

  // Look at last 5 days (to detect 3+ consecutive)
  const recentDays: string[] = [];
  for (let i = 0; i < 5; i++) {
    recentDays.push(format(subDays(today, i), 'yyyy-MM-dd'));
  }

  // Build: date -> set of muscle groups trained
  const dayMuscles = new Map<string, Set<PrimaryMuscleGroup>>();
  for (const d of recentDays) {
    dayMuscles.set(d, new Set());
  }

  const workoutDateMap = new Map<string, string>();
  for (const w of workouts) {
    if (!w.completedAt || w.isDeload) continue; // Skip deload workouts
    const dateStr = format(new Date(w.completedAt), 'yyyy-MM-dd');
    if (dayMuscles.has(dateStr)) {
      workoutDateMap.set(w.id, dateStr);
    }
  }

  for (const set of sets) {
    const dateStr = workoutDateMap.get(set.workoutId);
    if (!dateStr) continue;
    const mgSet = dayMuscles.get(dateStr);
    if (!mgSet) continue;
    const exercise = exercises.find(e => e.id === set.exerciseId);
    if (!exercise) continue;
    for (const mg of getExercisePrimaryMuscles(exercise)) {
      mgSet.add(mg);
    }
  }

  // For each muscle group, count consecutive days ending today or yesterday
  const allMuscles = new Set<PrimaryMuscleGroup>();
  for (const mgSet of dayMuscles.values()) {
    for (const mg of mgSet) allMuscles.add(mg);
  }

  const suggestions: CoachSuggestion[] = [];

  for (const mg of allMuscles) {
    let consecutive = 0;
    for (const day of recentDays) {
      if (dayMuscles.get(day)?.has(mg)) {
        consecutive++;
      } else {
        break;
      }
    }

    if (consecutive >= 3) {
      suggestions.push({
        id: `recovery:${mg}`,
        type: 'recovery',
        priority: Math.min(95, 80 + (consecutive - 3) * 5),
        icon: 'bed-outline',
        message: `${displayName(mg)} trained ${consecutive} days in a row — consider rest`,
        muscleGroup: mg,
      });
    }
  }

  return suggestions;
}

// ─── 6. Fatigue Suggestions ──────────────────────────────────────────────────

function generateFatigueSuggestions(
  workouts: Workout[],
  sets: WorkoutSet[],
  exercises: Exercise[],
  settings: UserSettings
): CoachSuggestion[] {
  if (settings.fatigueDetectionEnabled === false || settings.isOnDeload) {
    return [];
  }

  const analysis = analyzeFatigue(workouts, sets, exercises, settings);
  const suggestions: CoachSuggestion[] = [];

  // Top 2 exercise signals
  for (const signal of analysis.exerciseSignals.slice(0, 2)) {
    const sensitivity = settings.fatigueSensitivity ?? 10;
    suggestions.push({
      id: `fatigue:exercise:${signal.exerciseId}`,
      type: 'fatigue',
      priority: Math.min(90, 75 + Math.max(0, signal.declinePercent - sensitivity)),
      icon: 'trending-down-outline',
      message: signal.message,
      detail: signal.detail,
    });
  }

  // Overall signals
  const iconMap: Record<string, string> = {
    overtraining: 'fitness-outline',
    volume_drop: 'pulse-outline',
    incomplete_workouts: 'remove-circle-outline',
  };

  for (const signal of analysis.overallSignals) {
    suggestions.push({
      id: `fatigue:overall:${signal.signalType}`,
      type: 'fatigue',
      priority: Math.min(95, signal.severity),
      icon: iconMap[signal.signalType] || 'warning-outline',
      message: signal.message,
      detail: signal.detail,
    });
  }

  // Deload suggestion
  if (analysis.deloadSuggested) {
    suggestions.push({
      id: 'fatigue:deload',
      type: 'fatigue',
      priority: 85,
      icon: 'pause-circle-outline',
      message: 'Multiple fatigue signals — consider a deload week',
      detail: 'Drop weight 10-15% this week and focus on form and recovery.',
    });
  }

  return suggestions;
}

// ─── Coach Context ──────────────────────────────────────────────────────────
// Detects life events that should soften the coach's tone: returning from a
// long break (illness, vacation), wrapping up a deload, etc. We compute this
// once and pass it to every generator so they can adjust their messaging.

interface CoachContext {
  // Days since the most recent completed (non-deload) workout, or null when there is none.
  daysSinceLastWorkout: number | null;
  // True if the user has just returned after a 7+ day gap — the most recent workout
  // happened within the last 3 days AND the workout before it was 7+ days earlier.
  justReturnedFromBreak: boolean;
  // The size of that gap in days, if any.
  priorGapDays: number | null;
  // True if the user is currently inside a 14-day grace window after a long break.
  // During this window, week-over-week comparisons are suppressed so the user
  // isn't told they "declined" relative to pre-break performance.
  inReturnGracePeriod: boolean;
}

function computeCoachContext(workouts: Workout[]): CoachContext {
  const now = new Date();
  const completed = workouts
    .filter(w => w.completedAt && !w.isDeload)
    .map(w => new Date(w.completedAt || w.startedAt))
    .sort((a, b) => b.getTime() - a.getTime());

  if (completed.length === 0) {
    return {
      daysSinceLastWorkout: null,
      justReturnedFromBreak: false,
      priorGapDays: null,
      inReturnGracePeriod: false,
    };
  }

  const last = completed[0];
  const daysSinceLastWorkout = Math.floor(
    (now.getTime() - last.getTime()) / (24 * 60 * 60 * 1000)
  );

  const prior = completed[1];
  const priorGapDays = prior
    ? Math.floor((last.getTime() - prior.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  // Just returned: latest workout is recent AND there was a 7+ day gap before it.
  const justReturnedFromBreak =
    daysSinceLastWorkout <= 3 && (priorGapDays ?? 0) >= 7;

  // Grace window: if the last 14 days contain a 7+ day gap, soften comparisons.
  let inReturnGracePeriod = false;
  for (let i = 0; i < completed.length - 1; i++) {
    const cur = completed[i];
    const next = completed[i + 1];
    const gap = Math.floor((cur.getTime() - next.getTime()) / (24 * 60 * 60 * 1000));
    if (gap >= 7) {
      const daysSinceGapEnded = Math.floor(
        (now.getTime() - cur.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daysSinceGapEnded <= 14) {
        inReturnGracePeriod = true;
      }
      break;
    }
  }

  return { daysSinceLastWorkout, justReturnedFromBreak, priorGapDays, inReturnGracePeriod };
}

// ─── 6. Positive Insights ───────────────────────────────────────────────────
// Mix wins and progress into the feed so users don't only see warnings.

function generatePositiveInsights(
  workouts: Workout[],
  sets: WorkoutSet[],
  exercises: Exercise[],
  context: CoachContext,
): CoachSuggestion[] {
  const suggestions: CoachSuggestion[] = [];

  const now = new Date();
  const oneWeekAgo = subDays(now, 7);
  const twoWeeksAgo = subDays(now, 14);
  const fourWeeksAgo = subDays(now, 28);
  const eightWeeksAgo = subDays(now, 56);

  const completedWorkouts = workouts.filter(w => w.completedAt && !w.isDeload);
  const workoutDateById = new Map<string, Date>();
  for (const w of completedWorkouts) {
    workoutDateById.set(w.id, new Date(w.completedAt || w.startedAt));
  }
  const workingSets = sets.filter(s => workoutDateById.has(s.workoutId));

  // ── 0. Welcome back ───────────────────────────────────────────────────────
  // Highest-priority encouragement when someone just returned after a long break,
  // even if the rest of the data looks sparse.
  if (context.justReturnedFromBreak) {
    const gap = context.priorGapDays ?? 0;
    suggestions.push({
      id: 'positive:welcome_back',
      type: 'insight',
      priority: 98,
      icon: 'sunny-outline',
      message: gap >= 7
        ? `First workout in ${gap} days — nice job showing up`
        : 'Welcome back! Great to see you training again',
      detail: 'No need to compare to before. Build from where you are today.',
    });
  }

  // Sets this week (always a positive snapshot when the user has any activity)
  const setsThisWeekCount = workingSets.filter(s => {
    const d = workoutDateById.get(s.workoutId);
    return d && d >= oneWeekAgo;
  }).length;
  if (setsThisWeekCount > 0) {
    suggestions.push({
      id: 'positive:sets_this_week',
      type: 'insight',
      priority: 60,
      icon: 'list-outline',
      message: `${setsThisWeekCount} set${setsThisWeekCount === 1 ? '' : 's'} logged this week — keep it going`,
    });
  }

  // No history yet → only the welcome-back / sets-this-week messages above apply
  if (workouts.length === 0 || sets.length === 0) return suggestions;

  // ── A. Volume up week-over-week ───────────────────────────────────────────
  const volumeInRange = (start: Date, end: Date): number => {
    let sum = 0;
    for (const s of workingSets) {
      const d = workoutDateById.get(s.workoutId);
      if (d && d >= start && d < end) sum += (s.weight || 0) * (s.reps || 0);
    }
    return sum;
  };
  const thisWeekVol = volumeInRange(oneWeekAgo, now);
  const lastWeekVol = volumeInRange(twoWeeksAgo, oneWeekAgo);
  // Skip comparisons while returning from a break — a week with one workout vs.
  // a week of zero would otherwise generate a misleading "+1000%" insight.
  if (!context.inReturnGracePeriod && lastWeekVol > 0 && thisWeekVol > lastWeekVol * 1.05) {
    const pct = Math.round(((thisWeekVol - lastWeekVol) / lastWeekVol) * 100);
    suggestions.push({
      id: 'positive:volume_up',
      type: 'insight',
      priority: 70,
      icon: 'trending-up',
      message: `Volume up ${pct}% from last week`,
      detail: 'Solid progress — keep the momentum going.',
    });
  }

  // ── B. New PR in the last week (vs. all prior history) ────────────────────
  // Pick the most impressive single PR (largest % gain over previous best).
  const recentSetsByExercise = new Map<string, WorkoutSet[]>();
  const olderSetsByExercise = new Map<string, WorkoutSet[]>();
  for (const s of workingSets) {
    const d = workoutDateById.get(s.workoutId)!;
    const map = d >= oneWeekAgo ? recentSetsByExercise : olderSetsByExercise;
    const arr = map.get(s.exerciseId) ?? [];
    arr.push(s);
    map.set(s.exerciseId, arr);
  }
  let bestPR: { name: string; gain: number } | null = null;
  recentSetsByExercise.forEach((recent, exerciseId) => {
    const ex = exercises.find(e => e.id === exerciseId);
    if (!ex) return;
    const recentMax = Math.max(...recent.map(s => s.weight || 0), 0);
    if (recentMax <= 0) return;
    const older = olderSetsByExercise.get(exerciseId) ?? [];
    if (older.length === 0) return; // No prior baseline — not a PR worth flagging
    const olderMax = Math.max(...older.map(s => s.weight || 0), 0);
    if (recentMax > olderMax && olderMax > 0) {
      const gain = (recentMax - olderMax) / olderMax;
      if (!bestPR || gain > bestPR.gain) {
        bestPR = { name: ex.name, gain };
      }
    }
  });
  if (bestPR !== null) {
    const pr = bestPR as { name: string; gain: number };
    suggestions.push({
      id: 'positive:pr_this_week',
      type: 'insight',
      priority: 75,
      icon: 'trophy-outline',
      message: `New PR on ${pr.name} this week!`,
      detail: 'Heaviest set yet — note the conditions so you can repeat it.',
    });
  }

  // ── C. Consistency: count consecutive recent weeks with >=1 workout ───────
  const weekKey = (d: Date) => format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weeksWithWorkouts = new Set<string>();
  for (const w of completedWorkouts) {
    weeksWithWorkouts.add(weekKey(new Date(w.completedAt || w.startedAt)));
  }
  let streak = 0;
  for (let i = 0; i < 12; i++) {
    const weekDate = subDays(now, i * 7);
    if (weeksWithWorkouts.has(weekKey(weekDate))) streak += 1;
    else break;
  }
  if (streak >= 3) {
    suggestions.push({
      id: 'positive:consistency',
      type: 'insight',
      priority: 65,
      icon: 'flame-outline',
      message: `${streak} weeks straight with workouts — great consistency`,
      detail: 'Showing up is the hardest part. Keep the streak alive this week.',
    });
  }

  // ── D. Top exercise progression over the last ~month ──────────────────────
  // For the most-trained exercise, compare best weight in last 28 days vs. 28-56 days ago.
  const setCount = new Map<string, number>();
  for (const s of workingSets) {
    setCount.set(s.exerciseId, (setCount.get(s.exerciseId) ?? 0) + 1);
  }
  let topExerciseId: string | null = null;
  let topCount = 0;
  setCount.forEach((c, id) => {
    if (c > topCount) {
      topCount = c;
      topExerciseId = id;
    }
  });
  if (!context.inReturnGracePeriod && topExerciseId && topCount >= 6) {
    const ex = exercises.find(e => e.id === topExerciseId);
    const exId = topExerciseId;
    if (ex) {
      const recent = workingSets.filter(s => {
        if (s.exerciseId !== exId) return false;
        const d = workoutDateById.get(s.workoutId)!;
        return d >= fourWeeksAgo;
      });
      const prior = workingSets.filter(s => {
        if (s.exerciseId !== exId) return false;
        const d = workoutDateById.get(s.workoutId)!;
        return d >= eightWeeksAgo && d < fourWeeksAgo;
      });
      if (recent.length > 0 && prior.length > 0) {
        const recentMax = Math.max(...recent.map(s => s.weight || 0));
        const priorMax = Math.max(...prior.map(s => s.weight || 0));
        if (priorMax > 0 && recentMax > priorMax * 1.05) {
          const pct = Math.round(((recentMax - priorMax) / priorMax) * 100);
          suggestions.push({
            id: `positive:exercise_progress:${exId}`,
            type: 'insight',
            priority: 68,
            icon: 'arrow-up-circle-outline',
            message: `${ex.name} up ${pct}% over the last month`,
            detail: 'Strength is trending up — your programming is working.',
          });
        }
      }
    }
  }

  return suggestions;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export interface CoachSuggestionsInput {
  workouts: Workout[];
  sets: WorkoutSet[];
  exercises: Exercise[];
  templates: Template[];
  routine: Routine | undefined;
  settings: UserSettings;
  shortfalls: MuscleGroupShortfall[];
}

export async function getTopSuggestions(
  input: CoachSuggestionsInput,
  maxCount: number = 2
): Promise<CoachSuggestion[]> {
  const { workouts, sets, exercises, templates, routine, settings, shortfalls } = input;
  const context = computeCoachContext(workouts);
  const encouragementOnly = settings.coachMode === 'encouragement_only';

  // Generators that lean negative/constructive.
  // - During deload: skip volume/imbalance/missed (not actionable mid-deload).
  // - During the 14-day return-from-break grace window: skip decline/comparison-based
  //   warnings entirely so we don't kick the user when they're rebuilding.
  // - In encouragement_only mode: skip them all.
  const suppressDeclines = encouragementOnly || context.inReturnGracePeriod;
  const negative: CoachSuggestion[] = encouragementOnly
    ? []
    : [
        // Recovery suggestions stay — they're protective/helpful, not criticism.
        ...generateRecoverySuggestions(workouts, sets, exercises, routine, templates),
        ...(suppressDeclines ? [] : generateFatigueSuggestions(workouts, sets, exercises, settings)),
        ...(settings.isOnDeload || suppressDeclines ? [] : generateVolumeGapSuggestions(shortfalls)),
        ...(settings.isOnDeload || suppressDeclines ? [] : generateMissedMuscleGroupSuggestions(workouts, sets, exercises, settings)),
        ...(settings.isOnDeload || suppressDeclines ? [] : generateMuscleImbalanceSuggestions(workouts, sets, exercises, settings)),
      ];
  const positive: CoachSuggestion[] = generatePositiveInsights(workouts, sets, exercises, context);

  // Sort each pool by priority descending
  negative.sort((a, b) => b.priority - a.priority);
  positive.sort((a, b) => b.priority - a.priority);

  // Filter dismissed (apply to each pool)
  const dismissed = await getDismissedSuggestions();
  const dismissedIds = new Set(dismissed.map(d => d.id));
  const dedup = (list: CoachSuggestion[]) => {
    const seen = new Set<string>();
    return list.filter(s => {
      if (seen.has(s.id) || dismissedIds.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  };
  const negFiltered = dedup(negative);
  const posFiltered = dedup(positive);

  // Build the result with tone constraints:
  //   - At most one negative, ever — never pile on.
  //   - Lead with positive when both exist, so criticism is paired with a win.
  //   - In encouragement_only mode, return positives only (no negative cap needed).
  const result: CoachSuggestion[] = [];
  let nIdx = 0, pIdx = 0;
  let negativeUsed = 0;
  while (result.length < maxCount && (nIdx < negFiltered.length || pIdx < posFiltered.length)) {
    const negNext = negFiltered[nIdx];
    const posNext = posFiltered[pIdx];
    // Lead positive when available, then allow at most one negative.
    if (posNext && (result.length === 0 || negativeUsed >= 1 || !negNext)) {
      result.push(posNext); pIdx += 1;
    } else if (negNext && negativeUsed < 1) {
      result.push(negNext); nIdx += 1;
      negativeUsed += 1;
    } else if (posNext) {
      result.push(posNext); pIdx += 1;
    } else {
      break;
    }
  }

  return result;
}
