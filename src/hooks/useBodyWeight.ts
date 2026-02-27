import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { useData } from '../contexts/DataContext';
import { getCachedBodyWeight } from '../services/healthKitCache';

export type WeightSource = 'healthkit' | 'manual' | null;

interface BodyWeightResult {
  /** Weight in lbs (internal unit), or null if unavailable */
  weightLbs: number | null;
  /** Where the weight came from */
  source: WeightSource;
  /** ISO date string of the weight reading */
  date: string | null;
  /** Whether the hook is still loading HealthKit data */
  loading: boolean;
  /** Force a re-fetch from HealthKit (bypasses cache) */
  refresh: () => void;
}

export function useBodyWeight(): BodyWeightResult {
  const { getLatestBodyMeasurement, userSettings } = useData();
  const [hkWeight, setHkWeight] = useState<{ value: number; date: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  const sourcePreference = userSettings.bodyWeightSource ?? 'auto';

  useEffect(() => {
    if (sourcePreference === 'manual' || Platform.OS !== 'ios') {
      setHkWeight(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getCachedBodyWeight().then((result) => {
      if (!cancelled) {
        setHkWeight(result);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [sourcePreference, fetchKey]);

  const refresh = useCallback(() => {
    setFetchKey(k => k + 1);
  }, []);

  // Resolve final weight
  const manualMeasurement = getLatestBodyMeasurement();
  const manualWeight = manualMeasurement?.weight ?? null;
  const manualDate = manualMeasurement?.date ?? null;

  // Prefer HealthKit when in auto mode
  if (sourcePreference === 'auto' && hkWeight) {
    return {
      weightLbs: hkWeight.value,
      source: 'healthkit',
      date: hkWeight.date,
      loading,
      refresh,
    };
  }

  // Fallback to manual / DataContext body measurement
  return {
    weightLbs: manualWeight,
    source: manualWeight ? 'manual' : null,
    date: manualDate,
    loading,
    refresh,
  };
}
