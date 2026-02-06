import { supabase } from './supabase';
import {
  Partnership,
  InviteCode,
  PartnerStats,
  PartnershipStatus,
} from '../types';

// ==================== HELPERS ====================

/**
 * Get current authenticated user ID
 */
async function getUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

/**
 * Generate a random 6-character alphanumeric code
 */
function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars (0, O, 1, I)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Convert database row to Partnership type
 */
function rowToPartnership(row: any): Partnership {
  return {
    id: row.id,
    userId1: row.user_id_1,
    userId2: row.user_id_2,
    createdAt: row.created_at,
    status: row.status as PartnershipStatus,
    initiatedBy: row.initiated_by,
  };
}

/**
 * Convert database row to InviteCode type
 */
function rowToInviteCode(row: any): InviteCode {
  return {
    id: row.id,
    userId: row.user_id,
    code: row.code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedBy: row.used_by,
    usedAt: row.used_at,
  };
}

// ==================== INVITE CODES ====================

/**
 * Generate a new invite code for the current user.
 * Returns the code string on success, null on failure.
 */
export async function generateInviteCode(): Promise<string | null> {
  const userId = await getUserId();
  if (!userId) {
    console.log('[partnershipService] No user logged in');
    return null;
  }

  // Check if user already has an active partnership
  const existingPartnership = await getActivePartnership();
  if (existingPartnership) {
    console.log('[partnershipService] User already has a partner');
    return null;
  }

  // Invalidate any existing unused codes for this user
  await supabase
    .from('invite_codes')
    .update({ expires_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_by', null);

  // Generate a unique code (retry if collision)
  let code = generateRandomCode();
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const { error } = await supabase
      .from('invite_codes')
      .insert({
        user_id: userId,
        code,
      });

    if (!error) {
      return code;
    }

    // If unique constraint violation, try a new code
    if (error.code === '23505') {
      code = generateRandomCode();
      attempts++;
    } else {
      console.error('[partnershipService] Error generating code:', error);
      return null;
    }
  }

  console.error('[partnershipService] Failed to generate unique code after retries');
  return null;
}

/**
 * Get the current user's active invite code (if any)
 */
export async function getMyInviteCode(): Promise<InviteCode | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('user_id', userId)
    .is('used_by', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return rowToInviteCode(data);
}

/**
 * Validate an invite code and return creator info.
 */
export async function validateInviteCode(code: string): Promise<{
  valid: boolean;
  userId?: string;
  displayName?: string;
  error?: string;
}> {
  const userId = await getUserId();
  if (!userId) {
    return { valid: false, error: 'Not logged in' };
  }

  const normalizedCode = code.toUpperCase().trim();

  // Look up the code
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('code', normalizedCode)
    .is('used_by', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) {
    return { valid: false, error: 'Invalid or expired code' };
  }

  // Can't accept your own code
  if (data.user_id === userId) {
    return { valid: false, error: "You can't use your own code" };
  }

  // Check if code creator already has a partner
  const creatorPartnership = await getActivePartnershipForUser(data.user_id);
  if (creatorPartnership) {
    return { valid: false, error: 'This person already has a partner' };
  }

  // Check if current user already has a partner
  const myPartnership = await getActivePartnership();
  if (myPartnership) {
    return { valid: false, error: 'You already have a partner' };
  }

  // Get creator's display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('user_id', data.user_id)
    .single();

  return {
    valid: true,
    userId: data.user_id,
    displayName: profile?.display_name || 'Partner',
  };
}

/**
 * Accept an invite code and create a partnership.
 */
export async function acceptInviteCode(code: string): Promise<{
  success: boolean;
  partnership?: Partnership;
  error?: string;
}> {
  const userId = await getUserId();
  if (!userId) {
    return { success: false, error: 'Not logged in' };
  }

  const normalizedCode = code.toUpperCase().trim();

  // Validate first
  const validation = await validateInviteCode(normalizedCode);
  if (!validation.valid || !validation.userId) {
    return { success: false, error: validation.error };
  }

  const partnerId = validation.userId;

  // Create the partnership
  const { data: partnershipData, error: partnershipError } = await supabase
    .from('partnerships')
    .insert({
      user_id_1: userId < partnerId ? userId : partnerId, // Consistent ordering
      user_id_2: userId < partnerId ? partnerId : userId,
      initiated_by: partnerId, // The code creator initiated
      status: 'active',
    })
    .select()
    .single();

  if (partnershipError) {
    console.error('[partnershipService] Error creating partnership:', partnershipError);
    return { success: false, error: 'Failed to create partnership' };
  }

  // Mark the invite code as used
  await supabase
    .from('invite_codes')
    .update({
      used_by: userId,
      used_at: new Date().toISOString(),
    })
    .eq('code', normalizedCode);

  return {
    success: true,
    partnership: rowToPartnership(partnershipData),
  };
}

// ==================== PARTNERSHIPS ====================

/**
 * Get the current user's active partnership (ONE partner limit)
 */
export async function getActivePartnership(): Promise<Partnership | null> {
  const userId = await getUserId();
  if (!userId) return null;

  return getActivePartnershipForUser(userId);
}

/**
 * Get active partnership for a specific user
 */
async function getActivePartnershipForUser(userId: string): Promise<Partnership | null> {
  const { data, error } = await supabase
    .from('partnerships')
    .select('*')
    .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (error || !data) return null;
  return rowToPartnership(data);
}

/**
 * Get the partner's user ID from a partnership
 */
export function getPartnerId(partnership: Partnership, myUserId: string): string {
  return partnership.userId1 === myUserId ? partnership.userId2 : partnership.userId1;
}

/**
 * Disconnect from current partner.
 * Sets partnership status to 'disconnected'.
 */
export async function disconnectPartner(partnershipId: string): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from('partnerships')
    .update({ status: 'disconnected' })
    .eq('id', partnershipId);

  if (error) {
    console.error('[partnershipService] Error disconnecting:', error);
    return false;
  }

  return true;
}

