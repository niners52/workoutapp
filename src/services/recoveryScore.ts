import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, subDays } from 'date-fns';
import { Workout, WorkoutSet } from '../types';
import { getHRVHistory, getRestingHeartRateHistory } from './healthKit';

// Storage keys
const BASELINES_KEY = '@workout_tracker/health_baselines';
const BASELINES_LAST_CALCULATED_KEY = '@workout_tracker/baselines_last_calculated';
const RECOVERY_CACHE_KEY = '@workout_tracker/recovery_cache';

// ============== TYPES ==============

export interface HealthInputs {
  hrv: number | null;           // in ms
  hrvBaseline: number | null;   // user's 30-day average HRV
  restingHR: number | null;     // in bpm
  rhrBaseline: number | null;   // user's 30-day average RHR
  sleepHours: number | null;    // last night
  sleepTarget: number;          // user's target (default 7-8)
  trainingLoadYesterday: number; // total sets from yesterday
  trainingLoadAverage: number;  // average daily sets over past week
}

export interface FactorScore {
  score: number;
  status: string;
  detail: string;
}

export interface RecoveryResult {
  score: number;              // 0-100
  status: 'recovered' | 'moderate' | 'strained';
  factors: {
    hrv: FactorScore | null;
    rhr: FactorScore | null;
    sleep: FactorScore | null;
    training: FactorScore | null;
  };
  recommendation: string;
}

export interface Baselines {
  hrvBaseline: number | null;
  rhrBaseline: number | null;
  lastCalculated: string | null;
}

// ============== BASELINE CALCULATION ==============

export async function getStoredBaselines(): Promise<Baselines> {
  try {
    const stored = await AsyncStorage.getItem(BASELINES_KEY);
    const lastCalculated = await AsyncStorage.getItem(BASELINES_LAST_CALCULATED_KEY);

    if (stored) {
      const baselines = JSON.parse(stored);
      return {
        ...baselines,
        lastCalculated,
      };
    }
  } catch (e) {
    console.log('Error getting baselines:', e);
  }

  return {
    hrvBaseline: null,
    rhrBaseline: null,
    lastCalculated: null,
  };
}

export async function calculateBaselines(): Promise<{
  hrvBaseline: number | null;
  rhrBaseline: number | null;
}> {
  // Get last 30 days of HRV and RHR data
  const [hrvHistory, rhrHistory] = await Promise.all([
    getHRVHistory(30),
    getRestingHeartRateHistory(30),
  ]);

  let hrvBaseline: number | null = null;
  let rhrBaseline: number | null = null;

  // Calculate HRV baseline (excluding outliers)
  if (hrvHistory.length >= 5) {
    const values = hrvHistory.map(h => h.value);
    hrvBaseline = calculateBaselineWithOutlierRemoval(values);
  }

  // Calculate RHR baseline (excluding outliers)
  if (rhrHistory.length >= 5) {
    const values = rhrHistory.map(h => h.value);
    rhrBaseline = calculateBaselineWithOutlierRemoval(values);
  }

  // Store baselines
  const baselines = { hrvBaseline, rhrBaseline };
  try {
    await AsyncStorage.setItem(BASELINES_KEY, JSON.stringify(baselines));
    await AsyncStorage.setItem(BASELINES_LAST_CALCULATED_KEY, new Date().toISOString());
  } catch (e) {
    console.log('Error storing baselines:', e);
  }

  return baselines;
}

// Calculate average excluding values more than 2 standard deviations from mean
function calculateBaselineWithOutlierRemoval(values: number[]): number {
  if (values.length === 0) return 0;

  // First pass: calculate mean and std dev
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  // Second pass: filter outliers (> 2 std dev from mean)
  const filtered = values.filter(v => Math.abs(v - mean) <= 2 * stdDev);

  // Calculate final average
  if (filtered.length === 0) return mean;
  return Math.round((filtered.reduce((a, b) => a + b, 0) / filtered.length) * 10) / 10;
}

// Check if baselines need recalculation (weekly)
export async function shouldRecalculateBaselines(): Promise<boolean> {
  const baselines = await getStoredBaselines();

  if (!baselines.lastCalculated) {
    return true;
  }

  const lastCalc = new Date(baselines.lastCalculated);
  const daysSinceCalc = Math.floor((Date.now() - lastCalc.getTime()) / (1000 * 60 * 60 * 24));

  return daysSinceCalc >= 7; // Recalculate weekly
}

// ============== TRAINING LOAD CALCULATION ==============

export function getTrainingLoad(
  workouts: Workout[],
  sets: WorkoutSet[],
  date: Date
): number {
  const dateStr = format(date, 'yyyy-MM-dd');

  // Find workouts from the given date
  const dayWorkouts = workouts.filter(w => {
    const workoutDate = w.completedAt ? format(new Date(w.completedAt), 'yyyy-MM-dd') : null;
    return workoutDate === dateStr;
  });

  if (dayWorkouts.length === 0) {
    return 0;
  }

  // Sum total sets from those workouts
  const workoutIds = new Set(dayWorkouts.map(w => w.id));
  const daySets = sets.filter(s => workoutIds.has(s.workoutId));

  return daySets.length;
}

