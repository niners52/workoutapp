import { remainingPlan, thisWeekRows } from '../thisWeek';
import type { RotationState } from '../rotationWeek';
import type { Exercise, MuscleGroupVolume } from '../../types';

const slot = (label: string, exerciseIds: string[], performed = false) =>
  ({ slot: { id: label.toLowerCase(), label, templateId: label }, template: { id: label, name: label, exerciseIds }, performed, workoutIds: [] }) as any;

const state = (flexWorkoutIds: string[] = []): RotationState =>
  ({ slots: [slot('W1', ['lat']), slot('W2', ['cuff'], true)], nextUp: null, flexWorkoutIds }) as unknown as RotationState;

const exercises = [
  { id: 'lat', name: 'lat', primaryMuscleGroups: ['side_delts'], targetSets: 6, equipment: 'cable' },
  { id: 'cuff', name: 'cuff', primaryMuscleGroups: ['rotator_cuff'], targetSets: 8, equipment: 'cable' },
  { id: 'raise', name: 'raise', primaryMuscleGroups: ['side_delts'], targetSets: 6, equipment: 'machine' },
] as Exercise[];

describe('the Flex workout counts like the other workouts', () => {
  test('until a Flex session has run, Flex is a scheduled day after the rotation', () => {
    expect(remainingPlan(state(), { exerciseIds: ['raise'] })).toEqual([
      { dayLabel: 'W1', exerciseIds: ['lat'] },
      { dayLabel: 'Flex', exerciseIds: ['raise'] },
    ]);
  });

  test('once Flex has run this week it is no longer scheduled', () => {
    expect(remainingPlan(state(['flex-session']), { exerciseIds: ['raise'] }).map(d => d.dayLabel)).toEqual(['W1']);
  });

  test("Flex's sets fill the bar instead of showing as not planned", () => {
    const volume = [{ muscleGroup: 'side_delts', sets: 0, target: 12 }] as unknown as MuscleGroupVolume[];
    const [row] = thisWeekRows({ volume, plan: remainingPlan(state(), { exerciseIds: ['raise'] }), exercises });
    expect(row).toMatchObject({ scheduled: 12, flex: 0, scheduledDays: ['W1', 'Flex'] });
  });
});
