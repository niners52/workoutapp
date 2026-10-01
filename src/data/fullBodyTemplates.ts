/**
 * The six full-body days.
 *
 * Every exercise here is an existing record, matched by name — nothing new is
 * created. Five days run at Planet Fitness (`gym`) and the sixth at Vasa.
 * Templates carry only exercise ids, so the prescription (3 sets, and the rep
 * range) is stored on the exercise itself as `targetSets` / `targetReps`.
 *
 * Where one exercise appears on two days with different rep ranges, the stored
 * range covers both: the leg press is 8-10 on day 1 and 10-12 on day 4, so it
 * reads 8-12.
 *
 * Four exercises are not tagged for the location of the day they sit on — see
 * LOCATION_MISMATCHES. They are left as the names say; a template still runs
 * anywhere, and the gap list treats a muscle as covered however it is trained.
 */
import type { Template } from '../types';

export interface FullBodyItem {
  exerciseId: string;
  /** Logged sets. Unilateral exercises log one side per set, so 6 is 3 per leg. */
  sets: number;
  reps: string;
}

export interface FullBodyDay {
  template: Template;
  items: FullBodyItem[];
}

const PF = 'gym';
const VASA = 'vasa-';

const DAYS: FullBodyDay[] = [
  {
    template: {
      id: '892c45ec-5312-447c-adf9-50c101ae1e35',
      name: 'Full Body 1',
      type: 'full_body',
      locationId: PF,
      exerciseIds: [],
    },
    items: [
      { exerciseId: 'plate-loaded-incline-press', sets: 3, reps: '6-8' },
      { exerciseId: 'wide-grip-lat-pulldown', sets: 3, reps: '8-10' },
      { exerciseId: 'import-low-cable-row', sets: 3, reps: '8-10' },
      { exerciseId: '29bcb169-528c-4f61-910f-66d52c1d6fd1', sets: 3, reps: '8-12' }, // Machine Leg press
      { exerciseId: 'seated-leg-curl', sets: 3, reps: '10-12' },
      { exerciseId: 'cable-lateral-raise', sets: 3, reps: '12-15' },
      { exerciseId: 'cable-machine-crunch', sets: 3, reps: '12' },
    ],
  },
  {
    template: {
      id: 'b13a4b23-1892-4fae-bcba-59cb8d1dd0d8',
      name: 'Full Body 2',
      type: 'full_body',
      locationId: PF,
      exerciseIds: [],
    },
    items: [
      { exerciseId: 'aaedca8e-b918-43f3-b324-caab35e16cda', sets: 3, reps: '8-10' }, // Machine Incline press
      { exerciseId: '86847ace-fb9f-421b-b32b-776f27c56775', sets: 3, reps: '8-10' }, // Machine Lat pulldown
      { exerciseId: 'chest-supported-machine-row', sets: 3, reps: '10-12' },
      { exerciseId: 'seated-leg-extension', sets: 3, reps: '12-15' },
      { exerciseId: '45f8c1cc-6bc7-4047-a427-5489ebaf66a3', sets: 6, reps: '10-12' }, // Glute push, 3 per leg
      { exerciseId: '22da91ef-ecfa-4cbb-b93b-2b9f7b7bf586', sets: 3, reps: '10-12' }, // Tricep rope pulldown
      { exerciseId: '7524e1ed-a483-4f72-b337-248f8246a1cb', sets: 3, reps: '8-10' }, // Cable (Straight Bar) Shrug
    ],
  },
  {
    template: {
      id: '66a02408-5929-4603-ae7d-3bb283d7c483',
      name: 'Full Body 3',
      type: 'full_body',
      locationId: PF,
      exerciseIds: [],
    },
    items: [
      { exerciseId: 'pec-fly-machine', sets: 3, reps: '12' },
      { exerciseId: 'import-pullup', sets: 3, reps: 'AMRAP' },
      { exerciseId: 'import-wide-grip-row', sets: 3, reps: '10-12' },
      { exerciseId: '87d5e750-60cd-46ef-b5f2-6822a6d070a6', sets: 3, reps: '10-12' }, // Machine Laying Leg Curl
      { exerciseId: 'e4ae1797-ec53-4ddf-8473-24cc78c68267', sets: 3, reps: '10' }, // Pulldown bicep curl
      { exerciseId: 'face-pull', sets: 3, reps: '15' },
      { exerciseId: 'import-leg-raise', sets: 3, reps: '12' },
    ],
  },
  {
    template: {
      id: 'c6698cd8-af6a-4937-90be-fdb17885d8d9',
      name: 'Full Body 4',
      type: 'full_body',
      locationId: PF,
      exerciseIds: [],
    },
    items: [
      { exerciseId: 'incline-bench-press', sets: 3, reps: '8-10' }, // Smith Machine Incline Bench Press
      { exerciseId: 'ae43a483-3e85-46d3-bcb2-33e014dbca97', sets: 3, reps: '12' }, // Cable (Straight Bar) arm pulldown
      { exerciseId: '083c1c85-f090-4a50-a430-19393c82d080', sets: 3, reps: '10-12' }, // Machine ISO Lateral Row
      { exerciseId: '29bcb169-528c-4f61-910f-66d52c1d6fd1', sets: 3, reps: '8-12' }, // Machine Leg press
      { exerciseId: 'back-extension', sets: 3, reps: '12' },
      { exerciseId: '558d0521-308c-418d-9f3a-40ef807cd6a9', sets: 3, reps: '12' }, // Machine Seated machine lateral raise
      { exerciseId: 'overhead-triceps-extension-rope', sets: 3, reps: '10-12' },
    ],
  },
  {
    template: {
      id: '3d0d4a24-b345-4193-9d4c-b80b664f9565',
      name: 'Full Body 5',
      type: 'full_body',
      locationId: PF,
      exerciseIds: [],
    },
    items: [
      { exerciseId: 'import-cable-fly-high-low', sets: 3, reps: '12' },
      { exerciseId: 'e1bc84b4-90e6-427e-bd1a-fdebf6b821ae', sets: 3, reps: '12-15' }, // Cable (Rope) Pull-Through
      { exerciseId: 'seated-leg-curl', sets: 3, reps: '10-12' },
      { exerciseId: '9279fe5b-336f-455e-8b2a-6773bea46ce7', sets: 3, reps: '10-12' }, // Machine Shrug
      { exerciseId: 'b5400777-ab8f-4d03-9b28-c9b393ff04bf', sets: 3, reps: '15' }, // Machine Reverse pec fly
      { exerciseId: 'import-alternate-db-curl', sets: 3, reps: '10' }, // Dumbbell Hammer Curl
      { exerciseId: 'calf-raise-machine', sets: 3, reps: '15' },
      { exerciseId: '991536ef-ea5a-47a8-9db4-d0b2f8499702', sets: 3, reps: '15' }, // Cable (Rope) Standing ab crunch
    ],
  },
  {
    template: {
      id: 'fd7ebc8a-02c7-45ef-bd1d-04a40c427bba',
      name: 'Full Body 6',
      type: 'full_body',
      locationId: VASA,
      exerciseIds: [],
    },
    items: [
      { exerciseId: '324a7e84-0ec3-4b4e-8314-a87e3f4478e9', sets: 3, reps: '10-12' }, // Machine V squat
      { exerciseId: 'ec3b885d-db9a-43b2-84ff-859d5d5c3455', sets: 3, reps: '10-12' }, // Machine Glute drive
      { exerciseId: '39e393c6-770c-4522-9ee2-8abfd66f7627', sets: 3, reps: '8-10' }, // ISO Lateral Shoulder Press
      { exerciseId: 'cable-lateral-raise', sets: 3, reps: '12-15' },
      { exerciseId: '640c8b84-cec2-4116-aa15-5718034940b7', sets: 3, reps: '10-12' }, // Smith Machine Barbell shrug
      { exerciseId: 'import-tricep-dip-machine', sets: 3, reps: '8-10' }, // Bodyweight Tricep Dip
      { exerciseId: 'import-bayesian-curls', sets: 3, reps: '10-12' }, // Bayesian Curl
      { exerciseId: '33b9d9e0-aa70-4bf8-aee6-7437b95a0c92', sets: 3, reps: '15' }, // Bodyweight Back Extension
    ],
  },
];

