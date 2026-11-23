jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import type { Exercise, Routine, Template } from '../../types';
import { calculateProjectedVolumeForRoutine } from '../analytics';

const ex = (id: string, primary: string[], over: Partial<Exercise> = {}) =>
  ({ id, name: id, primaryMuscleGroups: primary, equipment: 'cable', ...over }) as Exercise;
const tmpl = (id: string, exerciseIds: string[]) => ({ id, name: id, type: 'strength', locationId: 'gym', exerciseIds }) as Template;

const exercises = [
  ex('lat-raise', ['side_delts'], { targetSets: 6 }),
  ex('cuff', ['rotator_cuff'], { targetSets: 8 }),
  ex('one-arm-row', ['mid_back'], { isUnilateral: true }), // 6 sets logged per side -> 3
  ex('prep', ['rotator_cuff'], { defaultWarmup: true }),
  ex('curl', ['biceps']), // no target: 3
];
const templates = [tmpl('fb1', ['lat-raise', 'curl']), tmpl('fb3', ['lat-raise', 'cuff', 'prep']), tmpl('fb5', ['lat-raise', 'one-arm-row'])];
const targets = { side_delts: 18, rotator_cuff: 8, mid_back: 12, biceps: 9 } as any;

const byGroup = (v: ReturnType<typeof calculateProjectedVolumeForRoutine>) => Object.fromEntries(v.filter(m => m.sets > 0).map(m => [m.muscleGroup, m.sets]));

describe('projected weekly volume', () => {
  test('each exercise credits its own target sets, unilateral at half, prep at nothing', () => {
    const routine = {
      id: 'r',
      name: 'r',
      isActive: true,
      daySchedule: [],
      rotation: {
        slots: [
          { id: 'w1', label: 'W1', templateId: 'fb1', usualDay: 2 },
          { id: 'w2', label: 'W2', templateId: 'fb3', usualDay: 3 },
          { id: 'w3', label: 'W3', templateId: 'fb5', usualDay: 4 },
        ],
        flexTemplateId: null,
      },
    } as unknown as Routine;
    expect(byGroup(calculateProjectedVolumeForRoutine(routine, templates, exercises, targets))).toEqual({
      side_delts: 18,
      rotator_cuff: 8,
      mid_back: 3,
      biceps: 3,
    });
  });

  test('a routine without a rotation still reads its weekday schedule', () => {
    const routine = {
      id: 'r',
      name: 'r',
      isActive: true,
      daySchedule: [
        { day: 1, templateIds: ['fb1'] },
        { day: 3, templateIds: ['fb3'] },
      ],
    } as unknown as Routine;
    expect(byGroup(calculateProjectedVolumeForRoutine(routine, templates, exercises, targets))).toEqual({
      side_delts: 12,
      rotator_cuff: 8,
      biceps: 3,
    });
  });
});
