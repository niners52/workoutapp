/**
 * Body Fat Calculator Service
 *
 * Calculates body fat percentage from skinfold caliper measurements
 * using standard formulas.
 */

import { BodyFatFormula, BiologicalSex } from '../types';

// Skinfold measurement sites (all values in mm)
export interface SkinfoldSites {
  chest?: number;
  midaxillary?: number;
  tricep?: number;
  bicep?: number;
  subscapular?: number;
  abdomen?: number;
  suprailiac?: number;
  thigh?: number;
  calf?: number;
}

export type SkinfoldSiteKey = keyof SkinfoldSites;

// Site labels and measurement instructions
export const SKINFOLD_SITE_INFO: Record<SkinfoldSiteKey, { label: string; instruction: string }> = {
  chest: {
    label: 'Chest',
    instruction: 'Diagonal fold halfway between the armpit crease and nipple (men), or 1/3 of the way from the armpit crease to the nipple (women)',
  },
  midaxillary: {
    label: 'Midaxillary',
    instruction: 'Vertical fold on the midaxillary line at the level of the xiphoid process (bottom of sternum)',
  },
  tricep: {
    label: 'Tricep',
    instruction: 'Vertical fold on the back of the upper arm, halfway between the shoulder and elbow',
  },
  bicep: {
    label: 'Bicep',
    instruction: 'Vertical fold on the front of the upper arm, halfway between the shoulder and elbow',
  },
  subscapular: {
    label: 'Subscapular',
    instruction: 'Diagonal fold just below the bottom tip of the shoulder blade',
  },
  abdomen: {
    label: 'Abdomen',
    instruction: 'Vertical fold 1 inch (2.5cm) to the right of the navel',
  },
  suprailiac: {
    label: 'Suprailiac',
    instruction: 'Diagonal fold just above the hip bone on the midaxillary line',
  },
  thigh: {
    label: 'Thigh',
    instruction: 'Vertical fold on the front of the thigh, halfway between the hip and knee',
  },
  calf: {
    label: 'Calf',
    instruction: 'Vertical fold on the inside of the calf at the point of largest circumference',
  },
};

// Which sites are required for each formula
export function getRequiredSites(formula: BodyFatFormula, sex: BiologicalSex): SkinfoldSiteKey[] {
  switch (formula) {
    case 'jp3':
      return sex === 'male'
        ? ['chest', 'abdomen', 'thigh']
        : ['tricep', 'suprailiac', 'thigh'];
    case 'jp7':
      return ['chest', 'midaxillary', 'tricep', 'subscapular', 'abdomen', 'suprailiac', 'thigh'];
    case 'dw4':
      return ['bicep', 'tricep', 'subscapular', 'suprailiac'];
    case 'parillo9':
      return ['chest', 'tricep', 'bicep', 'subscapular', 'abdomen', 'suprailiac', 'thigh', 'calf', 'midaxillary'];
    default:
      return [];
  }
}

// Calculate body density using the selected formula
function calculateBodyDensity(
  formula: BodyFatFormula,
  sex: BiologicalSex,
  age: number,
  sites: SkinfoldSites
): number {
  switch (formula) {
    case 'jp3': {
      if (sex === 'male') {
        const sum = (sites.chest || 0) + (sites.abdomen || 0) + (sites.thigh || 0);
        return 1.10938 - (0.0008267 * sum) + (0.0000016 * sum * sum) - (0.0002574 * age);
      } else {
        const sum = (sites.tricep || 0) + (sites.suprailiac || 0) + (sites.thigh || 0);
        return 1.0994921 - (0.0009929 * sum) + (0.0000023 * sum * sum) - (0.0001392 * age);
      }
    }

    case 'jp7': {
      const sum = (sites.chest || 0) + (sites.midaxillary || 0) + (sites.tricep || 0) +
                  (sites.subscapular || 0) + (sites.abdomen || 0) + (sites.suprailiac || 0) + (sites.thigh || 0);
      if (sex === 'male') {
        return 1.112 - (0.00043499 * sum) + (0.00000055 * sum * sum) - (0.00028826 * age);
      } else {
        return 1.097 - (0.00046971 * sum) + (0.00000056 * sum * sum) - (0.00012828 * age);
      }
    }

    case 'dw4': {
      const sum = (sites.bicep || 0) + (sites.tricep || 0) + (sites.subscapular || 0) + (sites.suprailiac || 0);
      const logSum = Math.log10(sum);
      if (sex === 'male') {
        if (age < 20) return 1.1533 - (0.0643 * logSum);
        if (age < 30) return 1.1620 - (0.0630 * logSum);
        if (age < 40) return 1.1631 - (0.0632 * logSum);
        if (age < 50) return 1.1422 - (0.0544 * logSum);
        return 1.1715 - (0.0779 * logSum);
      } else {
        if (age < 20) return 1.1549 - (0.0678 * logSum);
        if (age < 30) return 1.1599 - (0.0717 * logSum);
        if (age < 40) return 1.1423 - (0.0632 * logSum);
        if (age < 50) return 1.1333 - (0.0612 * logSum);
        return 1.1339 - (0.0645 * logSum);
      }
    }

    case 'parillo9': {
      // Parillo method uses a different calculation - handled separately
      return 0;
    }

    default:
      return 1.0;
  }
}

