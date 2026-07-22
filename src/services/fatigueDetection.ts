import { subWeeks, format, differenceInDays, subDays, startOfWeek } from 'date-fns';
import {
  Workout,
  WorkoutSet,
  Exercise,
  UserSettings,
} from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExerciseFatigueSignal {
  exerciseId: string;
  exerciseName: string;
  signalType: 'strength_decline' | 'rep_drop';
  severity: number;
  declinePercent: number;
  message: string;
  detail: string;
}

export interface OverallFatigueSignal {
  signalType: 'volume_drop' | 'incomplete_workouts' | 'overtraining';
  severity: number;
  message: string;
  detail: string;
}

export interface FatigueAnalysis {
  exerciseSignals: ExerciseFatigueSignal[];
  overallSignals: OverallFatigueSignal[];
  deloadSuggested: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface ExerciseSession {
  workoutId: string;
  date: Date;
  topWeight: number;
  topSetReps: number;
  totalVolume: number;
  sets: WorkoutSet[];
  locationId?: string; // where the session happened; undefined for legacy workouts
}

function buildWorkoutDateMap(workouts: Workout[]): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const w of workouts) {
    if (w.completedAt) {
      map.set(w.id, new Date(w.completedAt));
    }
  }
  return map;
}

function buildWorkoutLocationMap(workouts: Workout[]): Map<string, string | undefined> {
  return new Map(workouts.map(w => [w.id, w.locationId]));
}

/**
 * Restrict sessions to the location of the most recent (non-travel) session so
 * all trend comparisons are apples-to-apples. Cable stacks at different gyms
 * use different scales — comparing Vasa weights against Planet Fitness weights
 * produced false "down X%" warnings.
 *
 * - Travel/Other sessions are dropped entirely (temporary equipment, no trend value).
 * - The remaining sessions are filtered to the most recent session's location.
 *   Legacy sessions with no recorded location group together (undefined === undefined).
 * - Callers' existing minimum-session checks (>= 4) then apply WITHIN the
 *   location, which implements "not enough history at this gym → no comparison".
 */
function filterToComparableLocation(sessions: ExerciseSession[]): ExerciseSession[] {
  const nonTravel = sessions.filter(s => s.locationId !== 'travel');
  if (nonTravel.length === 0) return [];
  const focusLocation = nonTravel[0].locationId;
  return nonTravel.filter(s => s.locationId === focusLocation);
}