export const FULL_BODY_DAYS: FullBodyDay[] = DAYS.map(day => ({
  ...day,
  template: { ...day.template, exerciseIds: day.items.map(i => i.exerciseId) },
}));

/**
 * Exercises whose location tags do not include the day they are scheduled on.
 * Both of these really are Vasa-only machines sitting on a Planet Fitness day;
 * the gap list treats the muscle as covered however it gets trained, so the
 * substitute is chosen at the gym rather than written into the template.
 */
export const LOCATION_MISMATCHES: Array<{ day: string; exerciseId: string; name: string; taggedFor: string }> = [
  { day: 'Full Body 4', exerciseId: '083c1c85-f090-4a50-a430-19393c82d080', name: 'Machine ISO Lateral Row', taggedFor: 'Vasa' },
  { day: 'Full Body 4', exerciseId: '558d0521-308c-418d-9f3a-40ef807cd6a9', name: 'Machine Seated machine lateral raise', taggedFor: 'Vasa' },
];

/** Every prescription, flattened: exercise id -> sets and reps. */
export function fullBodyPrescriptions(): Map<string, FullBodyItem> {
  const out = new Map<string, FullBodyItem>();
  for (const day of FULL_BODY_DAYS) {
    for (const item of day.items) out.set(item.exerciseId, item);
  }
  return out;
}
