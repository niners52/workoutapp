/**
 * Deload week wiring: a workout started during the scheduled deload week is
 * flagged without anyone remembering, which is what keeps the excluded-sets
 * path exercised.
 */
import { DEFAULT_HEALTH_TARGETS, DEFAULT_USER_SETTINGS, type UserSettings } from '../../types';
import { isDeloadByDefault } from '../deload';
import { isDeloadWeek } from '../healthDashboard';

const settings = (over: Partial<UserSettings> = {}): UserSettings => ({ ...DEFAULT_USER_SETTINGS, ...over });

// The seeded deload week is 2026-09-21 (a Monday); weeks start Monday.
const insideDeloadWeek = new Date(2026, 8, 23, 17, 0); // Wed Sep 23
const beforeDeloadWeek = new Date(2026, 8, 17, 17, 0); // Thu Sep 17

test('the seeded deload week is the week of Sep 21', () => {
  expect(DEFAULT_HEALTH_TARGETS.deloadWeekStart).toBe('2026-09-21');
  expect(isDeloadWeek('2026-09-21', insideDeloadWeek, 'monday')).toBe(true);
  expect(isDeloadWeek('2026-09-21', beforeDeloadWeek, 'monday')).toBe(false);
});

test('a workout started during the deload week defaults to deload', () => {
  expect(isDeloadByDefault(settings(), insideDeloadWeek)).toBe(true);
});

test('outside that week, and with no week scheduled, it does not', () => {
  expect(isDeloadByDefault(settings(), beforeDeloadWeek)).toBe(false);
  expect(
    isDeloadByDefault(settings({ healthTargets: { ...DEFAULT_HEALTH_TARGETS, deloadWeekStart: null } }), insideDeloadWeek),
  ).toBe(false);
});

test('the manual deload setting still flags workouts on its own', () => {
  expect(isDeloadByDefault(settings({ isOnDeload: true }), beforeDeloadWeek)).toBe(true);
});

test('a Sunday-week user gets the week containing the configured date', () => {
  const sunday = settings({ weekStartDay: 'sunday' });
  expect(isDeloadByDefault(sunday, new Date(2026, 8, 20, 12, 0))).toBe(true); // Sun Sep 20 starts that week
  expect(isDeloadByDefault(sunday, new Date(2026, 8, 19, 12, 0))).toBe(false); // Sat Sep 19 is the week before
});
