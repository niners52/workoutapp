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
  | 'fatigue';

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
  ['front_delts', 'rear_delts'],
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

  // Get completed workouts this week
  const thisWeekWorkouts = workouts.filter(w => {
    if (!w.completedAt) return false;
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

  // Build map: muscle group -> most recent date trained
  const lastTrained = new Map<PrimaryMuscleGroup, Date>();

  const completedWorkouts = workouts.filter(w => w.completedAt);
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
    if (!w.completedAt) continue;
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

  // Generate all suggestions
  // During deload, skip volume/imbalance/missed suggestions — they aren't actionable
  const all: CoachSuggestion[] = [
    ...generateRecoverySuggestions(workouts, sets, exercises, routine, templates),
    ...generateFatigueSuggestions(workouts, sets, exercises, settings),
    ...(settings.isOnDeload ? [] : generateVolumeGapSuggestions(shortfalls)),
    ...(settings.isOnDeload ? [] : generateMissedMuscleGroupSuggestions(workouts, sets, exercises, settings)),
    ...(settings.isOnDeload ? [] : generateMuscleImbalanceSuggestions(workouts, sets, exercises, settings)),
  ];

  // Sort by priority descending
  all.sort((a, b) => b.priority - a.priority);

  // Deduplicate by id (keep highest priority)
  const seen = new Set<string>();
  const unique = all.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  // Filter dismissed
  const dismissed = await getDismissedSuggestions();
  const dismissedIds = new Set(dismissed.map(d => d.id));
  const filtered = unique.filter(s => !dismissedIds.has(s.id));

  return filtered.slice(0, maxCount);
}
