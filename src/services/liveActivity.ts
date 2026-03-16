import { Platform, NativeModules } from 'react-native';
import * as LiveActivity from 'expo-live-activity';

// App colors for Live Activity styling
const COLORS = {
  background: '#0A1628',    // Navy background
  accent: '#FFC52F',        // Gold accent
  text: '#FFFFFF',          // White text
  subtitleText: '#A0AEC0',  // Muted text for subtitle
};

// Current activity ID for tracking
let currentActivityId: string | null = null;

/**
 * Call the native LiveActivityModule to end ALL activities (tracked + orphaned).
 * This is the nuclear option — cleans up everything on the native side.
 */
async function nativeEndAllActivities(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const module = NativeModules.LiveActivityModule;
    if (module?.stopRestTimer) {
      await module.stopRestTimer();
    }
  } catch (error) {
    console.log('Native endAllActivities failed (non-fatal):', error);
  }
}

// Live Activity service for iOS rest timer
// Falls back gracefully on unsupported platforms
export const liveActivityService = {
  /**
   * Check if Live Activities are supported on this device
   * iOS 16.1+ with iPhone 14 Pro+ for Dynamic Island, iOS 16.2+ for all devices
   */
  async isSupported(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }

    // expo-live-activity handles the iOS version check internally
    // Try to start and immediately stop an activity to verify support
    // For now, just check platform since the package handles availability
    try {
      return true; // Let the startActivity fail gracefully if unsupported
    } catch (error) {
      console.log('Live Activities not available:', error);
      return false;
    }
  },

  /**
   * Start a rest timer Live Activity
   * @param seconds - Duration of the timer in seconds
   * @returns Activity ID if successful, null otherwise
   */
  async startTimer(seconds: number): Promise<string | null> {
    if (Platform.OS !== 'ios') {
      return null;
    }

    try {
      // End any existing activity first
      await this.endAllActivities();

      // Calculate end time in milliseconds for countdown
      const endTimeMs = Date.now() + seconds * 1000;

      const state: LiveActivity.LiveActivityState = {
        title: 'Rest Timer',
        subtitle: 'Time remaining',
        progressBar: {
          date: endTimeMs,
        },
      };

      const config: LiveActivity.LiveActivityConfig = {
        backgroundColor: COLORS.background,
        titleColor: COLORS.text,
        subtitleColor: COLORS.subtitleText,
        progressViewTint: COLORS.accent,
        progressViewLabelColor: COLORS.text,
        timerType: 'circular',
      };

      const activityId = LiveActivity.startActivity(state, config);
      if (activityId) {
        currentActivityId = activityId;
        return activityId;
      }
      return null;
    } catch (error) {
      console.log('Failed to start Live Activity:', error);
      return null;
    }
  },

  /**
   * Update the timer (useful when returning from background)
   * @param remainingSeconds - New remaining time
   */
  async updateTimer(remainingSeconds: number): Promise<boolean> {
    if (Platform.OS !== 'ios' || !currentActivityId) {
      return false;
    }

    try {
      // Calculate new end time
      const endTimeMs = Date.now() + remainingSeconds * 1000;

      const state: LiveActivity.LiveActivityState = {
        title: 'Rest Timer',
        subtitle: 'Time remaining',
        progressBar: {
          date: endTimeMs,
        },
      };

      LiveActivity.updateActivity(currentActivityId, state);
      return true;
    } catch (error) {
      console.log('Failed to update Live Activity:', error);
      return false;
    }
  },

  /**
   * Stop/cancel the timer Live Activity immediately.
   * Tries the tracked ID first, then falls back to native cleanup.
   */
  async stopTimer(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }

    try {
      if (currentActivityId) {
        const state: LiveActivity.LiveActivityState = {
          title: 'Rest Timer',
          subtitle: 'Cancelled',
          progressBar: {
            progress: 0,
          },
        };
        LiveActivity.stopActivity(currentActivityId, state);
        currentActivityId = null;
      }
      // Always call native cleanup to catch orphaned activities
      await nativeEndAllActivities();
      return true;
    } catch (error) {
      console.log('Failed to stop Live Activity:', error);
      currentActivityId = null;
      await nativeEndAllActivities();
      return false;
    }
  },

  /**
   * End the timer with completion alert (timer finished naturally)
   */
  async endTimerWithAlert(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }

    try {
      const state: LiveActivity.LiveActivityState = {
        title: 'Rest Complete!',
        subtitle: 'Time to lift',
        progressBar: {
          progress: 1,
        },
      };

      if (currentActivityId) {
        LiveActivity.stopActivity(currentActivityId, state);
        currentActivityId = null;
      }

      // Always call native cleanup to catch orphaned activities (e.g., from background expiry)
      await nativeEndAllActivities();
      return true;
    } catch (error) {
      console.log('Failed to end Live Activity:', error);
      currentActivityId = null;
      await nativeEndAllActivities();
      return false;
    }
  },

  /**
   * Force-end ALL Live Activities (tracked + orphaned).
   * Use on app startup, workout completion, or as manual cleanup.
   */
  async endAllActivities(): Promise<void> {
    if (Platform.OS !== 'ios') return;

    // Stop tracked activity via expo-live-activity if we have an ID
    if (currentActivityId) {
      try {
        const state: LiveActivity.LiveActivityState = {
          title: 'Rest Timer',
          subtitle: '',
          progressBar: { progress: 0 },
        };
        LiveActivity.stopActivity(currentActivityId, state);
      } catch (error) {
        // Ignore — native cleanup below will handle it
      }
      currentActivityId = null;
    }

    // Call native module to end ALL activities including orphans
    await nativeEndAllActivities();
  },

  /**
   * Get the current activity ID
   */
  getCurrentActivityId(): string | null {
    return currentActivityId;
  },
};

export default liveActivityService;
