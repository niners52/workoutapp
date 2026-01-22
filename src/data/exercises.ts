import { Exercise, PrimaryMuscleGroup } from '../types';

// Seed exercise library with all exercises from the spec
export const SEED_EXERCISES: Exercise[] = [
  // PUSH (Gym) exercises
  {
    id: 'barbell-bench-press',
    name: 'Barbell Bench Press',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: ['front_delts', 'triceps'],
    equipment: 'barbell',
    location: 'gym',
  },
  {
    id: 'plate-loaded-incline-press',
    name: 'Plate-Loaded Incline Press',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: ['front_delts', 'triceps'],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'machine-chest-press',
    name: 'Machine Chest Press',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: ['front_delts', 'triceps'],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'seated-lateral-raise',
    name: 'Seated Lateral Raise',
    primaryMuscleGroup: 'side_delts',
    secondaryMuscleGroups: [],
    equipment: 'dumbbell',
    location: 'gym',
  },
  {
    id: 'overhead-triceps-extension-rope',
    name: 'Overhead Triceps Extension (rope)',
    primaryMuscleGroup: 'triceps',
    secondaryMuscleGroups: [],
    equipment: 'cable',
    location: 'gym',
  },
  {
    id: 'triceps-pushdown',
    name: 'Triceps Pushdown',
    primaryMuscleGroup: 'triceps',
    secondaryMuscleGroups: [],
    equipment: 'cable',
    location: 'gym',
  },

  // PULL (Gym) exercises
  {
    id: 'wide-grip-lat-pulldown',
    name: 'Wide-Grip Lat Pulldown',
    primaryMuscleGroup: 'lats',
    secondaryMuscleGroups: ['biceps'],
    equipment: 'cable',
    location: 'gym',
  },
  {
    id: 'chest-supported-machine-row',
    name: 'Chest-Supported Machine Row',
    primaryMuscleGroup: 'upper_back',
    secondaryMuscleGroups: ['lats', 'biceps'],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'neutral-close-grip-pulldown',
    name: 'Neutral/Close-Grip Pulldown',
    primaryMuscleGroup: 'lats',
    secondaryMuscleGroups: ['biceps'],
    equipment: 'cable',
    location: 'gym',
  },
  {
    id: 'face-pull',
    name: 'Face Pull',
    primaryMuscleGroup: 'rear_delts',
    secondaryMuscleGroups: ['upper_back'],
    equipment: 'cable',
    location: 'gym',
  },
  {
    id: 'preacher-curl',
    name: 'Preacher Curl',
    primaryMuscleGroup: 'biceps',
    secondaryMuscleGroups: ['forearms'],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'cable-hammer-curl',
    name: 'Cable Hammer Curl',
    primaryMuscleGroup: 'biceps',
    secondaryMuscleGroups: ['forearms'],
    equipment: 'cable',
    location: 'gym',
  },

  // LEGS (Gym) exercises
  {
    id: 'hack-squat',
    name: 'Hack Squat',
    primaryMuscleGroup: 'quads',
    secondaryMuscleGroups: ['glutes'],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    primaryMuscleGroup: 'quads',
    secondaryMuscleGroups: ['glutes'],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'seated-leg-extension',
    name: 'Seated Leg Extension',
    primaryMuscleGroup: 'quads',
    secondaryMuscleGroups: [],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'seated-leg-curl',
    name: 'Seated Leg Curl',
    primaryMuscleGroup: 'hamstrings',
    secondaryMuscleGroups: [],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'hip-abduction-machine',
    name: 'Hip Abduction Machine',
    primaryMuscleGroup: 'glutes',
    secondaryMuscleGroups: [],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'calf-raise-machine',
    name: 'Calf Raise',
    primaryMuscleGroup: 'calves',
    secondaryMuscleGroups: [],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'cable-machine-crunch',
    name: 'Cable/Machine Crunch',
    primaryMuscleGroup: 'abs',
    secondaryMuscleGroups: [],
    equipment: 'cable',
    location: 'gym',
  },
  {
    id: 'back-extension',
    name: 'Back Extension',
    primaryMuscleGroup: 'lower_back',
    secondaryMuscleGroups: ['glutes'],
    equipment: 'machine',
    location: 'gym',
  },

  // GYM PUSH B exercises
  {
    id: 'incline-bench-press',
    name: 'Incline Bench Press',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: ['front_delts', 'triceps'],
    equipment: 'barbell',
    location: 'gym',
  },
  {
    id: 'pec-fly-machine',
    name: 'Pec Fly Machine',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: [],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'db-overhead-press-neutral',
    name: 'DB Overhead Press (Neutral)',
    primaryMuscleGroup: 'front_delts',
    secondaryMuscleGroups: ['triceps', 'side_delts'],
    equipment: 'dumbbell',
    location: 'gym',
  },
  {
    id: 'cable-lateral-raise',
    name: 'Cable Lateral Raise',
    primaryMuscleGroup: 'side_delts',
    secondaryMuscleGroups: [],
    equipment: 'cable',
    location: 'gym',
  },
  {
    id: 'straight-bar-pushdown',
    name: 'Straight-Bar Pushdown',
    primaryMuscleGroup: 'triceps',
    secondaryMuscleGroups: [],
    equipment: 'cable',
    location: 'gym',
  },

  // GYM PULL B exercises
  {
    id: 'close-grip-pulldown',
    name: 'Close-Grip Pulldown',
    primaryMuscleGroup: 'lats',
    secondaryMuscleGroups: ['biceps'],
    equipment: 'cable',
    location: 'gym',
  },
  {
    id: 'straight-arm-pulldown',
    name: 'Straight-Arm Pulldown',
    primaryMuscleGroup: 'lats',
    secondaryMuscleGroups: [],
    equipment: 'cable',
    location: 'gym',
  },
  {
    id: 'rear-delt-fly-machine',
    name: 'Rear-Delt Fly Machine',
    primaryMuscleGroup: 'rear_delts',
    secondaryMuscleGroups: ['upper_back'],
    equipment: 'machine',
    location: 'gym',
  },
  {
    id: 'ez-bar-curl',
    name: 'EZ-Bar Curl',
    primaryMuscleGroup: 'biceps',
    secondaryMuscleGroups: ['forearms'],
    equipment: 'barbell',
    location: 'gym',
  },
  {
    id: 'cable-curl',
    name: 'Cable Curl',
    primaryMuscleGroup: 'biceps',
    secondaryMuscleGroups: ['forearms'],
    equipment: 'cable',
    location: 'gym',
  },

  // GYM LEGS B additional exercises
  {
    id: 'seated-calf-raise',
    name: 'Seated Calf Raise',
    primaryMuscleGroup: 'calves',
    secondaryMuscleGroups: [],
    equipment: 'machine',
    location: 'gym',
  },

  // PUSH (Home) exercises
  {
    id: 'db-flat-low-incline-bench-press',
    name: 'DB Flat/Low-Incline Bench Press',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: ['front_delts', 'triceps'],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'db-incline-bench-press',
    name: 'DB Incline Bench Press',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: ['front_delts', 'triceps'],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'seated-db-overhead-press',
    name: 'Seated DB Overhead Press',
    primaryMuscleGroup: 'front_delts',
    secondaryMuscleGroups: ['triceps'],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'seated-db-lateral-raise',
    name: 'Seated DB Lateral Raise',
    primaryMuscleGroup: 'side_delts',
    secondaryMuscleGroups: [],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'bench-dips',
    name: 'Bench Dips',
    primaryMuscleGroup: 'triceps',
    secondaryMuscleGroups: ['chest', 'front_delts'],
    equipment: 'bodyweight',
    location: 'home',
  },
  {
    id: 'db-overhead-triceps-extension',
    name: 'DB Overhead Triceps Extension',
    primaryMuscleGroup: 'triceps',
    secondaryMuscleGroups: [],
    equipment: 'dumbbell',
    location: 'home',
  },

  // PULL (Home) exercises
  {
    id: 'chest-supported-db-row',
    name: 'Chest-Supported DB Row',
    primaryMuscleGroup: 'upper_back',
    secondaryMuscleGroups: ['lats', 'biceps'],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'one-arm-db-row',
    name: 'One-Arm DB Row',
    primaryMuscleGroup: 'upper_back',
    secondaryMuscleGroups: ['lats', 'biceps'],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'db-pullover',
    name: 'DB Pullover',
    primaryMuscleGroup: 'lats',
    secondaryMuscleGroups: ['chest'],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'incline-bench-rear-delt-db-fly',
    name: 'Incline Bench Rear-Delt DB Fly',
    primaryMuscleGroup: 'rear_delts',
    secondaryMuscleGroups: ['upper_back'],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'db-hammer-curl',
    name: 'DB Hammer Curl',
    primaryMuscleGroup: 'biceps',
    secondaryMuscleGroups: ['forearms'],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'incline-bench-db-curl',
    name: 'Incline Bench DB Curl',
    primaryMuscleGroup: 'biceps',
    secondaryMuscleGroups: ['forearms'],
    equipment: 'dumbbell',
    location: 'home',
  },

  // LEGS (Home) exercises
  {
    id: 'goblet-squat',
    name: 'Goblet Squat',
    primaryMuscleGroup: 'quads',
    secondaryMuscleGroups: ['glutes'],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'db-bulgarian-split-squat',
    name: 'DB Bulgarian Split Squat',
    primaryMuscleGroup: 'quads',
    secondaryMuscleGroups: ['glutes', 'hamstrings'],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'db-hip-thrust',
    name: 'DB Hip Thrust',
    primaryMuscleGroup: 'glutes',
    secondaryMuscleGroups: ['hamstrings'],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'db-standing-calf-raise',
    name: 'DB Standing Calf Raise',
    primaryMuscleGroup: 'calves',
    secondaryMuscleGroups: [],
    equipment: 'dumbbell',
    location: 'home',
  },
  {
    id: 'slant-board-tibialis-raise',
    name: 'Slant Board Tibialis Raise',
    primaryMuscleGroup: 'miscellaneous',
    secondaryMuscleGroups: [],
    equipment: 'bodyweight',
    location: 'home',
  },
  {
    id: 'ab-roller-knee-raise',
    name: 'Ab Roller / Knee Raise',
    primaryMuscleGroup: 'abs',
    secondaryMuscleGroups: [],
    equipment: 'bodyweight',
    location: 'home',
  },
];

// Create a map for quick lookup by ID
export const EXERCISE_MAP = new Map<string, Exercise>(
  SEED_EXERCISES.map(e => [e.id, e])
);

// Get exercise by ID
export function getExerciseById(id: string): Exercise | undefined {
  return EXERCISE_MAP.get(id);
}

// Search exercises by name
export function searchExercises(
  exercises: Exercise[],
  query: string,
  filters?: {
    muscleGroup?: PrimaryMuscleGroup;
    equipment?: Exercise['equipment'];
    location?: Exercise['location'];
  }
): Exercise[] {
  const lowerQuery = query.toLowerCase();

  return exercises.filter(exercise => {
    // Name match
    if (!exercise.name.toLowerCase().includes(lowerQuery)) {
      return false;
    }

    // Apply filters
    if (filters?.muscleGroup && exercise.primaryMuscleGroup !== filters.muscleGroup) {
      return false;
    }
    if (filters?.equipment && exercise.equipment !== filters.equipment) {
      return false;
    }
    if (filters?.location && exercise.location !== filters.location && exercise.location !== 'both') {
      return false;
    }

    return true;
  });
}
