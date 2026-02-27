/**
 * Holistic Fitness Insights — Type definitions
 */

import {
  Exercise,
  WorkoutSet,
  Workout,
  BodyMeasurement,
  UserSettings,
} from '../../types';

// ─── Insight Categories & Priority ─────────────────────────────────────────

export type InsightCategory =
  | 'body_composition'
  | 'strength_size'
  | 'nutrition_impact'
  | 'phase_recommendation'
  | 'trend_prediction'
  | 'monthly_report'
  | 'smart_alert';

export type InsightPriority = 'high' | 'medium' | 'low';

// ─── Core Insight Type ─────────────────────────────────────────────────────

export interface Insight {
  id: string;
  category: InsightCategory;
  priority: InsightPriority;
  priorityScore: number;        // 0-100 for sorting
  icon: string;                 // Ionicons name
  title: string;                // Short headline
  detail: string;               // 1-2 sentence explanation
  data?: Record<string, any>;   // Optional structured data for rich rendering
  generatedAt: string;          // ISO timestamp
  minDataWeeks: number;         // Minimum weeks of data needed
}

// ─── Monthly Report ────────────────────────────────────────────────────────

export interface MonthlyReport {
  month: string;                // 'YYYY-MM'
  generatedAt: string;
  trainingScore: number;        // 0-100
  nutritionScore: number;       // 0-100
  consistencyScore: number;     // 0-100
  overallGrade: string;         // A-F
  highlights: string[];         // Top 3 achievements
  areasToImprove: string[];     // Top 3 opportunities
  strengthChanges: { muscle: string; from: string; to: string }[];
  bodyChanges: { metric: string; change: string; direction: 'up' | 'down' }[];
  prsCount: number;
  workoutsCompleted: number;
  perfectDays: number;
}

// ─── Input for Insight Generation ──────────────────────────────────────────

export interface InsightsInput {
  exercises: Exercise[];
  sets: WorkoutSet[];
  workouts: Workout[];
  bodyMeasurements: BodyMeasurement[];
  userSettings: UserSettings;
  bodyWeightLbs: number | null;
  nutritionHistory: Map<string, { calories: number; protein: number }>;
  sleepHistory: Map<string, number>;  // date -> hours
}

// ─── Cache ─────────────────────────────────────────────────────────────────

export interface InsightsCache {
  insights: Insight[];
  generatedAt: number;  // Date.now()
}

export interface MonthlyReportCache {
  report: MonthlyReport;
  generatedAt: number;
}
