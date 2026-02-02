/**
 * Unit conversion utilities.
 *
 * IMPORTANT: All data is stored internally in IMPERIAL (lbs, miles).
 * Conversion only happens at the display layer and input layer.
 * Never store converted values.
 */

export type UnitSystem = 'imperial' | 'metric';

// Conversion constants
const LBS_TO_KG = 0.453592;
const KG_TO_LBS = 2.20462;
const MILES_TO_KM = 1.60934;
const KM_TO_MILES = 0.621371;

/**
 * Convert weight for display.
 * Internal storage is always in lbs.
 */
export function displayWeight(lbs: number, units: UnitSystem): number {
  if (units === 'metric') {
    return Math.round(lbs * LBS_TO_KG * 10) / 10;
  }
  return lbs;
}

/**
 * Convert weight from user input to internal storage (lbs).
 */
export function inputToLbs(value: number, units: UnitSystem): number {
  if (units === 'metric') {
    return Math.round(value * KG_TO_LBS * 10) / 10;
  }
  return value;
}

/**
 * Convert distance for display.
 * Internal storage is always in miles.
 */
export function displayDistance(miles: number, units: UnitSystem): number {
  if (units === 'metric') {
    return Math.round(miles * MILES_TO_KM * 10) / 10;
  }
  return miles;
}

/**
 * Convert distance from user input to internal storage (miles).
 */
export function inputToMiles(value: number, units: UnitSystem): number {
  if (units === 'metric') {
    return Math.round(value * KM_TO_MILES * 10) / 10;
  }
  return value;
}

/**
 * Get the weight unit label.
 */
export function weightUnit(units: UnitSystem): string {
  return units === 'metric' ? 'kg' : 'lbs';
}

/**
 * Get the distance unit label.
 */
export function distanceUnit(units: UnitSystem): string {
  return units === 'metric' ? 'km' : 'mi';
}

/**
 * Format weight with unit for display.
 * e.g., "185 lbs" or "83.9 kg"
 */
export function formatWeight(lbs: number, units: UnitSystem): string {
  const value = displayWeight(lbs, units);
  const unit = weightUnit(units);
  // Remove unnecessary decimal for whole numbers
  const formatted = value % 1 === 0 ? value.toString() : value.toFixed(1);
  return `${formatted} ${unit}`;
}

/**
 * Format weight value only (no unit label).
 * Useful for input fields where the label is separate.
 */
export function formatWeightValue(lbs: number, units: UnitSystem): string {
  const value = displayWeight(lbs, units);
  return value % 1 === 0 ? value.toString() : value.toFixed(1);
}

/**
 * Standard weight increments for +/- buttons.
 */
export function weightIncrement(units: UnitSystem): number {
  return units === 'metric' ? 2.5 : 5;
}

/**
 * Small weight increment (for fine-tuning).
 */
export function smallWeightIncrement(units: UnitSystem): number {
  return units === 'metric' ? 1 : 2.5;
}

/**
 * Common plate weights for reference.
 */
export function commonPlates(units: UnitSystem): number[] {
  if (units === 'metric') {
    return [1.25, 2.5, 5, 10, 15, 20, 25];
  }
  return [2.5, 5, 10, 25, 35, 45];
}

/**
 * Estimated 1RM using Brzycki formula.
 * weight × (36 / (37 - reps))
 * Input weight should be in lbs (internal storage).
 */
export function estimated1RM(weightLbs: number, reps: number): number {
  if (reps <= 0 || reps > 36) return weightLbs;
  if (reps === 1) return weightLbs;
  return Math.round(weightLbs * (36 / (37 - reps)));
}
