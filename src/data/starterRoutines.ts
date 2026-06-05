// Curated starter routines that can be loaded into the import screen with one tap.
// These mirror the JSON shape consumed by routineImport.ts so they can be parsed
// through the same code path as a hand-pasted import.

export const STARTER_ROUTINE_RETURN_WEEK_1 = {
  name: '6-Day Full Body - Return Week 1',
  notes: 'Returning after layoff. 60-75% weights. Elbow rehab protocol.',
  days: [
    {
      dayNumber: 1,
      name: 'Quad Emphasis',
      location: 'Planet Fitness',
      exercises: [
        { name: 'Hack Squat', sets: 3, reps: 8 },
        { name: 'Machine Seated Leg Curl', sets: 3, reps: 10 },
        { name: 'Machine Plate-Loaded Incline Press', sets: 3, reps: 8 },
        { name: 'Cable Close-Grip Pulldown (neutral)', sets: 3, reps: 10 },
        { name: 'Smith Machine Overhead Press', sets: 3, reps: 8 },
        { name: 'Hammer Curl (DB)', sets: 3, reps: 10 },
        { name: 'Machine Crunch', sets: 3, reps: 12 },
      ],
    },
    {
      dayNumber: 2,
      name: 'Hamstring/Glute Emphasis',
      location: 'Planet Fitness',
      exercises: [
        { name: 'Machine Seated Leg Extension', sets: 3, reps: 10 },
        { name: 'Laying or Seated Leg Curl', sets: 3, reps: 10 },
        { name: 'Cable Fly High to Low', sets: 3, reps: 10 },
        { name: 'Machine Seated Row', sets: 3, reps: 10 },
        { name: 'Machine ISO Lateral Shoulder Press', sets: 3, reps: 8 },
        { name: 'Cable Rope Tricep Pulldown', sets: 3, reps: 10 },
        { name: 'Machine Back Extension', sets: 3, reps: 10 },
      ],
    },
    {
      dayNumber: 3,
      name: 'Push Emphasis',
      location: 'Planet Fitness',
      exercises: [
        { name: 'Dumbbell Flat/Low-Incline Bench', sets: 3, reps: 8 },
        { name: 'Machine Pec Fly', sets: 3, reps: 10 },
        { name: 'Machine Leg Press', sets: 3, reps: 10 },
        { name: 'Single Leg Knee Curl', sets: 3, reps: 10, unilateral: true },
        { name: 'Cable Lateral Raise', sets: 4, reps: 10 },
        { name: 'Eccentric Cable Rope Bicep Curl', sets: 2, reps: 10 },
        { name: 'Cable Face Pull', sets: 3, reps: 12 },
      ],
    },
    {
      dayNumber: 4,
      name: 'Pull Emphasis',
      location: 'Planet Fitness',
      exercises: [
        { name: 'Cable Wide-Grip Lat Pulldown', sets: 3, reps: 8 },
        { name: 'Machine Seated Row', sets: 3, reps: 10 },
        { name: 'Machine V Squat', sets: 3, reps: 8 },
        { name: 'Cable Rope Pullover', sets: 3, reps: 10 },
        { name: 'Smith Machine Incline Bench', sets: 3, reps: 8 },
        { name: 'Cable Straight Bar Triceps Pushdown', sets: 3, reps: 10 },
        { name: 'Machine Hip Abduction Push Out', sets: 3, reps: 10 },
      ],
    },
    {
      dayNumber: 5,
      name: 'Mixed Lighter',
      location: 'Planet Fitness',
      exercises: [
        { name: 'Machine Hack Squat', sets: 3, reps: 8 },
        { name: 'Machine Seated Leg Curl', sets: 3, reps: 10 },
        { name: 'Machine Plate-Loaded Incline Press', sets: 3, reps: 8 },
        { name: 'Cable Neutral Pulldown', sets: 3, reps: 10 },
        { name: 'Cable Lateral Raise', sets: 4, reps: 10 },
        { name: 'Eccentric Cable Rope Bicep Curl', sets: 2, reps: 10 },
        { name: 'Machine Tricep Extension', sets: 3, reps: 10 },
      ],
    },
    {
      dayNumber: 6,
      name: 'Upper Emphasis',
      location: 'Vasa',
      exercises: [
        { name: 'V Squat', sets: 3, reps: 8 },
        { name: 'Laying Leg Curl', sets: 3, reps: 10 },
        { name: 'Glute Drive', sets: 3, reps: 10 },
        { name: 'Machine ISO Lateral Wide Pulldown', sets: 3, reps: 8 },
        { name: 'Machine Pullover', sets: 3, reps: 10 },
        { name: 'Machine ISO Lateral Shoulder Press', sets: 3, reps: 8 },
        { name: 'Lateral Raise Machine', sets: 3, reps: 10 },
        { name: 'Cable V Bar Tricep Pulldown', sets: 3, reps: 10 },
        { name: 'Hammer Curl', sets: 3, reps: 10 },
        { name: 'Machine Crunch', sets: 3, reps: 12 },
        { name: 'Standing Calf Raise', sets: 3, reps: 10 },
      ],
    },
  ],
};

export const STARTER_ROUTINES = [STARTER_ROUTINE_RETURN_WEEK_1];
