/**
 * Built-in MS Foundations preset routine.
 *
 * Tuned for mild-to-moderate MS (walking independently). Two strength + balance
 * days, two aerobic days, optional Saturday aerobic, full Sunday rest. The
 * clinical notes below are intentionally part of the routine — they're the
 * difference between safe practice and a symptom flare.
 *
 * Loaded into a user's account from the Import Routine screen (or the
 * Routines screen "Suggested" section) and stored as a regular Routine with
 * `isPreset: true`. Modifying a preset clones it into a user-owned copy.
 */

import { Modality } from '../types';

// We keep MSExercise as a plain shape rather than the app's full Exercise so
// the preset stays self-contained — the loader resolves/creates Exercises by
// fuzzy name match the same way the JSON routine importer does.
export interface MSExercise {
  name: string;
  sets: number;
  reps: string; // string because the spec uses ranges like "8-15"
  notes?: string;
  unilateral?: boolean;
}

export interface MSDay {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  label: string;
  modality: Modality;
  exercises?: MSExercise[];
  // Aerobic targets
  targetDurationMin?: number;
  targetIntensityRPE?: number;
  targetHRPctMax?: number;
  notes?: string;
}

export const MS_FOUNDATIONS_SCALING_NOTE =
  'Scaling: if more fatigue-limited, drop to 2 sessions/week, do everything ' +
  'seated, break aerobic into 10-min chunks, lean on pool work.';

export const MS_FOUNDATIONS_HEAT_NOTE =
  'Exercise in a cool room, hydrate, and manage heat — overheating can flare ' +
  'symptoms. Some fatigue is normal and improves over time. If symptoms spike ' +
  'for >24h after a session, that session was too hard — reduce next time.';

export const MS_FOUNDATIONS_PRESET: { name: string; notes: string; days: MSDay[] } = {
  name: 'MS Foundations',
  notes:
    'Mild-to-moderate MS, walking independently. Strength + balance Mon/Thu, ' +
    'aerobic Tue/Fri, Sat optional aerobic (prefer pool). ' +
    MS_FOUNDATIONS_HEAT_NOTE +
    ' ' +
    MS_FOUNDATIONS_SCALING_NOTE,
  days: [
    {
      day: 0,
      label: 'Sunday — Full Rest',
      modality: 'recovery',
      notes: 'Full rest.',
    },
    {
      day: 1,
      label: 'Monday — Strength A + Balance',
      modality: 'strength',
      notes:
        '1–2 sets x 8–15 reps, ~2 min rest, machines/bands preferred. Finish ' +
        'with 5 min balance (tandem stance, single-leg holds).',
      exercises: [
        { name: 'Leg Press', sets: 2, reps: '8-15', notes: 'or Sit-to-Stand' },
        { name: 'Chest Press', sets: 2, reps: '8-15' },
        { name: 'Seated Row', sets: 2, reps: '8-15' },
        { name: 'Machine Seated Leg Curl', sets: 2, reps: '8-15' },
        { name: 'Standing Calf Raise', sets: 2, reps: '10-15' },
        { name: 'Machine Crunch', sets: 1, reps: '10-15', notes: 'light core' },
        { name: 'Tandem Stance Balance', sets: 2, reps: '30s' },
        { name: 'Single-Leg Stance', sets: 2, reps: '20s', unilateral: true },
      ],
    },
    {
      day: 2,
      label: 'Tuesday — Aerobic',
      modality: 'aerobic',
      targetDurationMin: 25,
      targetIntensityRPE: 12,
      targetHRPctMax: 65,
      notes:
        '20–30 min @ 60–70% HRmax / RPE 11–13. Bike, recumbent bike, or brisk ' +
        'walk. Talk-but-not-sing pace. ' +
        MS_FOUNDATIONS_HEAT_NOTE,
    },
    {
      day: 3,
      label: 'Wednesday — Recovery',
      modality: 'recovery',
      notes: 'Rest or gentle stretching / yoga.',
    },
    {
      day: 4,
      label: 'Thursday — Strength B + Balance',
      modality: 'strength',
      notes:
        '1–2 sets x 8–15 reps, ~2 min rest. Vary exercises from Monday. Finish ' +
        'with 5 min balance.',
      exercises: [
        { name: 'Cable Wide-Grip Lat Pulldown', sets: 2, reps: '8-15' },
        { name: 'Machine Seated Leg Extension', sets: 2, reps: '8-15' },
        { name: 'Glute Bridge', sets: 2, reps: '10-15' },
        { name: 'Machine ISO Lateral Shoulder Press', sets: 2, reps: '8-12' },
        { name: 'Standing Calf Raise', sets: 2, reps: '10-15' },
        { name: 'Machine Back Extension', sets: 1, reps: '10-15' },
        { name: 'Tandem Stance Balance', sets: 2, reps: '30s' },
        { name: 'Single-Leg Stance', sets: 2, reps: '20s', unilateral: true },
      ],
    },
    {
      day: 5,
      label: 'Friday — Aerobic',
      modality: 'aerobic',
      targetDurationMin: 25,
      targetIntensityRPE: 12,
      targetHRPctMax: 65,
      notes:
        'Same as Tuesday. Progression: add 5 min or nudge intensity weekly. ' +
        MS_FOUNDATIONS_HEAT_NOTE,
    },
    {
      day: 6,
      label: 'Saturday — Optional Light Aerobic',
      modality: 'aerobic',
      targetDurationMin: 20,
      targetIntensityRPE: 11,
      notes:
        'Optional. Prefer swimming or water-based — keeps cool, unloads joints. ' +
        MS_FOUNDATIONS_HEAT_NOTE,
    },
  ],
};
