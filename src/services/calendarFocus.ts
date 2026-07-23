/**
 * Tiny handoff channel: lets any screen ask the (tab-embedded) Calendar to
 * open focused on a specific date. Navigation params can't reach it cleanly
 * because CalendarScreen renders inside the Progress tab, not as a pushed
 * route — so the requester stores a date here, navigates to the tab, and
 * CalendarScreen consumes it on focus.
 */

let pendingDate: string | null = null; // 'yyyy-MM-dd'

export function requestCalendarFocus(dateStr: string): void {
  pendingDate = dateStr;
}

/** Returns the pending date once, then clears it. */
export function consumeCalendarFocus(): string | null {
  const d = pendingDate;
  pendingDate = null;
  return d;
}
