import { v4 as uuidv4 } from 'uuid';
import {
  Exercise,
  Workout,
  WorkoutSet,
  SetgraphRow,
  SetgraphExerciseMapping,
  PrimaryMuscleGroup,
} from '../types';
import {
  getExercises,
  addExercise,
  addWorkout,
  addSet,
  getSetgraphMappings,
  saveSetgraphMappings,
  getSets,
  getWorkouts,
} from './storage';
import { SEED_EXERCISES } from '../data/exercises';

// Parse CSV content into rows
export function parseSetgraphCSV(csvContent: string): SetgraphRow[] {
  const lines = csvContent.trim().split('\n');

  // Skip header
  const dataLines = lines.slice(1);

  return dataLines.map(line => {
    // Handle CSV parsing with potential commas in quoted fields
    const parts = parseCSVLine(line);

    return {
      exerciseName: parts[0] || '',
      date: parts[1] || '',
      repetitions: parseFloat(parts[2]) || 0,
      weightLb: parseFloat(parts[3]) || 0,
      weightKg: parseFloat(parts[4]) || 0,
      note: parts[5] || '',
      labelName: parts[6] || '',
    };
  }).filter(row => row.exerciseName && row.date);
}

// Parse a single CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// Get unique exercise names from Setgraph data
export function getUniqueSetgraphExercises(rows: SetgraphRow[]): string[] {
  const unique = new Set<string>();
  rows.forEach(row => unique.add(row.exerciseName));
  return Array.from(unique).sort();
}

// Create default mappings from Setgraph exercise names to our exercise library
export function createDefaultMappings(
  setgraphExercises: string[],
  existingExercises: Exercise[]
): SetgraphExerciseMapping[] {
  const exerciseNameMap = new Map<string, string>();

  // Create a map of normalized names to exercise IDs
  existingExercises.forEach(e => {
    const normalized = normalizeExerciseName(e.name);
    exerciseNameMap.set(normalized, e.id);
  });

  // Common Setgraph to library mappings (fuzzy matches)
  const knownMappings: Record<string, string> = {
    'dumbbell chest press': 'db-flat-low-incline-bench-press',
    'dumbbell incline press': 'db-incline-bench-press',
    'dumbell fly': 'db-flat-low-incline-bench-press', // Close match
    'overhead press': 'seated-db-overhead-press',
    'arnold shoulder press': 'seated-db-overhead-press',
    'front shoulder raise': 'seated-db-lateral-raise', // Front delts
    'side lateral raises': 'seated-db-lateral-raise',
    'tricep extensions ovhd': 'db-overhead-triceps-extension',
    'skull crushers': 'db-overhead-triceps-extension',
    'bentover row': 'one-arm-db-row',
    'dumbbell curls': 'incline-bench-db-curl',
    'biceps - hammer curls': 'db-hammer-curl',
    'dumbbell pullover': 'db-pullover',
    'standing calf raise': 'db-standing-calf-raise',
    'dumbell shrugs': '', // Will need to create (empty string means create new)
  };

  return setgraphExercises.map(name => {
    const normalized = normalizeExerciseName(name);

    // Check known mappings first
    if (knownMappings.hasOwnProperty(normalized)) {
      const mappedId = knownMappings[normalized];
      return {
        setgraphName: name,
        exerciseId: mappedId || null,
        needsMapping: !mappedId,
      };
    }

    // Try to find exact match
    const exactMatch = exerciseNameMap.get(normalized);
    if (exactMatch) {
      return {
        setgraphName: name,
        exerciseId: exactMatch,
        needsMapping: false,
      };
    }

    // Try fuzzy match
    const fuzzyMatch = findFuzzyMatch(normalized, existingExercises);
    if (fuzzyMatch) {
      return {
        setgraphName: name,
        exerciseId: fuzzyMatch.id,
        needsMapping: false,
      };
    }

    // No match found - needs manual mapping or will create new exercise
    return {
      setgraphName: name,
      exerciseId: null,
      needsMapping: true,
    };
  });
}

function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findFuzzyMatch(
  normalizedName: string,
  exercises: Exercise[]
): Exercise | null {
  const words = normalizedName.split(' ');

  // Try to find an exercise that contains most of the same words
  let bestMatch: Exercise | null = null;
  let bestScore = 0;

  for (const exercise of exercises) {
    const exerciseWords = normalizeExerciseName(exercise.name).split(' ');
    let matchCount = 0;

    for (const word of words) {
      if (word.length > 2 && exerciseWords.some(ew => ew.includes(word) || word.includes(ew))) {
        matchCount++;
      }
    }

    const score = matchCount / Math.max(words.length, exerciseWords.length);
    if (score > bestScore && score > 0.5) {
      bestScore = score;
      bestMatch = exercise;
    }
  }

  return bestMatch;
}

