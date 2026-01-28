import { NativeModules, Platform } from 'react-native';

interface LiveActivityModuleInterface {
  isLiveActivitySupported(): Promise<boolean>;
  startRestTimer(seconds: number): Promise<string>;
  updateRestTimer(remainingSeconds: number): Promise<boolean>;
  stopRestTimer(): Promise<boolean>;
  endRestTimerWithAlert(): Promise<boolean>;
}

const { LiveActivityModule } = NativeModules;

// Live Activity service for iOS rest timer
// Falls back gracefully on unsupported platforms
export const liveActivityService = {
  /**
   * Check if Live Activities are supported on this device
   */
  async isSupported(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }

    try {
      const module = LiveActivityModule as LiveActivityModuleInterface | undefined;
      if (!module?.isLiveActivitySupported) {
        return false;
      }
      return await module.isLiveActivitySupported();
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
      const module = LiveActivityModule as LiveActivityModuleInterface | undefined;
      if (!module?.startRestTimer) {
        return null;
      }
      return await module.startRestTimer(seconds);
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
    if (Platform.OS !== 'ios') {
      return false;
    }

    try {
      const module = LiveActivityModule as LiveActivityModuleInterface | undefined;
      if (!module?.updateRestTimer) {
        return false;
      }
      return await module.updateRestTimer(remainingSeconds);
    } catch (error) {
      console.log('Failed to update Live Activity:', error);
      return false;
    }
  },

  /**
   * Stop/cancel the timer Live Activity immediately
   */
  async stopTimer(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }

    try {
      const module = LiveActivityModule as LiveActivityModuleInterface | undefined;
      if (!module?.stopRestTimer) {
        return false;
      }
      return await module.stopRestTimer();
    } catch (error) {
      console.log('Failed to stop Live Activity:', error);
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
      const module = LiveActivityModule as LiveActivityModuleInterface | undefined;
      if (!module?.endRestTimerWithAlert) {
        return false;
      }
      return await module.endRestTimerWithAlert();
    } catch (error) {
      console.log('Failed to end Live Activity:', error);
      return false;
    }
  },
};

export default liveActivityService;