function buildExerciseSessions(
  exerciseId: string,
  allSets: WorkoutSet[],
  workoutDateMap: Map<string, Date>,
  locationByWorkoutId?: Map<string, string | undefined>
): ExerciseSession[] {
  const cutoff = subWeeks(new Date(), 8);

  // Group sets by workoutId for this exercise
  const byWorkout = new Map<string, WorkoutSet[]>();
  for (const set of allSets) {
    if (set.exerciseId !== exerciseId) continue;
    const date = workoutDateMap.get(set.workoutId);
    if (!date || date < cutoff) continue;
    let arr = byWorkout.get(set.workoutId);
    if (!arr) {
      arr = [];
      byWorkout.set(set.workoutId, arr);
    }
    arr.push(set);
  }

  // Convert to sessions
  const sessions: ExerciseSession[] = [];
  for (const [workoutId, sets] of byWorkout) {
    const date = workoutDateMap.get(workoutId)!;
    let topWeight = 0;
    let topSetReps = 0;
    let totalVolume = 0;

    for (const set of sets) {
      totalVolume += set.weight * set.reps;
      if (set.weight > topWeight) {
        topWeight = set.weight;
        topSetReps = set.reps;
      } else if (set.weight === topWeight && set.reps > topSetReps) {
        topSetReps = set.reps;
      }
    }

    sessions.push({
      workoutId,
      date,
      topWeight,
      topSetReps,
      totalVolume,
      sets,
      locationId: locationByWorkoutId?.get(workoutId),
    });
  }

  // Sort by date descending (most recent first)
  sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
  return sessions;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ─── 1. Exercise Strength Trend ──────────────────────────────────────────────

function analyzeExerciseStrengthTrend(
  exerciseName: string,
  exerciseId: string,
  sessions: ExerciseSession[],
  sensitivity: number
): ExerciseFatigueSignal | null {
  if (sessions.length < 4) return null;

  // Recent: sessions 0-1 (last 2)
  const recentWeights = sessions.slice(0, 2).map(s => s.topWeight);
  // Baseline: sessions 2-5 (next 4, or however many are available)
  const baselineWeights = sessions.slice(2, 6).map(s => s.topWeight);

  const recentAvg = avg(recentWeights);
  const baselineAvg = avg(baselineWeights);

  if (baselineAvg === 0) return null;

  const declinePercent = ((baselineAvg - recentAvg) / baselineAvg) * 100;

  if (declinePercent <= sensitivity) return null;

  const rounded = Math.round(declinePercent);
  return {
    exerciseId,
    exerciseName,
    signalType: 'strength_decline',
    severity: Math.min(95, 60 + rounded),
    declinePercent: rounded,
    message: `${exerciseName} down ${rounded}% over last ${sessions.slice(0, 2).length} sessions`,
    detail: `Avg top set: ${Math.round(baselineAvg)} → ${Math.round(recentAvg)} lbs. Consider dropping weight 10-15%.`,
  };
}

// ─── 2. Exercise Rep Trend ───────────────────────────────────────────────────

function analyzeExerciseRepTrend(
  exerciseName: string,
  exerciseId: string,
  sessions: ExerciseSession[],
  sensitivity: number
): ExerciseFatigueSignal | null {
  if (sessions.length < 4) return null;

  // Find working weight: most common weight across recent 4 sessions
  const recentSessions = sessions.slice(0, 4);
  const weightCounts = new Map<number, number>();
  for (const session of recentSessions) {
    for (const set of session.sets) {
      if (set.weight > 0) {
        weightCounts.set(set.weight, (weightCounts.get(set.weight) || 0) + 1);
      }
    }
  }

  if (weightCounts.size === 0) return null;

  // Find the most frequently used weight
  let workingWeight = 0;
  let maxCount = 0;
  for (const [w, count] of weightCounts) {
    if (count > maxCount || (count === maxCount && w > workingWeight)) {
      workingWeight = w;
      maxCount = count;
    }
  }

  if (workingWeight === 0 || maxCount < 3) return null; // Need at least 3 sets at this weight

  // Weight increased → fewer reps is expected progressive overload, not fatigue
  const recentTopWeight = Math.max(...sessions.slice(0, 2).map(s => s.topWeight));
  const baselineTopWeight = Math.max(...sessions.slice(2, 4).map(s => s.topWeight));
  if (recentTopWeight > baselineTopWeight) return null;

  // Get reps at working weight for recent (sessions 0-1) vs baseline (sessions 2-3)
  const getAvgRepsAtWeight = (sessionSlice: ExerciseSession[]): number => {
    const reps: number[] = [];
    for (const session of sessionSlice) {
      for (const set of session.sets) {
        if (set.weight === workingWeight) {
          reps.push(set.reps);
        }
      }
    }
    return avg(reps);
  };

  const recentReps = getAvgRepsAtWeight(sessions.slice(0, 2));
  const baselineReps = getAvgRepsAtWeight(sessions.slice(2, 4));

  if (baselineReps === 0 || recentReps === 0) return null;

  const declinePercent = ((baselineReps - recentReps) / baselineReps) * 100;

  if (declinePercent <= sensitivity) return null;

  const rounded = Math.round(declinePercent);
  return {
    exerciseId,
    exerciseName,
    signalType: 'rep_drop',
    severity: Math.min(90, 55 + rounded),
    declinePercent: rounded,
    message: `${exerciseName}: fewer reps at ${workingWeight} lbs vs 2 weeks ago`,
    detail: `Avg ${baselineReps.toFixed(1)} → ${recentReps.toFixed(1)} reps at ${workingWeight} lbs. Focus on form and recovery.`,
  };
}

// ─── 3. Weekly Volume Trend ──────────────────────────────────────────────────

function analyzeWeeklyVolumeTrend(
  workouts: Workout[],
  sets: WorkoutSet[],
  workoutDateMap: Map<string, Date>,
  settings: UserSettings
): OverallFatigueSignal | null {
  const now = new Date();
  const weekStartsOn = settings.weekStartDay === 'monday' ? 1 : 0;
  const thisWeekStart = startOfWeek(now, { weekStartsOn });
  const dayOfWeek = differenceInDays(now, thisWeekStart); // 0=Mon, 1=Tue, etc.

  // Compare same portion of the week: day 0 through today
  // "This week" = thisWeekStart .. now
  // "Baseline week" = 2 weeks before thisWeekStart .. 2 weeks before now
  const baselineWeekStart = subWeeks(thisWeekStart, 2);
  const baselineWeekEnd = subWeeks(now, 2);

  let recentLoad = 0;
  let baselineLoad = 0;
  let recentWorkouts = 0;
  let baselineWorkouts = 0;

  const countedWorkouts = new Set<string>();

  for (const set of sets) {
    const date = workoutDateMap.get(set.workoutId);
    if (!date) continue;

    const load = set.weight * set.reps;
    if (date >= thisWeekStart && date <= now) {
      recentLoad += load;
      if (!countedWorkouts.has(`r:${set.workoutId}`)) {
        countedWorkouts.add(`r:${set.workoutId}`);
        recentWorkouts++;
      }
    } else if (date >= baselineWeekStart && date <= baselineWeekEnd) {
      baselineLoad += load;
      if (!countedWorkouts.has(`b:${set.workoutId}`)) {
        countedWorkouts.add(`b:${set.workoutId}`);
        baselineWorkouts++;
      }
    }
  }

  if (baselineLoad === 0) return null;

  const declinePercent = ((baselineLoad - recentLoad) / baselineLoad) * 100;

  if (declinePercent <= 15) return null;

  const rounded = Math.round(declinePercent);
  const dayLabel = format(now, 'EEEE'); // e.g. "Wednesday"
  const periodDesc = dayOfWeek === 0
    ? format(thisWeekStart, 'EEE')
    : `${format(thisWeekStart, 'EEE')}–${dayLabel}`;

  return {
    signalType: 'volume_drop',
    severity: Math.min(90, 65 + Math.round((rounded - 15) * 2)),
    message: `Volume down ${rounded}% this ${periodDesc} vs 2 weeks ago`,
    detail: `${Math.round(recentLoad).toLocaleString()} lbs (${recentWorkouts} workouts) vs ${Math.round(baselineLoad).toLocaleString()} lbs (${baselineWorkouts} workouts) same period.`,
  };
}

// ─── 4. Workout Completion Rate ──────────────────────────────────────────────

function analyzeWorkoutCompletionRate(
  workouts: Workout[]
): OverallFatigueSignal | null {
  // Get last 5 completed workouts with templates
  const templatedWorkouts = workouts
    .filter(w => w.completedAt && w.templateId)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
    .slice(0, 5);

  if (templatedWorkouts.length < 5) return null;

  const incompleteCount = templatedWorkouts.filter(
    w => w.skippedExerciseIds && w.skippedExerciseIds.length > 0
  ).length;

  if (incompleteCount < 3) return null;

  return {
    signalType: 'incomplete_workouts',
    severity: Math.min(85, 60 + incompleteCount * 5),
    message: `You've cut ${incompleteCount} of your last 5 workouts short`,
    detail: 'Consistently cutting workouts short may indicate fatigue. Consider a deload week.',
  };
}

// ─── 5. Rest Day Pattern ─────────────────────────────────────────────────────

function analyzeRestDayPattern(
  workouts: Workout[]
): OverallFatigueSignal | null {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // Build set of training dates in last 14 days
  const trainingDates = new Set<string>();
  for (const w of workouts) {
    if (!w.completedAt) continue;
    const dateStr = format(new Date(w.completedAt), 'yyyy-MM-dd');
    trainingDates.add(dateStr);
  }

  // Find longest consecutive streak ending at today or yesterday
  let maxConsecutive = 0;

  // Check streak ending today
  let consecutive = 0;
  for (let i = 0; i < 14; i++) {
    const dateStr = format(subDays(today, i), 'yyyy-MM-dd');
    if (trainingDates.has(dateStr)) {
      consecutive++;
    } else {
      break;
    }
  }
  maxConsecutive = consecutive;

  if (maxConsecutive < 7) return null;

  return {
    signalType: 'overtraining',
    severity: Math.min(95, 75 + (maxConsecutive - 7) * 3),
    message: `You've trained ${maxConsecutive} days straight without a rest day`,
    detail: 'Rest is when muscles grow. Take a day off.',
  };
}

// ─── Main Entry Points ───────────────────────────────────────────────────────

export function analyzeFatigue(
  workouts: Workout[],
  sets: WorkoutSet[],
  exercises: Exercise[],
  settings: UserSettings
): FatigueAnalysis {
  const sensitivity = settings.fatigueSensitivity ?? 10;
  const workoutDateMap = buildWorkoutDateMap(workouts);
  const locationMap = buildWorkoutLocationMap(workouts);

  // Only analyze exercises done in the last 2 weeks (avoids flagging swapped/abandoned exercises)
  const recentCutoff = subWeeks(new Date(), 2);
  const recentExerciseIds = new Set<string>();
  for (const set of sets) {
    const date = workoutDateMap.get(set.workoutId);
    if (date && date >= recentCutoff) {
      recentExerciseIds.add(set.exerciseId);
    }
  }

  const exerciseMap = new Map(exercises.map(e => [e.id, e]));

  // Per-exercise analysis — trends compared within a single location only
  const exerciseSignals: ExerciseFatigueSignal[] = [];
  for (const exerciseId of recentExerciseIds) {
    const exercise = exerciseMap.get(exerciseId);
    if (!exercise) continue;

    const sessions = filterToComparableLocation(
      buildExerciseSessions(exerciseId, sets, workoutDateMap, locationMap)
    );
    if (sessions.length < 4) continue;

    const strengthSignal = analyzeExerciseStrengthTrend(
      exercise.name, exerciseId, sessions, sensitivity
    );
    if (strengthSignal) exerciseSignals.push(strengthSignal);

    const repSignal = analyzeExerciseRepTrend(
      exercise.name, exerciseId, sessions, sensitivity
    );
    if (repSignal) exerciseSignals.push(repSignal);
  }

  // Sort by severity descending
  exerciseSignals.sort((a, b) => b.severity - a.severity);

  // Overall analysis
  const overallSignals: OverallFatigueSignal[] = [];

  const volumeSignal = analyzeWeeklyVolumeTrend(workouts, sets, workoutDateMap, settings);
  if (volumeSignal) overallSignals.push(volumeSignal);

  const completionSignal = analyzeWorkoutCompletionRate(workouts);
  if (completionSignal) overallSignals.push(completionSignal);

  const restSignal = analyzeRestDayPattern(workouts);
  if (restSignal) overallSignals.push(restSignal);

  overallSignals.sort((a, b) => b.severity - a.severity);

  // Determine if deload is suggested
  const deloadSuggested =
    exerciseSignals.length >= 2 ||
    overallSignals.some(s => s.severity >= 70);

  return { exerciseSignals, overallSignals, deloadSuggested };
}

export function getExerciseFatigueWarnings(
  exerciseIds: string[],
  workouts: Workout[],
  sets: WorkoutSet[],
  exercises: Exercise[],
  settings: UserSettings
): Map<string, ExerciseFatigueSignal> {
  const result = new Map<string, ExerciseFatigueSignal>();

  if (settings.fatigueDetectionEnabled === false || settings.isOnDeload) {
    return result;
  }

  const sensitivity = settings.fatigueSensitivity ?? 10;
  const workoutDateMap = buildWorkoutDateMap(workouts);
  const locationMap = buildWorkoutLocationMap(workouts);
  const exerciseMap = new Map(exercises.map(e => [e.id, e]));

  for (const exerciseId of exerciseIds) {
    const exercise = exerciseMap.get(exerciseId);
    if (!exercise) continue;

    const sessions = filterToComparableLocation(
      buildExerciseSessions(exerciseId, sets, workoutDateMap, locationMap)
    );
    if (sessions.length < 4) continue;

    // Pick the highest severity signal
    const signals: ExerciseFatigueSignal[] = [];

    const strengthSignal = analyzeExerciseStrengthTrend(
      exercise.name, exerciseId, sessions, sensitivity
    );
    if (strengthSignal) signals.push(strengthSignal);

    const repSignal = analyzeExerciseRepTrend(
      exercise.name, exerciseId, sessions, sensitivity
    );
    if (repSignal) signals.push(repSignal);

    if (signals.length > 0) {
      signals.sort((a, b) => b.severity - a.severity);
      result.set(exerciseId, signals[0]);
    }
  }

  return result;
}
