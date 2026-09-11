/**
 * Detecting workouts that were left open.
 *
 * A session with no set logged for STALE_SESSION_MS is treated as over at its
 * last set, not at whatever time the user eventually taps Finish. Used when
 * finishing, when restoring an active workout on launch, and by migration V14
 * to repair history. The server-side counterpart is close_stale_workouts() in
 * supabase/migrations.
 */

export const STALE_SESSION_MS = 3 * 60 * 60 * 1000;

function lastLoggedAt(sets: ReadonlyArray<{ loggedAt: string }>): string | null {
  let last: string | null = null;
  for (const s of sets) if (!last || s.loggedAt > last) last = s.loggedAt;
  return last;
}

/**
 * The time a session actually ended. If `endedAt` is more than STALE_SESSION_MS
 * after the last set (or after the start, when there are no sets), the session
 * was abandoned and the last set marks its end.
 */
export function effectiveCompletedAt(
  startedAt: string,
  sets: ReadonlyArray<{ loggedAt: string }>,
  endedAt: string,
): string {
  const anchor = lastLoggedAt(sets) ?? startedAt;
  const gap = new Date(endedAt).getTime() - new Date(anchor).getTime();
  return gap > STALE_SESSION_MS ? anchor : endedAt;
}

/** True when an open session has gone quiet for longer than STALE_SESSION_MS. */
export function isStaleSession(
  startedAt: string,
  sets: ReadonlyArray<{ loggedAt: string }>,
  now: Date = new Date(),
): boolean {
  const anchor = lastLoggedAt(sets) ?? startedAt;
  return now.getTime() - new Date(anchor).getTime() > STALE_SESSION_MS;
}