// ==================== PARTNER STATS ====================

/**
 * Get partner's stats for display
 */
export async function getPartnerStats(partnerId: string): Promise<PartnerStats | null> {
  // Get stats from partner_stats table
  const { data: stats, error: statsError } = await supabase
    .from('partner_stats')
    .select('*')
    .eq('user_id', partnerId)
    .single();

  // Get display name from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('user_id', partnerId)
    .single();

  if (statsError && statsError.code !== 'PGRST116') {
    // PGRST116 = no rows found (not an error, just no stats yet)
    console.error('[partnershipService] Error fetching partner stats:', statsError);
  }

  return {
    userId: partnerId,
    displayName: profile?.display_name || 'Partner',
    workoutStreak: stats?.workout_streak || 0,
    calorieStreak: stats?.calorie_streak || 0,
    lastWorkoutDate: stats?.last_workout_date || null,
    lastWorkoutType: stats?.last_workout_type || null,
    weeklySets: stats?.weekly_sets || 0,
    updatedAt: stats?.updated_at || new Date().toISOString(),
  };
}

/**
 * Update current user's partner stats.
 * Called after workout completion to sync stats to cloud.
 */
export async function updateMyStats(stats: {
  workoutStreak: number;
  calorieStreak: number;
  lastWorkoutDate?: string;
  lastWorkoutType?: string;
  weeklySets: number;
}): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const row = {
    user_id: userId,
    workout_streak: stats.workoutStreak,
    calorie_streak: stats.calorieStreak,
    last_workout_date: stats.lastWorkoutDate || null,
    last_workout_type: stats.lastWorkoutType || null,
    weekly_sets: stats.weeklySets,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('partner_stats')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    console.error('[partnershipService] Error updating stats:', error);
  }
}

/**
 * Check if user is authenticated (required for partner features)
 */
export async function isAuthenticated(): Promise<boolean> {
  const userId = await getUserId();
  return userId !== null;
}

/**
 * Sync partner stats after a workout completion.
 * This is a fire-and-forget function that updates last workout info.
 *
 * @param templateType - The type of workout completed (e.g., "Push", "Pull", "Lower")
 * @param setCount - Number of sets in the completed workout
 */
export async function syncPartnerStatsAfterWorkout(
  templateType: string | null,
  setCount: number
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  // Check if user has an active partnership
  const partnership = await getActivePartnership();
  if (!partnership) return; // No partner, skip sync

  try {
    // Get current stats to preserve streaks
    const { data: currentStats } = await supabase
      .from('partner_stats')
      .select('workout_streak, calorie_streak, weekly_sets')
      .eq('user_id', userId)
      .single();

    // Calculate weekly sets by adding new sets to existing
    // Note: This is a simple increment, not a precise weekly calculation
    const weeklySets = (currentStats?.weekly_sets || 0) + setCount;

    // Update stats
    await updateMyStats({
      workoutStreak: (currentStats?.workout_streak || 0) + 1, // Increment streak
      calorieStreak: currentStats?.calorie_streak || 0, // Preserve calorie streak
      lastWorkoutDate: new Date().toISOString().split('T')[0], // Today's date
      lastWorkoutType: templateType || 'Workout',
      weeklySets,
    });
  } catch (error) {
    console.error('[partnershipService] Error syncing stats after workout:', error);
  }
}
