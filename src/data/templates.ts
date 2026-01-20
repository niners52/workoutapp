import { Template } from '../types';

// Seed templates with all templates from the spec
export const SEED_TEMPLATES: Template[] = [
  // Gym Templates
  {
    id: 'push-gym',
    name: 'PUSH (Gym)',
    type: 'push',
    locationId: 'gym',
    exerciseIds: [
      'barbell-bench-press',
      'plate-loaded-incline-press',
      'machine-chest-press',
      'seated-lateral-raise',
      'overhead-triceps-extension-rope',
      'triceps-pushdown',
    ],
  },
  {
    id: 'pull-gym',
    name: 'PULL (Gym)',
    type: 'pull',
    locationId: 'gym',
    exerciseIds: [
      'wide-grip-lat-pulldown',
      'chest-supported-machine-row',
      'neutral-close-grip-pulldown',
      'face-pull',
      'preacher-curl',
      'cable-hammer-curl',
    ],
  },
  {
    id: 'legs-gym',
    name: 'LEGS (Gym)',
    type: 'lower',
    locationId: 'gym',
    exerciseIds: [
      'hack-squat',
      'leg-press',
      'seated-leg-extension',
      'seated-leg-curl',
      'hip-abduction-machine',
      'calf-raise-machine',
      'cable-machine-crunch',
      'back-extension',
    ],
  },

  // Home Templates
  {
    id: 'push-home',
    name: 'PUSH (Home)',
    type: 'push',
    locationId: 'home',
    exerciseIds: [
      'db-flat-low-incline-bench-press',
      'db-incline-bench-press',
      'seated-db-overhead-press',
      'seated-db-lateral-raise',
      'bench-dips',
      'db-overhead-triceps-extension',
    ],
  },
  {
    id: 'pull-home',
    name: 'PULL (Home)',
    type: 'pull',
    locationId: 'home',
    exerciseIds: [
      'chest-supported-db-row',
      'one-arm-db-row',
      'db-pullover',
      'incline-bench-rear-delt-db-fly',
      'db-hammer-curl',
      'incline-bench-db-curl',
    ],
  },
  {
    id: 'legs-home',
    name: 'LEGS (Home)',
    type: 'lower',
    locationId: 'home',
    exerciseIds: [
      'goblet-squat',
      'db-bulgarian-split-squat',
      'db-hip-thrust',
      'db-standing-calf-raise',
      'slant-board-tibialis-raise',
      'ab-roller-knee-raise',
    ],
  },
];

// Create a map for quick lookup by ID
export const TEMPLATE_MAP = new Map<string, Template>(
  SEED_TEMPLATES.map(t => [t.id, t])
);

// Get template by ID
export function getTemplateById(id: string): Template | undefined {
  return TEMPLATE_MAP.get(id);
}
