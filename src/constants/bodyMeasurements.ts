// Bodybuilding body measurement types and instructions

export interface BodyMeasurementType {
  key: string;
  label: string;
  icon: string;
  pairWith?: string; // For paired measurements like left/right arm
}

export const BODY_MEASUREMENT_TYPES: BodyMeasurementType[] = [
  { key: 'neck', label: 'Neck', icon: '📏' },
  { key: 'shoulders', label: 'Shoulders', icon: '📏' },
  { key: 'chest', label: 'Chest', icon: '📏' },
  { key: 'left_arm', label: 'Left Arm', icon: '💪', pairWith: 'right_arm' },
  { key: 'right_arm', label: 'Right Arm', icon: '💪', pairWith: 'left_arm' },
  { key: 'left_forearm', label: 'Left Forearm', icon: '📏', pairWith: 'right_forearm' },
  { key: 'right_forearm', label: 'Right Forearm', icon: '📏', pairWith: 'left_forearm' },
  { key: 'waist', label: 'Waist', icon: '📏' },
  { key: 'hips', label: 'Hips', icon: '📏' },
  { key: 'left_thigh', label: 'Left Thigh', icon: '🦵', pairWith: 'right_thigh' },
  { key: 'right_thigh', label: 'Right Thigh', icon: '🦵', pairWith: 'left_thigh' },
  { key: 'left_calf', label: 'Left Calf', icon: '🦵', pairWith: 'right_calf' },
  { key: 'right_calf', label: 'Right Calf', icon: '🦵', pairWith: 'left_calf' },
];

export const MEASUREMENT_INSTRUCTIONS: Record<string, string> = {
  neck: 'Measure around the middle of your neck',
  shoulders: 'Measure around the widest point with arms at sides',
  chest: 'Measure around the widest part at nipple level',
  left_arm: 'Measure around the peak of your flexed bicep',
  right_arm: 'Measure around the peak of your flexed bicep',
  left_forearm: 'Measure around the thickest part',
  right_forearm: 'Measure around the thickest part',
  waist: 'Measure at the navel, relaxed',
  hips: 'Measure around the widest point of your glutes',
  left_thigh: 'Measure around the thickest part of your upper leg',
  right_thigh: 'Measure around the thickest part of your upper leg',
  left_calf: 'Measure around the thickest part',
  right_calf: 'Measure around the thickest part',
};

// Skinfold measurement types (for caliper body fat testing)
// Values stored in millimeters
export interface SkinfoldMeasurementType {
  key: string;
  label: string;
  instruction: string;
}

export const SKINFOLD_MEASUREMENT_TYPES: SkinfoldMeasurementType[] = [
  {
    key: 'skinfold_chest',
    label: 'Chest',
    instruction: 'Diagonal fold halfway between the armpit crease and nipple (men), or 1/3 of the way from the armpit crease to the nipple (women)',
  },
  {
    key: 'skinfold_midaxillary',
    label: 'Midaxillary',
    instruction: 'Vertical fold on the midaxillary line at the level of the xiphoid process (bottom of sternum)',
  },
  {
    key: 'skinfold_tricep',
    label: 'Tricep',
    instruction: 'Vertical fold on the back of the upper arm, halfway between the shoulder and elbow',
  },
  {
    key: 'skinfold_bicep',
    label: 'Bicep',
    instruction: 'Vertical fold on the front of the upper arm, halfway between the shoulder and elbow',
  },
  {
    key: 'skinfold_subscapular',
    label: 'Subscapular',
    instruction: 'Diagonal fold just below the bottom tip of the shoulder blade',
  },
  {
    key: 'skinfold_abdomen',
    label: 'Abdomen',
    instruction: 'Vertical fold 1 inch (2.5cm) to the right of the navel',
  },
  {
    key: 'skinfold_suprailiac',
    label: 'Suprailiac',
    instruction: 'Diagonal fold just above the hip bone on the midaxillary line',
  },
  {
    key: 'skinfold_thigh',
    label: 'Thigh',
    instruction: 'Vertical fold on the front of the thigh, halfway between the hip and knee',
  },
  {
    key: 'skinfold_calf',
    label: 'Calf',
    instruction: 'Vertical fold on the inside of the calf at the point of largest circumference',
  },
];

// Get skinfold measurement type config by key
export function getSkinfoldType(key: string): SkinfoldMeasurementType | undefined {
  return SKINFOLD_MEASUREMENT_TYPES.find(m => m.key === key);
}

// Check if a measurement key is a skinfold type
export function isSkinfoldMeasurement(key: string): boolean {
  return key.startsWith('skinfold_');
}

// Get measurement type config by key
export function getMeasurementType(key: string): BodyMeasurementType | undefined {
  return BODY_MEASUREMENT_TYPES.find(m => m.key === key);
}

// Check if a measurement is "good" when it increases (muscle growth)
// Waist is the exception - smaller is usually better
export function isIncreasePositive(key: string): boolean {
  return key !== 'waist';
}

// Group measurements for display (paired left/right on same row)
export interface MeasurementGroup {
  label: string;
  measurements: BodyMeasurementType[];
}

export function getGroupedMeasurements(): MeasurementGroup[] {
  return [
    { label: 'Upper Body', measurements: BODY_MEASUREMENT_TYPES.filter(m => ['neck', 'shoulders', 'chest'].includes(m.key)) },
    { label: 'Arms', measurements: BODY_MEASUREMENT_TYPES.filter(m => ['left_arm', 'right_arm', 'left_forearm', 'right_forearm'].includes(m.key)) },
    { label: 'Core', measurements: BODY_MEASUREMENT_TYPES.filter(m => ['waist', 'hips'].includes(m.key)) },
    { label: 'Legs', measurements: BODY_MEASUREMENT_TYPES.filter(m => ['left_thigh', 'right_thigh', 'left_calf', 'right_calf'].includes(m.key)) },
  ];
}
