import { format, startOfWeek, endOfWeek, addDays, isAfter, parseISO } from 'date-fns';
import { supabase } from './supabase';
import { Challenge, ChallengeType, ChallengeStatus, Partnership } from '../types';
import { getPartnerId } from './partnershipService';

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
 * Convert database row to Challenge type
 */
function rowToChallenge(row: any): Challenge {
  return {
    id: row.id,
    partnershipId: row.partnership_id,
    type: row.type as ChallengeType,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as ChallengeStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
    winnerUserId: row.winner_user_id,
    user1Score: row.user_1_score || 0,
    user2Score: row.user_2_score || 0,
  };
}

// ==================== CHALLENGE CRUD ====================

/**
 * Create a new challenge.
 * Default duration is current week (Mon-Sun or Sun-Sat based on settings).
 */
export async function createChallenge(
  partnershipId: string,
  type: ChallengeType,
  weekStartsOnMonday: boolean = true
): Promise<Challenge | null> {
  const userId = await getUserId();
  if (!userId) return null;

  // Check for existing active/pending challenge
  const existing = await getActiveChallenge(partnershipId);
  if (existing) {
    console.log('[challengeService] Already has active challenge');
    return null;
  }

  // Calculate week dates
  const today = new Date();
  const weekStartsOn = weekStartsOnMonday ? 1 : 0; // 1 = Monday, 0 = Sunday
  const startDate = startOfWeek(today, { weekStartsOn });
  const endDate = endOfWeek(today, { weekStartsOn });

  const { data, error } = await supabase
    .from('challenges')
    .insert({
      partnership_id: partnershipId,
      type,
      start_date: format(startDate, 'yyyy-MM-dd'),
      end_date: format(endDate, 'yyyy-MM-dd'),
      status: 'pending',
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    console.error('[challengeService] Error creating challenge:', error);
    return null;
  }

  return rowToChallenge(data);
}

/**
 * Accept a pending challenge (sets status to 'active')
 */
export async function acceptChallenge(challengeId: string): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from('challenges')
    .update({ status: 'active' })
    .eq('id', challengeId)
    .eq('status', 'pending');

  if (error) {
    console.error('[challengeService] Error accepting challenge:', error);
    return false;
  }

  return true;
}

/**
 * Decline a pending challenge (sets status to 'declined')
 */
export async function declineChallenge(challengeId: string): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from('challenges')
    .update({ status: 'declined' })
    .eq('id', challengeId)
    .eq('status', 'pending');

  if (error) {
    console.error('[challengeService] Error declining challenge:', error);
    return false;
  }

  return true;
}

/**
 * Get active or pending challenge for a partnership
 */
export async function getActiveChallenge(partnershipId: string): Promise<Challenge | null> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('partnership_id', partnershipId)
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return rowToChallenge(data);
}

/**
 * Get challenge history for a partnership
 */
export async function getChallengeHistory(partnershipId: string): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('partnership_id', partnershipId)
    .eq('status', 'completed')
    .order('end_date', { ascending: false })
    .limit(20);

  if (error || !data) return [];
  return data.map(rowToChallenge);
}

// ==================== SCORE CALCULATION ====================

/**
 * Calculate scores for a challenge based on workout data.
 * Queries the workouts and workout_sets tables for the date range.
 */
export async function calculateScores(
  challenge: Challenge,
  partnership: Partnership
): Promise<{ user1Score: number; user2Score: number }> {
  const { startDate, endDate, type } = challenge;

  // Get workouts for both users in the date range
  const { data: workouts, error } = await supabase
    .from('workouts')
    .select('id, user_id, completed_at')
    .in('user_id', [partnership.userId1, partnership.userId2])
    .not('completed_at', 'is', null)
    .gte('completed_at', startDate)
    .lte('completed_at', `${endDate}T23:59:59`);

  if (error || !workouts) {
    console.error('[challengeService] Error fetching workouts:', error);
    return { user1Score: 0, user2Score: 0 };
  }

  if (type === 'most_workouts') {
    // Count completed workouts per user
    const user1Workouts = workouts.filter(w => w.user_id === partnership.userId1).length;
    const user2Workouts = workouts.filter(w => w.user_id === partnership.userId2).length;
    return { user1Score: user1Workouts, user2Score: user2Workouts };
  }

  if (type === 'most_sets') {
    // Count sets from workout_sets for these workouts
    const workoutIds = workouts.map(w => w.id);

    if (workoutIds.length === 0) {
      return { user1Score: 0, user2Score: 0 };
    }

    const { data: sets, error: setsError } = await supabase
      .from('workout_sets')
      .select('workout_id')
      .in('workout_id', workoutIds);

    if (setsError || !sets) {
      console.error('[challengeService] Error fetching sets:', setsError);
      return { user1Score: 0, user2Score: 0 };
    }

    // Map workout_id to user_id
    const workoutToUser = new Map(workouts.map(w => [w.id, w.user_id]));

    let user1Sets = 0;
    let user2Sets = 0;

    for (const set of sets) {
      const userId = workoutToUser.get(set.workout_id);
      if (userId === partnership.userId1) user1Sets++;
      else if (userId === partnership.userId2) user2Sets++;
    }

    return { user1Score: user1Sets, user2Score: user2Sets };
  }

  return { user1Score: 0, user2Score: 0 };
}