export function getAverageTrainingLoad(
  workouts: Workout[],
  sets: WorkoutSet[],
  days: number
): number {
  let totalSets = 0;
  const today = new Date();

  for (let i = 1; i <= days; i++) {
    const date = subDays(today, i);
    totalSets += getTrainingLoad(workouts, sets, date);
  }

  return Math.round((totalSets / days) * 10) / 10;
}

// ============== RECOVERY SCORE CALCULATION ==============

export function calculateRecoveryScore(inputs: HealthInputs): RecoveryResult {
  const factors: RecoveryResult['factors'] = {
    hrv: null,
    rhr: null,
    sleep: null,
    training: null,
  };

  // Track available factors for weight redistribution
  const availableFactors: { key: keyof RecoveryResult['factors']; weight: number; score: number }[] = [];

  // Base weights
  const weights = {
    hrv: 0.35,
    sleep: 0.30,
    rhr: 0.20,
    training: 0.15,
  };

  // HRV Score (higher is better, compare to personal baseline)
  if (inputs.hrv !== null && inputs.hrvBaseline !== null && inputs.hrvBaseline > 0) {
    const percentFromBaseline = ((inputs.hrv - inputs.hrvBaseline) / inputs.hrvBaseline) * 100;

    let score: number;
    let status: string;
    let detail: string;

    if (percentFromBaseline >= 10) {
      score = 100;
      status = 'Excellent';
      detail = `${Math.round(percentFromBaseline)}% above baseline`;
    } else if (percentFromBaseline >= 0) {
      score = 70 + (percentFromBaseline * 3); // 70-100 range
      status = 'Good';
      detail = 'At or above baseline';
    } else if (percentFromBaseline >= -10) {
      score = 40 + ((10 + percentFromBaseline) * 3); // 40-70 range
      status = 'Below average';
      detail = `${Math.round(Math.abs(percentFromBaseline))}% below baseline`;
    } else {
      score = Math.max(10, 40 + (percentFromBaseline * 1.5)); // 10-40 range
      status = 'Low';
      detail = `${Math.round(Math.abs(percentFromBaseline))}% below baseline`;
    }

    factors.hrv = { score: Math.round(score), status, detail };
    availableFactors.push({ key: 'hrv', weight: weights.hrv, score });
  }

  // RHR Score (lower is better, compare to personal baseline)
  if (inputs.restingHR !== null && inputs.rhrBaseline !== null && inputs.rhrBaseline > 0) {
    const diffFromBaseline = inputs.restingHR - inputs.rhrBaseline;

    let score: number;
    let status: string;
    let detail: string;

    if (diffFromBaseline <= -5) {
      score = 100;
      status = 'Excellent';
      detail = `${Math.round(Math.abs(diffFromBaseline))} bpm below baseline`;
    } else if (diffFromBaseline <= 0) {
      score = 70 + (Math.abs(diffFromBaseline) * 6); // 70-100 range
      status = 'Good';
      detail = 'At or below baseline';
    } else if (diffFromBaseline <= 5) {
      score = 40 + ((5 - diffFromBaseline) * 6); // 40-70 range
      status = 'Elevated';
      detail = `${Math.round(diffFromBaseline)} bpm above baseline`;
    } else {
      score = Math.max(10, 40 - (diffFromBaseline - 5) * 3); // 10-40 range
      status = 'High';
      detail = `${Math.round(diffFromBaseline)} bpm above baseline`;
    }

    factors.rhr = { score: Math.round(score), status, detail };
    availableFactors.push({ key: 'rhr', weight: weights.rhr, score });
  }

  // Sleep Score
  if (inputs.sleepHours !== null) {
    let score: number;
    let status: string;
    let detail: string;

    if (inputs.sleepHours >= 8) {
      score = 100;
      status = 'Excellent';
      detail = `${inputs.sleepHours.toFixed(1)} hours`;
    } else if (inputs.sleepHours >= 7) {
      score = 80;
      status = 'Good';
      detail = `${inputs.sleepHours.toFixed(1)} hours`;
    } else if (inputs.sleepHours >= 6) {
      score = 60;
      status = 'Fair';
      detail = `${inputs.sleepHours.toFixed(1)} hours - below target`;
    } else if (inputs.sleepHours >= 5) {
      score = 40;
      status = 'Low';
      detail = `Only ${inputs.sleepHours.toFixed(1)} hours`;
    } else {
      score = 20;
      status = 'Very low';
      detail = `Only ${inputs.sleepHours.toFixed(1)} hours`;
    }

    factors.sleep = { score, status, detail };
    availableFactors.push({ key: 'sleep', weight: weights.sleep, score });
  }

  // Training Load Score (was yesterday a rest day or heavy?)
  // Rest day or light = 100, moderate = 70, heavy (>130% of average) = 40
  const trainingLoadRatio = inputs.trainingLoadAverage > 0
    ? inputs.trainingLoadYesterday / inputs.trainingLoadAverage
    : inputs.trainingLoadYesterday > 0 ? 1.5 : 0; // Default to heavy if no baseline

  let trainingScore: number;
  let trainingStatus: string;
  let trainingDetail: string;

  if (inputs.trainingLoadYesterday === 0) {
    trainingScore = 100;
    trainingStatus = 'Rest day';
    trainingDetail = 'No training yesterday';
  } else if (trainingLoadRatio <= 0.5) {
    trainingScore = 90;
    trainingStatus = 'Light';
    trainingDetail = `${inputs.trainingLoadYesterday} sets (light day)`;
  } else if (trainingLoadRatio <= 1.0) {
    trainingScore = 70;
    trainingStatus = 'Moderate';
    trainingDetail = `${inputs.trainingLoadYesterday} sets (average)`;
  } else if (trainingLoadRatio <= 1.3) {
    trainingScore = 50;
    trainingStatus = 'Heavy';
    trainingDetail = `${inputs.trainingLoadYesterday} sets (above average)`;
  } else {
    trainingScore = 40;
    trainingStatus = 'Very heavy';
    trainingDetail = `${inputs.trainingLoadYesterday} sets (${Math.round(trainingLoadRatio * 100)}% of average)`;
  }

  factors.training = { score: trainingScore, status: trainingStatus, detail: trainingDetail };
  availableFactors.push({ key: 'training', weight: weights.training, score: trainingScore });

  // Calculate weighted score, redistributing missing factor weights
  let totalWeight = availableFactors.reduce((sum, f) => sum + f.weight, 0);
  let weightedSum = availableFactors.reduce((sum, f) => sum + (f.score * f.weight), 0);

  // Normalize to account for missing factors
  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

  // Determine status
  let status: 'recovered' | 'moderate' | 'strained';
  if (overallScore >= 70) {
    status = 'recovered';
  } else if (overallScore >= 40) {
    status = 'moderate';
  } else {
    status = 'strained';
  }

  // Generate recommendation
  const recommendation = getRecoveryRecommendation(overallScore, factors);

  return {
    score: overallScore,
    status,
    factors,
    recommendation,
  };
}

