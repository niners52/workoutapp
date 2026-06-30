import * as Crypto from 'expo-crypto';
import {
  Exercise,
  Template,
  TemplateType,
  Routine,
  RoutineDaySchedule,
  Equipment,
  PrimaryMuscleGroup,
  Modality,
  getExerciseDisplayName,
} from '../types';

const generateId = () => Crypto.randomUUID();

// ─── Parsed shape ───────────────────────────────────────────────────────────

export interface ImportExercise {
  name: string;
  sets?: number;
  reps?: number | string; // string supports ranges ("8-15") in seeded presets
  unilateral?: boolean;
  notes?: string;
}

export interface ImportDay {
  /** 1-7 (1 = Monday … 7 = Sunday) OR 0-6 (0=Sunday) — both are accepted. */
  dayNumber: number;
  name?: string;
  location?: string;
  exercises: ImportExercise[];
  // Optional modality + aerobic targets for Program-style days. Aerobic and
  // recovery days don't need exercises; the day itself is the activity.
  modality?: Modality;
  targetDurationMin?: number;
  targetIntensityRPE?: number;
  targetHRPctMax?: number;
  notes?: string;
}

export interface ImportRoutineData {
  name: string;
  notes?: string;
  isPreset?: boolean;
  days: ImportDay[];
}

export interface ImportPreview {
  routineName: string;
  notes?: string;
  days: {
    dayNumber: number;
    name: string;
    locationName?: string;
    modality?: Modality;
    targetDurationMin?: number;
    targetIntensityRPE?: number;
    targetHRPctMax?: number;
    notes?: string;
    exercises: {
      name: string;
      sets: number;
      reps?: number | string;
      unilateral: boolean;
      matched: boolean; // true if we found an existing Exercise by name
      inferredEquipment: Equipment;
      inferredMuscles: PrimaryMuscleGroup[];
    }[];
  }[];
}

export interface ImportResult {
  routine: Routine;
  templatesCreated: number;
  exercisesCreated: number;
  exercisesMatched: number;
}

// ─── JSON parsing ───────────────────────────────────────────────────────────

