import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { WatchConnectivityBridge } = NativeModules;
const watchEmitter = Platform.OS === 'ios' && WatchConnectivityBridge
  ? new NativeEventEmitter(WatchConnectivityBridge)
  : null;

export interface WatchWorkoutState {
  isActive: boolean;
  exerciseName: string;
  exerciseIndex: number;
  totalExercises: number;
  currentSetNumber: number;
  targetSets: number;
  lastWeight: number;
  lastReps: number;
  restTimerActive: boolean;
  restTimerRemaining: number;
  restTimerTotal: number;
  unitSystem: 'imperial' | 'metric';
}

export interface WatchSetLoggedData {
  weight: number;
  reps: number;
  exerciseIndex: number;
}

/**
 * Send current workout state to the Apple Watch.
 * This is the main state sync method - call when workout state changes.
 */
export function sendWorkoutStateToWatch(state: WatchWorkoutState): void {
  if (Platform.OS !== 'ios' || !WatchConnectivityBridge) return;
  try {
    WatchConnectivityBridge.sendWorkoutState(state);
  } catch (e) {
    console.log('[WatchConnectivity] Send state error:', e);
  }
}

/**
 * Send rest timer update to the Watch.
 * Call this every second while rest timer is active.
 */
export function sendRestTimerToWatch(
  remaining: number,
  total: number,
  exerciseName: string,
  isActive: boolean
): void {
  if (Platform.OS !== 'ios' || !WatchConnectivityBridge) return;
  try {
    WatchConnectivityBridge.sendRestTimerUpdate({
      remaining,
      total,
      exerciseName,
      isActive,
    });
  } catch (e) {
    console.log('[WatchConnectivity] Timer update error:', e);
  }
}

/**
 * Notify the Watch that the workout has ended.
 */
export function sendWorkoutEndedToWatch(): void {
  if (Platform.OS !== 'ios' || !WatchConnectivityBridge) return;
  try {
    WatchConnectivityBridge.sendWorkoutEnded();
  } catch (e) {
    console.log('[WatchConnectivity] End workout error:', e);
  }
}

/**
 * Check if an Apple Watch is paired with this device.
 */
export async function isWatchPaired(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !WatchConnectivityBridge) return false;
  try {
    return await WatchConnectivityBridge.isWatchPaired();
  } catch {
    return false;
  }
}

/**
 * Check if the paired Apple Watch is currently reachable.
 */
export async function isWatchReachable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !WatchConnectivityBridge) return false;
  try {
    return await WatchConnectivityBridge.isWatchReachable();
  } catch {
    return false;
  }
}

/**
 * Subscribe to set logged events from the Apple Watch.
 * @returns Unsubscribe function
 */
export function onWatchSetLogged(
  callback: (data: WatchSetLoggedData) => void
): () => void {
  if (!watchEmitter) return () => {};
  const sub = watchEmitter.addListener('onWatchSetLogged', callback);
  return () => sub.remove();
}

/**
 * Subscribe to rest timer action events from the Apple Watch.
 * @returns Unsubscribe function
 */
export function onWatchRestTimerAction(
  callback: (action: string) => void
): () => void {
  if (!watchEmitter) return () => {};
  const sub = watchEmitter.addListener('onWatchRestTimerAction', (data: { action: string }) =>
    callback(data.action)
  );
  return () => sub.remove();
}

/**
 * Subscribe to state request events from the Apple Watch.
 * When the Watch app opens or reconnects, it requests the current state.
 * @returns Unsubscribe function
 */
export function onWatchRequestState(callback: () => void): () => void {
  if (!watchEmitter) return () => {};
  const sub = watchEmitter.addListener('onWatchRequestState', callback);
  return () => sub.remove();
}

/**
 * Check if Watch connectivity is available on this platform.
 */
export function isWatchConnectivityAvailable(): boolean {
  return Platform.OS === 'ios' && WatchConnectivityBridge != null;
}