// Create a new exercise from a Setgraph exercise name
export function createExerciseFromSetgraph(
  name: string,
  primaryMuscleGroup: PrimaryMuscleGroup = 'miscellaneous'
): Exercise {
  return {
    id: `imported-${uuidv4()}`,
    name: name,
    primaryMuscleGroups: [primaryMuscleGroup],
    secondaryMuscleGroups: [],
    equipment: 'other',
    locationIds: ['gym', 'home'],
    isCustom: true,
  };
}

// Import Setgraph data with the given mappings
export async function importSetgraphData(
  rows: SetgraphRow[],
  mappings: SetgraphExerciseMapping[]
): Promise<{
  workoutsCreated: number;
  setsCreated: number;
  exercisesCreated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let exercisesCreated = 0;
  let workoutsCreated = 0;
  let setsCreated = 0;

  // Build mapping lookup
  const mappingLookup = new Map<string, string | null>();
  for (const mapping of mappings) {
    mappingLookup.set(mapping.setgraphName, mapping.exerciseId);
  }

  // Get existing exercises and create new ones as needed
  const exercises = await getExercises();
  const exerciseIdMap = new Map<string, string>();

  for (const mapping of mappings) {
    if (mapping.exerciseId) {
      exerciseIdMap.set(mapping.setgraphName, mapping.exerciseId);
    } else {
      // Create new exercise
      const newExercise = createExerciseFromSetgraph(mapping.setgraphName);
      await addExercise(newExercise);
      exerciseIdMap.set(mapping.setgraphName, newExercise.id);
      exercisesCreated++;
    }
  }

  // Group rows by date (workout sessions)
  const workoutsByDate = new Map<string, SetgraphRow[]>();

  for (const row of rows) {
    // Extract date part only (YYYY-MM-DD)
    const datePart = row.date.split(' ')[0];

    if (!workoutsByDate.has(datePart)) {
      workoutsByDate.set(datePart, []);
    }
    workoutsByDate.get(datePart)!.push(row);
  }

  // Create workouts and sets
  for (const [date, dateRows] of workoutsByDate) {
    // Sort rows by timestamp
    const sortedRows = dateRows.sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Create workout
    const startTime = sortedRows[0].date;
    const endTime = sortedRows[sortedRows.length - 1].date;

    const workout: Workout = {
      id: `imported-${uuidv4()}`,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      templateId: null,
    };

    await addWorkout(workout);
    workoutsCreated++;

    // Create sets for this workout
    for (const row of sortedRows) {
      const exerciseId = exerciseIdMap.get(row.exerciseName);

      if (!exerciseId) {
        errors.push(`No mapping found for exercise: ${row.exerciseName}`);
        continue;
      }

      const set: WorkoutSet = {
        id: `imported-${uuidv4()}`,
        workoutId: workout.id,
        exerciseId: exerciseId,
        reps: Math.round(row.repetitions),
        weight: Math.round(row.weightLb * 10) / 10, // Keep one decimal
        loggedAt: new Date(row.date).toISOString(),
      };

      await addSet(set);
      setsCreated++;
    }
  }

  // Save mappings for future reference
  await saveSetgraphMappings(
    mappings.map(m => ({
      setgraphName: m.setgraphName,
      exerciseId: exerciseIdMap.get(m.setgraphName) || '',
    }))
  );

  return {
    workoutsCreated,
    setsCreated,
    exercisesCreated,
    errors,
  };
}

// Validate Setgraph CSV before import
export function validateSetgraphCSV(csvContent: string): {
  valid: boolean;
  rowCount: number;
  errors: string[];
} {
  const errors: string[] = [];

  try {
    const rows = parseSetgraphCSV(csvContent);

    if (rows.length === 0) {
      errors.push('No valid data rows found in CSV');
      return { valid: false, rowCount: 0, errors };
    }

    // Check for required fields
    let invalidRows = 0;
    rows.forEach((row, index) => {
      if (!row.exerciseName) {
        invalidRows++;
      }
      if (!row.date) {
        invalidRows++;
      }
      if (row.repetitions <= 0) {
        // Warning but not error
      }
    });

    if (invalidRows > 0) {
      errors.push(`${invalidRows} rows have missing exercise name or date`);
    }

    return {
      valid: errors.length === 0,
      rowCount: rows.length,
      errors,
    };
  } catch (error) {
    errors.push(`Failed to parse CSV: ${error}`);
    return { valid: false, rowCount: 0, errors };
  }
}