export function parseRoutineJSON(text: string): ImportRoutineData {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Paste a routine first.');
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: any) {
    throw new Error(`Invalid JSON: ${err.message ?? err}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Expected a JSON object at the top level.');
  }
  if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
    throw new Error('Missing "name" field.');
  }
  if (!Array.isArray(parsed.days) || parsed.days.length === 0) {
    throw new Error('Missing "days" array.');
  }

  const validModalities: Modality[] = ['strength', 'aerobic', 'balance', 'recovery'];

  const days: ImportDay[] = parsed.days.map((d: any, idx: number) => {
    if (typeof d !== 'object' || d === null) {
      throw new Error(`days[${idx}] is not an object.`);
    }
    const dayNumber = typeof d.dayNumber === 'number' ? d.dayNumber : idx + 1;
    if (dayNumber < 0 || dayNumber > 7) {
      throw new Error(`days[${idx}].dayNumber must be 0-7 (got ${dayNumber}).`);
    }
    // exercises is optional for aerobic/recovery days (the day itself is the activity)
    const exercisesIn = Array.isArray(d.exercises) ? d.exercises : [];
    const modality: Modality | undefined =
      typeof d.modality === 'string' && (validModalities as string[]).includes(d.modality)
        ? (d.modality as Modality)
        : undefined;
    return {
      dayNumber,
      name: typeof d.name === 'string' ? d.name : undefined,
      location: typeof d.location === 'string' ? d.location : undefined,
      modality,
      targetDurationMin: typeof d.targetDurationMin === 'number' ? d.targetDurationMin : undefined,
      targetIntensityRPE: typeof d.targetIntensityRPE === 'number' ? d.targetIntensityRPE : undefined,
      targetHRPctMax: typeof d.targetHRPctMax === 'number' ? d.targetHRPctMax : undefined,
      notes: typeof d.notes === 'string' ? d.notes : undefined,
      exercises: exercisesIn.map((e: any, ei: number) => {
        if (typeof e !== 'object' || e === null) {
          throw new Error(`days[${idx}].exercises[${ei}] is not an object.`);
        }
        if (typeof e.name !== 'string' || !e.name.trim()) {
          throw new Error(`days[${idx}].exercises[${ei}] missing "name".`);
        }
        const reps =
          typeof e.reps === 'number' ? e.reps :
          typeof e.reps === 'string' ? e.reps :
          undefined;
        return {
          name: e.name.trim(),
          sets: typeof e.sets === 'number' ? e.sets : undefined,
          reps,
          unilateral: e.unilateral === true,
          notes: typeof e.notes === 'string' ? e.notes : undefined,
        };
      }),
    };
  });

  return {
    name: parsed.name.trim(),
    notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
    isPreset: parsed.isPreset === true,
    days,
  };
}

// ─── MS Foundations adapter ─────────────────────────────────────────────────
// Converts the typed MS_FOUNDATIONS_PRESET constant into the generic ImportRoutineData
// shape so it flows through the same importer/preview as a hand-pasted JSON routine.

import { MS_FOUNDATIONS_PRESET } from '../data/msFoundationsPreset';

export function msFoundationsAsImportData(): ImportRoutineData {
  return {
    name: MS_FOUNDATIONS_PRESET.name,
    notes: MS_FOUNDATIONS_PRESET.notes,
    isPreset: true,
    days: MS_FOUNDATIONS_PRESET.days.map(d => ({
      dayNumber: d.day, // 0-6 — importer accepts both 0-6 and 1-7
      name: d.label,
      modality: d.modality,
      targetDurationMin: d.targetDurationMin,
      targetIntensityRPE: d.targetIntensityRPE,
      targetHRPctMax: d.targetHRPctMax,
      notes: d.notes,
      exercises: (d.exercises ?? []).map(e => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps, // string like "8-15" — accepted by the new reps?: number|string field
        unilateral: e.unilateral,
        notes: e.notes,
      })),
    })),
  };
}

// ─── Exercise name matching + inference ─────────────────────────────────────

// Normalize an exercise name for fuzzy comparison: lowercase, strip parens,
// collapse whitespace, drop common equipment prefixes/suffixes.
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchExercise(query: string, exercises: Exercise[]): Exercise | undefined {
  const target = normalize(query);
  if (!target) return undefined;
  // 1. exact normalized match against name or baseName
  for (const ex of exercises) {
    if (normalize(ex.name) === target) return ex;
    if (ex.baseName && normalize(ex.baseName) === target) return ex;
  }
  // 2. contains-both-ways: target is a substring of name, or name is a substring of target
  for (const ex of exercises) {
    const n = normalize(ex.name);
    if (n.includes(target) || target.includes(n)) return ex;
  }
  // 3. token overlap: all tokens of target appear in name
  const tokens = target.split(' ').filter(t => t.length > 2);
  if (tokens.length === 0) return undefined;
  for (const ex of exercises) {
    const n = normalize(ex.name);
    if (tokens.every(t => n.includes(t))) return ex;
  }
  return undefined;
}

// Infer equipment from the exercise name. Conservative — defaults to 'machine'
// for generic names that don't match a known keyword.
export function inferEquipment(name: string): Equipment {
  const n = name.toLowerCase();
  if (n.includes('cable')) return 'cable';
  if (n.includes('smith')) return 'smith_machine';
  if (n.includes('dumbbell') || /\bdb\b/.test(n)) return 'dumbbell';
  if (n.includes('barbell') || /\bbb\b/.test(n)) return 'barbell';
  if (n.includes('kettlebell') || /\bkb\b/.test(n)) return 'kettlebell';
  if (n.includes('band')) return 'resistance_band';
  if (n.includes('landmine')) return 'landmine';
  if (n.includes('trap bar')) return 'trap_bar';
  if (n.includes('bodyweight') || /\bbw\b/.test(n)) return 'bodyweight';
  if (n.includes('machine')) return 'machine';
  // Many compound lifts default to barbell; we'd rather not guess so leave 'machine'.
  return 'machine';
}

// Infer primary muscle groups from common name keywords.
// Returns at least one entry; falls back to 'miscellaneous'.
export function inferMuscleGroups(name: string): PrimaryMuscleGroup[] {
  const n = name.toLowerCase();
  const muscles = new Set<PrimaryMuscleGroup>();

  // Legs
  if (/\b(squat|hack|leg press|lunge|v[- ]squat)\b/.test(n)) muscles.add('quads');
  if (/\b(leg curl|hamstring|rdl|romanian|deadlift|good morning)\b/.test(n)) muscles.add('hamstrings');
  if (/\b(glute|hip thrust|abduction|adduction|kickback)\b/.test(n)) muscles.add('glutes');
  if (/\b(calf|calves)\b/.test(n)) muscles.add('calves');
  if (/\bleg extension\b/.test(n)) muscles.add('quads');

  // Back
  if (/\b(lat pulldown|pulldown|pull[- ]over|pullover)\b/.test(n)) muscles.add('lats');
  if (/\b(row|face pull|rear delt|y[- ]raise|reverse fly)\b/.test(n)) muscles.add('upper_back');
  if (/\b(back extension|hyperextension)\b/.test(n)) muscles.add('lower_back');
  if (/\b(shrug|trap)\b/.test(n)) muscles.add('traps');

  // Chest
  if (/\b(bench|chest press|pec|fly|crossover|push[- ]?up|dip)\b/.test(n)) muscles.add('chest');

  // Shoulders
  if (/\b(overhead press|shoulder press|military|ohp)\b/.test(n)) muscles.add('front_delts');
  if (/\b(lateral raise|side raise|side lateral)\b/.test(n)) muscles.add('side_delts');

  // Arms
  if (/\b(curl|bicep)\b/.test(n)) muscles.add('biceps');
  if (/\b(tricep|pushdown|pulldown.*tricep|extension)\b/.test(n) && !/\bleg\b/.test(n) && !/\bback\b/.test(n)) {
    muscles.add('triceps');
  }

  // Core
  if (/\b(crunch|sit[- ]?up|ab |abs|plank|cable woodchop|rotation|torso)\b/.test(n)) muscles.add('abs');

  if (muscles.size === 0) muscles.add('miscellaneous');
  return Array.from(muscles);
}

// ─── Preview ────────────────────────────────────────────────────────────────

export function buildPreview(
  data: ImportRoutineData,
  exercises: Exercise[],
): ImportPreview {
  return {
    routineName: data.name,
    notes: data.notes,
    days: data.days.map(day => ({
      dayNumber: day.dayNumber,
      name: day.name ?? `Day ${day.dayNumber}`,
      locationName: day.location,
      modality: day.modality,
      targetDurationMin: day.targetDurationMin,
      targetIntensityRPE: day.targetIntensityRPE,
      targetHRPctMax: day.targetHRPctMax,
      notes: day.notes,
      exercises: day.exercises.map(e => {
        const match = matchExercise(e.name, exercises);
        return {
          name: e.name,
          sets: e.sets ?? 3,
          reps: e.reps,
          unilateral: e.unilateral === true || !!match?.isUnilateral,
          matched: !!match,
          inferredEquipment: match?.equipment ?? inferEquipment(e.name),
          inferredMuscles:
            match?.primaryMuscleGroups ??
            (match?.primaryMuscleGroup ? [match.primaryMuscleGroup] : inferMuscleGroups(e.name)),
        };
      }),
    })),
  };
}

// ─── Import (write) ─────────────────────────────────────────────────────────

export interface ImportContext {
  exercises: Exercise[];
  locations: { id: string; name: string }[];
  addExercise: (exercise: Exercise) => Promise<void>;
  addTemplate: (template: Template) => Promise<void>;
  addRoutine: (routine: Routine) => Promise<void>;
}

function chooseTemplateType(muscles: Set<PrimaryMuscleGroup>): TemplateType {
  // Heuristic: routine days that hit many groups are full body; otherwise pick the dominant pattern.
  if (muscles.size === 0) return 'full_body';
  const hasUpperPush = muscles.has('chest') || muscles.has('front_delts') || muscles.has('triceps');
  const hasUpperPull = muscles.has('lats') || muscles.has('upper_back') || muscles.has('biceps');
  const hasLower = muscles.has('quads') || muscles.has('hamstrings') || muscles.has('glutes') || muscles.has('calves');
  const tally = [hasUpperPush, hasUpperPull, hasLower].filter(Boolean).length;
  if (tally >= 3) return 'full_body';
  if (hasLower && !hasUpperPush && !hasUpperPull) return 'lower';
  if (hasUpperPush && !hasUpperPull) return 'push';
  if (hasUpperPull && !hasUpperPush) return 'pull';
  return 'full_body';
}

function matchLocation(
  hint: string | undefined,
  locations: { id: string; name: string }[],
): string {
  if (hint) {
    const lower = hint.toLowerCase();
    // Try name contains
    const byName = locations.find(l => l.name.toLowerCase().includes(lower) || lower.includes(l.name.toLowerCase()));
    if (byName) return byName.id;
    // Common Planet Fitness → gym
    if (lower.includes('planet') || lower.includes('gym')) {
      const gym = locations.find(l => l.id === 'gym') ?? locations[0];
      if (gym) return gym.id;
    }
    if (lower.includes('home')) {
      const home = locations.find(l => l.id === 'home') ?? locations[0];
      if (home) return home.id;
    }
  }
  return locations[0]?.id ?? 'gym';
}

export async function importRoutine(
  data: ImportRoutineData,
  ctx: ImportContext,
): Promise<ImportResult> {
  // Work against an in-memory copy of exercises so freshly-created ones can be
  // reused within the same import (e.g., two days both reference the same new lift).
  const exercisesPool: Exercise[] = [...ctx.exercises];
  let exercisesCreated = 0;
  let exercisesMatched = 0;
  let templatesCreated = 0;

  // Routine takes 7 day slots; default all to rest.
  const daySchedule: RoutineDaySchedule[] = Array.from({ length: 7 }, (_, day) => ({
    day,
    templateIds: [],
    dayType: 'rest' as const,
  }));

  // Helper: map an inbound dayNumber to the internal 0=Sun..6=Sat index.
  // Accepts both 1=Mon..7=Sun (the brief's convention) and 0=Sun..6=Sat directly.
  const toInternalDay = (n: number): number => {
    if (n >= 0 && n <= 6) return n;
    if (n === 7) return 0;
    return n; // out of range — caller already validated
  };

  // dayType derived from modality so old screens that read dayType still work.
  const modalityToDayType = (m: Modality | undefined): 'workout' | 'cardio' | 'active_recovery' | 'rest' => {
    switch (m) {
      case 'aerobic': return 'cardio';
      case 'recovery': return 'rest';
      case 'balance':
      case 'strength':
      default:
        return 'workout';
    }
  };

  for (const day of data.days) {
    const internalDay = toInternalDay(day.dayNumber);
    const locationId = matchLocation(day.location, ctx.locations);
    const modality: Modality | undefined = day.modality;

    // Days with no exercises (pure recovery or pure aerobic with only a target)
    // still get a routine-day entry so the home screen shows the target/notes.
    if (day.exercises.length === 0) {
      daySchedule[internalDay] = {
        day: internalDay,
        templateIds: [],
        dayType: modalityToDayType(modality),
        modality,
        targetDurationMin: day.targetDurationMin,
        targetIntensityRPE: day.targetIntensityRPE,
        targetHRPctMax: day.targetHRPctMax,
        notes: day.notes,
      };
      continue;
    }

    const exerciseIds: string[] = [];
    const musclesForType = new Set<PrimaryMuscleGroup>();

    for (const item of day.exercises) {
      let exercise = matchExercise(item.name, exercisesPool);
      if (exercise) {
        exercisesMatched += 1;
      } else {
        const equipment = inferEquipment(item.name);
        const muscles = inferMuscleGroups(item.name);
        const baseName = item.name.trim();
        const newExercise: Exercise = {
          id: generateId(),
          baseName,
          name: baseName, // populated below via getExerciseDisplayName
          equipment,
          primaryMuscleGroups: muscles,
          locationIds: locationId === 'home' ? ['home', 'gym'] : ['gym'],
          isUnilateral: item.unilateral ? true : undefined,
          notes: item.notes,
          isCustom: true,
        };
        newExercise.name = getExerciseDisplayName(newExercise);
        await ctx.addExercise(newExercise);
        exercisesPool.push(newExercise);
        exercise = newExercise;
        exercisesCreated += 1;
      }

      // If the user marked unilateral and the matched exercise wasn't, leave it alone —
      // we don't want to silently mutate an existing library entry on import.
      exerciseIds.push(exercise.id);
      const primaries = exercise.primaryMuscleGroups ?? (exercise.primaryMuscleGroup ? [exercise.primaryMuscleGroup] : []);
      primaries.forEach(m => musclesForType.add(m));
    }

    const template: Template = {
      id: generateId(),
      name: day.name ? `${data.name} — ${day.name}` : `${data.name} — Day ${day.dayNumber}`,
      type: chooseTemplateType(musclesForType),
      locationId,
      exerciseIds,
      modality,
    };
    await ctx.addTemplate(template);
    templatesCreated += 1;

    daySchedule[internalDay] = {
      day: internalDay,
      templateIds: [template.id],
      dayType: modalityToDayType(modality),
      modality,
      targetDurationMin: day.targetDurationMin,
      targetIntensityRPE: day.targetIntensityRPE,
      targetHRPctMax: day.targetHRPctMax,
      notes: day.notes,
    };
  }

  const routine: Routine = {
    id: generateId(),
    name: data.name,
    daySchedule,
    isActive: false, // Don't auto-activate — let the user decide from Routines screen
    isPreset: data.isPreset,
    notes: data.notes,
  };
  await ctx.addRoutine(routine);

  return { routine, templatesCreated, exercisesCreated, exercisesMatched };
}
