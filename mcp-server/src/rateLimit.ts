/**
 * Fixed-window, in-memory rate limiter keyed by client IP. Enough for a
 * single-user service on one Railway instance; swap for a shared store if the
 * service ever scales horizontally.
 */

export interface RateLimiter {
  /** Returns true when the request is allowed. */
  allow(key: string, now?: number): boolean;
}

export function createRateLimiter(maxPerMinute: number): RateLimiter {
  const windows = new Map<string, { windowStart: number; count: number }>();
  const WINDOW_MS = 60_000;

  return {
    allow(key, now = Date.now()) {
      const entry = windows.get(key);
      if (!entry || now - entry.windowStart >= WINDOW_MS) {
        windows.set(key, { windowStart: now, count: 1 });
        // Opportunistic cleanup so the map can't grow unbounded.
        if (windows.size > 10_000) {
          for (const [k, v] of windows) if (now - v.windowStart >= WINDOW_MS) windows.delete(k);
        }
        return true;
      }
      entry.count += 1;
      return entry.count <= maxPerMinute;
    },
  };
}