export function getRecoveryRecommendation(
  score: number,
  factors: RecoveryResult['factors']
): string {
  // Base recommendation based on score
  let baseRec: string;

  if (score >= 85) {
    baseRec = "You're well recovered. Great day for a challenging workout!";
  } else if (score >= 70) {
    baseRec = "Recovery looks good. Train as planned.";
  } else if (score >= 50) {
    baseRec = "Moderate recovery. Consider reducing intensity or volume today.";
  } else if (score >= 30) {
    baseRec = "Recovery is low. Light activity or active rest recommended.";
  } else {
    baseRec = "Your body needs rest. Consider taking the day off.";
  }

  // Add specific factor callouts
  const callouts: string[] = [];

  if (factors.hrv && factors.hrv.score < 50) {
    callouts.push("Your HRV is below baseline - stress or fatigue may be elevated.");
  }

  if (factors.sleep && factors.sleep.score < 50) {
    callouts.push("Sleep was short last night. Prioritize rest tonight.");
  }

  if (factors.rhr && factors.rhr.score < 50) {
    callouts.push("Elevated resting heart rate may indicate incomplete recovery.");
  }

  if (factors.training && factors.training.score < 50) {
    callouts.push("Yesterday's training was heavy. Your muscles may need more recovery time.");
  }

  if (callouts.length > 0) {
    return baseRec + " " + callouts[0]; // Only include most relevant callout
  }

  return baseRec;
}

// ============== CACHING ==============

export interface RecoveryCache {
  result: RecoveryResult;
  timestamp: string;
}

export async function getCachedRecovery(): Promise<RecoveryCache | null> {
  try {
    const cached = await AsyncStorage.getItem(RECOVERY_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as RecoveryCache;
      const cacheAge = Date.now() - new Date(data.timestamp).getTime();
      const oneHour = 60 * 60 * 1000;

      if (cacheAge < oneHour) {
        return data;
      }
    }
  } catch (e) {
    console.log('Error getting cached recovery:', e);
  }
  return null;
}

export async function setCachedRecovery(result: RecoveryResult): Promise<void> {
  try {
    const cache: RecoveryCache = {
      result,
      timestamp: new Date().toISOString(),
    };
    await AsyncStorage.setItem(RECOVERY_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.log('Error caching recovery:', e);
  }
}

export async function clearRecoveryCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECOVERY_CACHE_KEY);
  } catch (e) {
    console.log('Error clearing recovery cache:', e);
  }
}
