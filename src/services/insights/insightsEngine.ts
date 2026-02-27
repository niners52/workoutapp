/**
 * Insights Engine — Orchestrator
 *
 * Collects data, runs all analyzers, filters by minimum data requirements,
 * sorts by priority, and caches results.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { differenceInWeeks } from 'date-fns';
import { Insight, InsightsInput, InsightsCache, MonthlyReport, MonthlyReportCache } from './types';
import { analyzeBodyComposition, analyzeStrengthToSize } from './bodyAnalyzers';
import { analyzeNutritionImpact } from './nutritionAnalyzers';
import { analyzePhaseRecommendation, analyzeTrendPredictions, analyzeSmartAlerts } from './trendAnalyzers';
import { generateMonthlyReportData } from './monthlyReport';
import { CoachSuggestion } from '../coachSuggestions';

// ─── Cache Config ──────────────────────────────────────────────────────────

const INSIGHTS_CACHE_KEY = '@workout_tracker/insights_cache';
const MONTHLY_REPORT_CACHE_KEY = '@workout_tracker/monthly_report_cache';
const INSIGHTS_CACHE_TTL = 6 * 60 * 60 * 1000;        // 6 hours
const MONTHLY_REPORT_CACHE_TTL = 24 * 60 * 60 * 1000;  // 24 hours

// ─── Data Sufficiency Check ────────────────────────────────────────────────

function getWeeksOfData(workouts: { completedAt?: string | null }[]): number {
  const completed = workouts.filter(w => w.completedAt);
  if (completed.length === 0) return 0;

  const dates = completed.map(w => new Date(w.completedAt!));
  const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
  return differenceInWeeks(new Date(), earliest);
}

// ─── Generate Insights ─────────────────────────────────────────────────────

export async function generateInsights(input: InsightsInput): Promise<Insight[]> {
  const weeksOfData = getWeeksOfData(input.workouts);
  const now = new Date().toISOString();

  // Run all analyzers in parallel
  const [
    bodyComp,
    strengthSize,
    nutritionImpact,
    phaseRec,
    trendPredictions,
    smartAlerts,
  ] = await Promise.all([
    safeRun(() => analyzeBodyComposition(input)),
    safeRun(() => analyzeStrengthToSize(input)),
    safeRun(() => analyzeNutritionImpact(input)),
    safeRun(() => analyzePhaseRecommendation(input)),
    safeRun(() => analyzeTrendPredictions(input)),
    safeRun(() => analyzeSmartAlerts(input)),
  ]);

  // Combine all insights
  const all: Insight[] = [
    ...bodyComp,
    ...strengthSize,
    ...nutritionImpact,
    ...phaseRec,
    ...trendPredictions,
    ...smartAlerts,
  ];

  // Filter by minimum data requirement
  const filtered = all.filter(insight => weeksOfData >= insight.minDataWeeks);

  // Sort by priority score descending
  filtered.sort((a, b) => b.priorityScore - a.priorityScore);

  // Stamp generation time
  for (const insight of filtered) {
    insight.generatedAt = now;
  }

  // Cache
  const cache: InsightsCache = { insights: filtered, generatedAt: Date.now() };
  await AsyncStorage.setItem(INSIGHTS_CACHE_KEY, JSON.stringify(cache)).catch(() => {});

  return filtered;
}

// ─── Cached Access ─────────────────────────────────────────────────────────

export async function getCachedInsights(input: InsightsInput): Promise<Insight[]> {
  try {
    const raw = await AsyncStorage.getItem(INSIGHTS_CACHE_KEY);
    if (raw) {
      const cache: InsightsCache = JSON.parse(raw);
      if (Date.now() - cache.generatedAt < INSIGHTS_CACHE_TTL) {
        return cache.insights;
      }
    }
  } catch {
    // Cache miss — regenerate
  }

  return generateInsights(input);
}

// ─── Monthly Report ────────────────────────────────────────────────────────

export async function generateMonthlyReport(
  input: InsightsInput,
  month: string
): Promise<MonthlyReport> {
  const report = await generateMonthlyReportData(input, month);

  const cache: MonthlyReportCache = { report, generatedAt: Date.now() };
  const cacheKey = `${MONTHLY_REPORT_CACHE_KEY}_${month}`;
  await AsyncStorage.setItem(cacheKey, JSON.stringify(cache)).catch(() => {});

  return report;
}

export async function getCachedMonthlyReport(
  input: InsightsInput,
  month: string
): Promise<MonthlyReport | null> {
  try {
    const cacheKey = `${MONTHLY_REPORT_CACHE_KEY}_${month}`;
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const cache: MonthlyReportCache = JSON.parse(raw);
      if (Date.now() - cache.generatedAt < MONTHLY_REPORT_CACHE_TTL) {
        return cache.report;
      }
    }
  } catch {
    // Cache miss
  }

  return generateMonthlyReport(input, month);
}

// ─── Bridge to Coach System ────────────────────────────────────────────────

export function insightToCoachSuggestion(insight: Insight): CoachSuggestion {
  return {
    id: `insight:${insight.id}`,
    type: 'insight',
    priority: insight.priorityScore,
    icon: insight.icon,
    message: insight.title,
    detail: insight.detail,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function safeRun(fn: () => Insight[] | Promise<Insight[]>): Promise<Insight[]> {
  try {
    return await fn();
  } catch (error) {
    console.error('[Insights] Analyzer error:', error);
    return [];
  }
}
