import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserSettings } from '../types';

const STORAGE_KEY = '@workout_tracker/weekly_planner_notification_id';

// Marker so the notification response listener can identify a tap.
export const WEEKLY_PLANNER_NOTIFICATION_DATA = { kind: 'weekly_planner_reminder' as const };

/**
 * Cancel any previously scheduled weekly planner reminder.
 * Idempotent: safe to call when nothing is scheduled.
 */
export async function cancelWeeklyPlannerReminder(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    if (existing) {
      await Notifications.cancelScheduledNotificationAsync(existing).catch(() => {});
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.log('[weeklyPlannerReminder] cancel failed:', err);
  }
}

/**
 * Apply user settings: schedule (or re-schedule) a weekly recurring notification
 * if enabled, otherwise cancel any existing one.
 *
 * Stores the resulting notification ID so the next call can cancel it cleanly.
 */
export async function syncWeeklyPlannerReminder(settings: UserSettings): Promise<void> {
  // Always cancel first so we never end up with multiple parallel reminders
  await cancelWeeklyPlannerReminder();

  if (!settings.weeklyPlannerReminderEnabled) return;

  // expo-notifications WEEKLY trigger uses 1-7 with 1 = Sunday
  const day = (settings.weeklyPlannerReminderDay ?? 0) % 7; // 0-6
  const weekday = day + 1; // 1-7
  const hour = settings.weeklyPlannerReminderHour ?? 19; // 7pm default
  const minute = settings.weeklyPlannerReminderMinute ?? 0;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Plan your workouts for the week',
        body: 'Open the app to set or review your routine.',
        sound: true,
        data: WEEKLY_PLANNER_NOTIFICATION_DATA,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
      },
    });
    await AsyncStorage.setItem(STORAGE_KEY, id);
  } catch (err) {
    console.log('[weeklyPlannerReminder] schedule failed:', err);
  }
}
