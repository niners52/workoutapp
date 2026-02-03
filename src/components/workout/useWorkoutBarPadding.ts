import { useWorkout } from '../../contexts/WorkoutContext';
import { useRoute } from '@react-navigation/native';
import { MINI_BAR_HEIGHT } from './ActiveWorkoutMiniBar';

/**
 * Hook to get extra bottom padding needed when the workout mini-bar is visible.
 * Use this in scrollable screens to ensure content isn't hidden behind the mini-bar.
 *
 * Returns 0 when:
 * - No workout is active
 * - On the ActiveWorkout screen (mini-bar doesn't show there)
 */
export function useWorkoutBarPadding(): number {
  const { isWorkoutActive } = useWorkout();
  const route = useRoute();

  // Don't add padding on ActiveWorkout screen (mini-bar doesn't show there)
  const isOnActiveWorkout = route.name === 'ActiveWorkout';

  if (!isWorkoutActive || isOnActiveWorkout) {
    return 0;
  }

  return MINI_BAR_HEIGHT;
}

export default useWorkoutBarPadding;
