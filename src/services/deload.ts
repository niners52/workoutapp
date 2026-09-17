/**
 * Whether a workout started right now should be flagged as a deload.
 *
 * Two independent switches feed this: the manual "on deload" setting, and the
 * deload week scheduled in health targets. A workout started during that week
 * is flagged without anyone remembering to do it, which is what makes the
 * excluded-sets path (skipped_deload_sets) actually exercise itself.
 */
import { DEFAULT_HEALTH_TARGETS, type UserSettings } from '../types';
import { isDeloadWeek } from './healthDashboard';

export interface StartWorkoutOptions {
  /** Explicit choice from the start screen's toggle; overrides the default. */
  isDeload?: boolean;
}

export function isDeloadByDefault(settings: UserSettings | null | undefined, now: Date = new Date()): boolean {
  if (!settings) return false;
  if (settings.isOnDeload) return true;
  const targets = settings.healthTargets ?? DEFAULT_HEALTH_TARGETS;
  return isDeloadWeek(targets.deloadWeekStart, now, settings.weekStartDay);
}