/**
 * Update challenge scores in the database
 */
export async function updateChallengeScores(
  challengeId: string,
  scores: { user1Score: number; user2Score: number }
): Promise<void> {
  const { error } = await supabase
    .from('challenges')
    .update({
      user_1_score: scores.user1Score,
      user_2_score: scores.user2Score,
    })
    .eq('id', challengeId);

  if (error) {
    console.error('[challengeService] Error updating scores:', error);
  }
}

/**
 * Process completed challenges.
 * Checks for challenges past their end date and marks them as completed.
 * Called on app launch or when viewing challenges.
 */
export async function processCompletedChallenges(partnershipId: string): Promise<void> {
  const today = format(new Date(), 'yyyy-MM-dd');

  // Get active challenges that have ended
  const { data: challenges, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('partnership_id', partnershipId)
    .eq('status', 'active')
    .lt('end_date', today);

  if (error || !challenges || challenges.length === 0) return;

  // Get partnership for score calculation
  const { data: partnership } = await supabase
    .from('partnerships')
    .select('*')
    .eq('id', partnershipId)
    .single();

  if (!partnership) return;

  for (const challengeRow of challenges) {
    const challenge = rowToChallenge(challengeRow);

    // Calculate final scores
    const scores = await calculateScores(challenge, {
      id: partnership.id,
      userId1: partnership.user_id_1,
      userId2: partnership.user_id_2,
      createdAt: partnership.created_at,
      status: partnership.status,
      initiatedBy: partnership.initiated_by,
    });

    // Determine winner
    let winnerUserId: string | null = null;
    if (scores.user1Score > scores.user2Score) {
      winnerUserId = partnership.user_id_1;
    } else if (scores.user2Score > scores.user1Score) {
      winnerUserId = partnership.user_id_2;
    }
    // If tied, winnerUserId stays null

    // Update challenge as completed
    await supabase
      .from('challenges')
      .update({
        status: 'completed',
        user_1_score: scores.user1Score,
        user_2_score: scores.user2Score,
        winner_user_id: winnerUserId,
      })
      .eq('id', challenge.id);
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get win/loss record for a user in a partnership
 */
export async function getWinLossRecord(
  partnershipId: string,
  userId: string
): Promise<{ wins: number; losses: number; ties: number }> {
  const { data, error } = await supabase
    .from('challenges')
    .select('winner_user_id')
    .eq('partnership_id', partnershipId)
    .eq('status', 'completed');

  if (error || !data) {
    return { wins: 0, losses: 0, ties: 0 };
  }

  let wins = 0;
  let losses = 0;
  let ties = 0;

  for (const challenge of data) {
    if (challenge.winner_user_id === null) {
      ties++;
    } else if (challenge.winner_user_id === userId) {
      wins++;
    } else {
      losses++;
    }
  }

  return { wins, losses, ties };
}

/**
 * Check if current user created the pending challenge
 */
export function didICreateChallenge(challenge: Challenge, myUserId: string): boolean {
  return challenge.createdBy === myUserId;
}

/**
 * Get days remaining in a challenge
 */
export function getDaysRemaining(challenge: Challenge): number {
  const today = new Date();
  const endDate = parseISO(challenge.endDate);

  if (isAfter(today, endDate)) return 0;

  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Determine if user is winning the challenge
 */
export function amIWinning(
  challenge: Challenge,
  partnership: Partnership,
  myUserId: string
): 'winning' | 'losing' | 'tied' {
  const myScore = partnership.userId1 === myUserId ? challenge.user1Score : challenge.user2Score;
  const theirScore = partnership.userId1 === myUserId ? challenge.user2Score : challenge.user1Score;

  if (myScore > theirScore) return 'winning';
  if (myScore < theirScore) return 'losing';
  return 'tied';
}