// Siri equation: convert body density to body fat percentage
function siriEquation(bodyDensity: number): number {
  return (495 / bodyDensity) - 450;
}

// Result types
export interface BodyFatResult {
  percentage: number;
  method: string;
}

export interface BodyFatError {
  error: string;
}

// Main calculation function
export function calculateBodyFat(
  formula: BodyFatFormula,
  sex: BiologicalSex,
  age: number,
  sites: SkinfoldSites,
  bodyWeightLbs?: number
): BodyFatResult | BodyFatError {
  // Validate required sites are present
  const required = getRequiredSites(formula, sex);
  const missing = required.filter(site => !sites[site] || sites[site]! <= 0);
  if (missing.length > 0) {
    return { error: `Missing measurements: ${missing.map(s => SKINFOLD_SITE_INFO[s].label).join(', ')}` };
  }

  // Parillo uses a different calculation method
  if (formula === 'parillo9') {
    if (!bodyWeightLbs || bodyWeightLbs <= 0) {
      return { error: 'Body weight is required for the Parillo formula' };
    }
    const sum = (sites.chest || 0) + (sites.tricep || 0) + (sites.bicep || 0) +
                (sites.subscapular || 0) + (sites.abdomen || 0) + (sites.suprailiac || 0) +
                (sites.thigh || 0) + (sites.calf || 0) + (sites.midaxillary || 0);
    const percentage = (sum * 27) / bodyWeightLbs;
    return {
      percentage: Math.round(percentage * 10) / 10,
      method: 'Parillo 9-Site',
    };
  }

  // All other formulas use body density -> Siri equation
  const bodyDensity = calculateBodyDensity(formula, sex, age, sites);
  const percentage = siriEquation(bodyDensity);

  const methodNames: Record<BodyFatFormula, string> = {
    jp3: 'Jackson-Pollock 3-Site',
    jp7: 'Jackson-Pollock 7-Site',
    dw4: 'Durnin-Womersley 4-Site',
    parillo9: 'Parillo 9-Site',
  };

  return {
    percentage: Math.round(percentage * 10) / 10,
    method: methodNames[formula],
  };
}

// Check if result is an error
export function isBodyFatError(result: BodyFatResult | BodyFatError): result is BodyFatError {
  return 'error' in result;
}

// Formula descriptions for settings UI
export const FORMULA_DESCRIPTIONS: Record<BodyFatFormula, { name: string; description: string; sites: string }> = {
  jp3: {
    name: 'Jackson-Pollock 3-Site',
    description: 'Most popular formula. Quick and reliable for most people.',
    sites: 'Men: chest, abdomen, thigh. Women: tricep, suprailiac, thigh',
  },
  jp7: {
    name: 'Jackson-Pollock 7-Site',
    description: 'Most thorough and accurate. Takes more time but reduces measurement error.',
    sites: 'Chest, midaxillary, tricep, subscapular, abdomen, suprailiac, thigh',
  },
  dw4: {
    name: 'Durnin-Womersley 4-Site',
    description: 'Good general-purpose formula. Uses easily accessible sites.',
    sites: 'Bicep, tricep, subscapular, suprailiac',
  },
  parillo9: {
    name: 'Parillo 9-Site',
    description: 'Popular in bodybuilding. Requires body weight. Uses all major sites.',
    sites: 'Chest, tricep, bicep, subscapular, abdomen, suprailiac, thigh, calf, midaxillary',
  },
};

// All formulas as array for picker
export const ALL_FORMULAS: BodyFatFormula[] = ['jp3', 'jp7', 'dw4', 'parillo9'];

// Calculate age from birth year
export function calculateAge(birthYear: number): number {
  const today = new Date();
  return today.getFullYear() - birthYear;
}
