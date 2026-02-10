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
const INCHES_TO_CM = 2.54;
const CM_TO_INCHES = 0.393701;

/**
 * Convert weight for display.
 * Internal storage is always in lbs.
 */
export function displayWeight(lbs: number, units: UnitSystem): number {
  if (units === 'metric') {
    return Math.round(lbs * LBS_TO_KG * 100) / 100;
  }
  return Math.round(lbs * 100) / 100;
}

/**
 * Convert weight from user input to internal storage (lbs).
 */
export function inputToLbs(value: number, units: UnitSystem): number {
  if (units === 'metric') {
    return Math.round(value * KG_TO_LBS * 100) / 100;
  }
  return value;
}

/**
 * Convert distance for display.
 * Internal storage is always in miles.
 */
export function displayDistance(miles: number, units: UnitSystem): number {
  if (units === 'metric') {
    return Math.round(miles * MILES_TO_KM * 100) / 100;
  }
  return Math.round(miles * 100) / 100;
}

/**
 * Convert distance from user input to internal storage (miles).
 */
export function inputToMiles(value: number, units: UnitSystem): number {
  if (units === 'metric') {
    return Math.round(value * KM_TO_MILES * 100) / 100;
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
 * Format a number to up to 2 decimal places, stripping trailing zeros.
 * 200 → "200", 200.5 → "200.5", 200.25 → "200.25"
 */
function smartDecimal(value: number): string {
  return parseFloat(value.toFixed(2)).toString();
}

/**
 * Format weight with unit for display.
 * e.g., "185 lbs" or "83.9 kg"
 */
export function formatWeight(lbs: number, units: UnitSystem): string {
  const value = displayWeight(lbs, units);
  const unit = weightUnit(units);
  return `${smartDecimal(value)} ${unit}`;
}

/**
 * Format weight value only (no unit label).
 * Useful for input fields where the label is separate.
 */
export function formatWeightValue(lbs: number, units: UnitSystem): string {
  const value = displayWeight(lbs, units);
  return smartDecimal(value);
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

// ============== HEIGHT CONVERSIONS ==============

/**
 * Convert inches to feet and inches parts.
 * e.g., 70 inches -> { feet: 5, inches: 10 }
 */
export function inchesToFeetAndInches(totalInches: number): { feet: number; inches: number } {
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { feet, inches };
}

/**
 * Convert feet and inches to total inches.
 * e.g., 5 feet 10 inches -> 70 inches
 */
export function feetAndInchesToInches(feet: number, inches: number): number {
  return feet * 12 + inches;
}

/**
 * Convert inches to centimeters.
 */
export function inchesToCm(inches: number): number {
  return Math.round(inches * INCHES_TO_CM * 100) / 100;
}

/**
 * Convert centimeters to inches.
 */
export function cmToInches(cm: number): number {
  return Math.round(cm * CM_TO_INCHES * 100) / 100;
}

/**
 * Format height for display.
 * Imperial: 5'10" or "5 ft 10 in"
 * Metric: 178 cm
 */
export function formatHeight(inches: number, units: UnitSystem, compact: boolean = true): string {
  if (units === 'metric') {
    const cm = inchesToCm(inches);
    return `${Math.round(cm)} cm`;
  }
  const { feet, inches: remainingInches } = inchesToFeetAndInches(inches);
  if (compact) {
    return `${feet}'${remainingInches}"`;
  }
  return `${feet} ft ${remainingInches} in`;
}

/**
 * Convert height for display based on unit system.
 * Returns cm for metric, inches for imperial.
 */
export function displayHeight(inches: number, units: UnitSystem): number {
  if (units === 'metric') {
    return Math.round(inchesToCm(inches));
  }
  return inches;
}

/**
 * Convert height from user input to internal storage (inches).
 */
export function inputToInches(value: number, units: UnitSystem): number {
  if (units === 'metric') {
    return cmToInches(value);
  }
  return value;
}

/**
 * Get the height unit label.
 */
export function heightUnit(units: UnitSystem): string {
  return units === 'metric' ? 'cm' : 'in';
}

// ============== BODY MEASUREMENT CONVERSIONS ==============

/**
 * Convert body measurement (stored in inches) for display.
 * Returns cm for metric, inches for imperial.
 */
export function displayMeasurement(inches: number, units: UnitSystem): number {
  if (units === 'metric') {
    return Math.round(inches * INCHES_TO_CM * 100) / 100;
  }
  return Math.round(inches * 100) / 100;
}

/**
 * Convert body measurement from user input to internal storage (inches).
 */
export function measurementInputToInches(value: number, units: UnitSystem): number {
  if (units === 'metric') {
    return Math.round(value * CM_TO_INCHES * 100) / 100;
  }
  return value;
}

/**
 * Get the body measurement unit label.
 */
export function measurementUnit(units: UnitSystem): string {
  return units === 'metric' ? 'cm' : 'in';
}

/**
 * Format body measurement with unit for display.
 * e.g., "15.5 in" or "39.4 cm"
 */
export function formatMeasurement(inches: number, units: UnitSystem): string {
  const value = displayMeasurement(inches, units);
  return `${smartDecimal(value)} ${measurementUnit(units)}`;
}

// ============== VOLUME FORMATTING ==============

/**
 * Format volume (weight × reps total) for display.
 * Volume is stored in lbs, converted for metric.
 * e.g., "12,450 lbs" or "5,647 kg"
 */
export function formatVolume(volumeLbs: number, units: UnitSystem): string {
  let value: number;
  if (units === 'metric') {
    value = Math.round(volumeLbs * LBS_TO_KG);
  } else {
    value = Math.round(volumeLbs);
  }
  return `${value.toLocaleString()} ${weightUnit(units)}`;
}
