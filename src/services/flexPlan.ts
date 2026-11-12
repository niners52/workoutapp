/**
 * Hand edits to the Flex list: exercises taken off or added on the Flex card.
 * They last for the training week and are ignored once it resets.
 *
 * The Flex plan itself — what is owed, in what order, what fits the time cap,
 * what stands in at another gym — is built by mcp-server/src/shared/weekPlan
 * via rotationWeek.buildFlex, the same code get_week_status runs.
 */
import type { WeekStartDay } from '../types';
import { weekStartFor } from './rotationWeek';

export interface FlexEdits {
  /** Training week these edits belong to (YYYY-MM-DD of its first day). */
  weekStart: string;
  removed: string[];
  added: string[];
}

/** This week's edits, or empty ones if what is stored belongs to another week. */
export function editsForWeek(edits: FlexEdits | null, weekStart: string): FlexEdits {
  return edits && edits.weekStart === weekStart ? edits : { weekStart, removed: [], added: [] };
}

/** Edits for this week, with one exercise removed. Adding it back clears the removal. */
export function withRemoved(edits: FlexEdits | null, weekStart: string, exerciseId: string): FlexEdits {
  const base = editsForWeek(edits, weekStart);
  return {
    weekStart,
    removed: [...new Set([...base.removed, exerciseId])],
    added: base.added.filter(id => id !== exerciseId),
  };
}

export function withAdded(edits: FlexEdits | null, weekStart: string, exerciseId: string): FlexEdits {
  const base = editsForWeek(edits, weekStart);
  return {
    weekStart,
    removed: base.removed.filter(id => id !== exerciseId),
    added: [...new Set([...base.added, exerciseId])],
  };
}

export function flexWeekKey(weekStartDay: WeekStartDay, now: Date = new Date()): string {
  const d = weekStartFor(weekStartDay, now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
