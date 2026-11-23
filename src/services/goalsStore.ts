/**
 * Reads the goals table, keeping the last good copy on the phone so the card
 * still shows offline. Goals are seeded and edited in the cloud.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Goal } from '../types';
import { goalFromRow } from './goals';
import { supabase } from './supabase';

const CACHE_KEY = '@workout_tracker/goals_cache_v1';

export async function getCachedGoals(): Promise<Goal[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Goal[]) : [];
  } catch {
    return [];
  }
}

/** Fresh from the cloud when reachable, else the cached copy. */
export async function loadGoals(): Promise<Goal[]> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return getCachedGoals();
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error || !data) return getCachedGoals();
    const goals = data.map(goalFromRow);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(goals)).catch(() => {});
    return goals;
  } catch {
    return getCachedGoals();
  }
}
