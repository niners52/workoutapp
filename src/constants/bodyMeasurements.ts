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
