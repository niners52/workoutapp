import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card, Button } from '../components/common';
import { useWorkoutBarPadding } from '../components/workout';
import { useAuth } from '../contexts/AuthContext';
import { getActivePartnership, getPartnerId, getPartnerStats } from '../services/partnershipService';
import {
  createChallenge,
  acceptChallenge,
  declineChallenge,
  getActiveChallenge,
  getChallengeHistory,
  getWinLossRecord,
  getDaysRemaining,
  amIWinning,
  calculateScores,
  updateChallengeScores,
  processCompletedChallenges,
} from '../services/challengeService';
import { Challenge, ChallengeType, Partnership, PartnerStats, CHALLENGE_TYPE_NAMES } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ChallengeRouteProp = RouteProp<RootStackParamList, 'Challenge'>;

export function ChallengeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ChallengeRouteProp>();
  const { user } = useAuth();
  const workoutBarPadding = useWorkoutBarPadding();
  const { partnershipId } = route.params;

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [partnership, setPartnership] = useState<Partnership | null>(null);
  const [partnerStats, setPartnerStats] = useState<PartnerStats | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [challengeHistory, setChallengeHistory] = useState<Challenge[]>([]);
  const [winLossRecord, setWinLossRecord] = useState({ wins: 0, losses: 0, ties: 0 });
  const [isCreating, setIsCreating] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const activePartnership = await getActivePartnership();
      if (!activePartnership || activePartnership.id !== partnershipId) {
        // Partnership no longer active
        navigation.goBack();
        return;
      }
      setPartnership(activePartnership);

      const partnerId = getPartnerId(activePartnership, user?.id || '');
      const stats = await getPartnerStats(partnerId);
      setPartnerStats(stats);

      // Process completed challenges first
      await processCompletedChallenges(partnershipId);

      // Get active challenge and update scores
      const challenge = await getActiveChallenge(partnershipId);
      if (challenge && challenge.status === 'active') {
        const scores = await calculateScores(challenge, activePartnership);
        await updateChallengeScores(challenge.id, scores);
        setActiveChallenge({
          ...challenge,
          user1Score: scores.user1Score,
          user2Score: scores.user2Score,
        });
      } else {
        setActiveChallenge(challenge);
      }

      const history = await getChallengeHistory(partnershipId);
      setChallengeHistory(history);

      const record = await getWinLossRecord(partnershipId, user?.id || '');
      setWinLossRecord(record);
    } catch (error) {
      console.error('[ChallengeScreen] Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [partnershipId, user?.id, navigation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Create a new challenge
  const handleCreateChallenge = async (type: ChallengeType) => {
    setIsCreating(true);
    try {
      const challenge = await createChallenge(partnershipId, type);
      if (challenge) {
        setActiveChallenge(challenge);
        Alert.alert('Challenge Created', 'Your partner will be notified to accept the challenge.');
      } else {
        Alert.alert('Error', 'Failed to create challenge. You may already have an active challenge.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create challenge.');
    } finally {
      setIsCreating(false);
    }
  };

  // Accept a pending challenge
  const handleAccept = async () => {
    if (!activeChallenge) return;
    setIsAccepting(true);
    try {
      const success = await acceptChallenge(activeChallenge.id);
      if (success) {
        setActiveChallenge({ ...activeChallenge, status: 'active' });
      } else {
        Alert.alert('Error', 'Failed to accept challenge.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to accept challenge.');
    } finally {
      setIsAccepting(false);
    }
  };

  // Decline a pending challenge
  const handleDecline = async () => {
    if (!activeChallenge) return;
    Alert.alert(
      'Decline Challenge',
      'Are you sure you want to decline this challenge?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setIsDeclining(true);
            try {
              const success = await declineChallenge(activeChallenge.id);
              if (success) {
                setActiveChallenge(null);
              } else {
                Alert.alert('Error', 'Failed to decline challenge.');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to decline challenge.');
            } finally {
              setIsDeclining(false);
            }
          },
        },
      ]
    );
  };

  // Get my score and partner score
  const getScores = () => {
    if (!activeChallenge || !partnership || !user?.id) {
      return { myScore: 0, partnerScore: 0 };
    }
    const isUser1 = partnership.userId1 === user.id;
    return {
      myScore: isUser1 ? activeChallenge.user1Score : activeChallenge.user2Score,
      partnerScore: isUser1 ? activeChallenge.user2Score : activeChallenge.user1Score,
    };
  };

  // Render loading state
  if (isLoading) {
    return (
      <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Challenges</Text>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const { myScore, partnerScore } = getScores();
  const daysRemaining = activeChallenge ? getDaysRemaining(activeChallenge) : 0;
  const winStatus = activeChallenge && partnership && user?.id
    ? amIWinning(activeChallenge, partnership, user.id)
    : 'tied';

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Challenges</Text>
      </View>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + workoutBarPadding }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
        }
      >
        {/* Active Challenge */}
        {activeChallenge && activeChallenge.status === 'active' && (
          <Card style={styles.activeCard}>
            <View style={styles.challengeHeader}>
              <MaterialCommunityIcons name="trophy" size={28} color={colors.primary} />
              <View style={styles.challengeInfo}>
                <Text style={styles.challengeTitle}>
                  {CHALLENGE_TYPE_NAMES[activeChallenge.type]}
                </Text>
                <Text style={styles.challengeDates}>
                  {format(parseISO(activeChallenge.startDate), 'MMM d')} -{' '}
                  {format(parseISO(activeChallenge.endDate), 'MMM d')}
                </Text>
              </View>
              <View style={styles.daysRemaining}>
                <Text style={styles.daysNumber}>{daysRemaining}</Text>
                <Text style={styles.daysLabel}>days left</Text>
              </View>
            </View>

            {/* Scoreboard */}
            <View style={styles.scoreboard}>
              <View style={[styles.scoreColumn, winStatus === 'winning' && styles.winningColumn]}>
                <Text style={styles.scorePlayerLabel}>You</Text>
                <Text style={[styles.scoreValue, winStatus === 'winning' && styles.winningScore]}>
                  {myScore}
                </Text>
                {winStatus === 'winning' && (
                  <MaterialCommunityIcons name="crown" size={20} color={colors.primary} />
                )}
              </View>
              <View style={styles.vsContainer}>
                <Text style={styles.vsText}>VS</Text>
              </View>
              <View style={[styles.scoreColumn, winStatus === 'losing' && styles.winningColumn]}>
                <Text style={styles.scorePlayerLabel}>{partnerStats?.displayName || 'Partner'}</Text>
                <Text style={[styles.scoreValue, winStatus === 'losing' && styles.winningScore]}>
                  {partnerScore}
                </Text>
                {winStatus === 'losing' && (
                  <MaterialCommunityIcons name="crown" size={20} color={colors.primary} />
                )}
              </View>
            </View>

            <Text style={styles.statusText}>
              {winStatus === 'winning'
                ? "You're in the lead! Keep it up!"
                : winStatus === 'losing'
                ? 'Your partner is ahead. Time to catch up!'
                : "It's a tie! Push harder to take the lead!"}
            </Text>
          </Card>
        )}

        {/* Pending Challenge (I created) */}
        {activeChallenge && activeChallenge.status === 'pending' && activeChallenge.createdBy === user?.id && (
          <Card style={styles.pendingCard}>
            <MaterialCommunityIcons name="clock-outline" size={48} color={colors.warning} />
            <Text style={styles.pendingTitle}>Challenge Pending</Text>
            <Text style={styles.pendingText}>
              Waiting for {partnerStats?.displayName || 'your partner'} to accept your{' '}
              {CHALLENGE_TYPE_NAMES[activeChallenge.type]} challenge.
            </Text>
          </Card>
        )}

        {/* Pending Challenge (Partner created) */}
        {activeChallenge && activeChallenge.status === 'pending' && activeChallenge.createdBy !== user?.id && (
          <Card style={styles.pendingCard}>
            <MaterialCommunityIcons name="trophy-outline" size={48} color={colors.primary} />
            <Text style={styles.pendingTitle}>Challenge Invite!</Text>
            <Text style={styles.pendingText}>
              {partnerStats?.displayName || 'Your partner'} has challenged you to a{' '}
              {CHALLENGE_TYPE_NAMES[activeChallenge.type]} competition!
            </Text>
            <View style={styles.pendingActions}>
              <Button
                title={isAccepting ? 'Accepting...' : 'Accept'}
                onPress={handleAccept}
                disabled={isAccepting || isDeclining}
                style={styles.acceptButton}
              />
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDecline}
                disabled={isAccepting || isDeclining}
              >
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* Create Challenge */}
        {!activeChallenge && (
          <Card style={styles.createCard}>
            <Text style={styles.createTitle}>Start a New Challenge</Text>
            <Text style={styles.createSubtitle}>
              Challenge {partnerStats?.displayName || 'your partner'} to a weekly competition!
            </Text>

            <TouchableOpacity
              style={styles.challengeOption}
              onPress={() => handleCreateChallenge('most_sets')}
              disabled={isCreating}
            >
              <View style={styles.optionIcon}>
                <MaterialCommunityIcons name="dumbbell" size={28} color={colors.primary} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Most Sets</Text>
                <Text style={styles.optionDescription}>
                  Compete to log the most sets this week
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.challengeOption}
              onPress={() => handleCreateChallenge('most_workouts')}
              disabled={isCreating}
            >
              <View style={styles.optionIcon}>
                <MaterialCommunityIcons name="calendar-check" size={28} color={colors.primary} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Most Workouts</Text>
                <Text style={styles.optionDescription}>
                  Compete to complete the most workouts this week
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.textTertiary} />
            </TouchableOpacity>

            {isCreating && (
              <ActivityIndicator size="small" color={colors.primary} style={styles.creatingIndicator} />
            )}
          </Card>
        )}

        {/* Win/Loss Record */}
        <Card style={styles.recordCard}>
          <Text style={styles.recordTitle}>Your Record</Text>
          <View style={styles.recordRow}>
            <View style={styles.recordItem}>
              <Text style={[styles.recordNumber, { color: colors.success }]}>{winLossRecord.wins}</Text>
              <Text style={styles.recordLabel}>Wins</Text>
            </View>
            <View style={styles.recordItem}>
              <Text style={[styles.recordNumber, { color: colors.error }]}>{winLossRecord.losses}</Text>
              <Text style={styles.recordLabel}>Losses</Text>
            </View>
            <View style={styles.recordItem}>
              <Text style={[styles.recordNumber, { color: colors.textSecondary }]}>{winLossRecord.ties}</Text>
              <Text style={styles.recordLabel}>Ties</Text>
            </View>
          </View>
        </Card>

        {/* Challenge History */}
        {challengeHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>History</Text>
            {challengeHistory.map((challenge) => {
              const isWinner = challenge.winnerUserId === user?.id;
              const isTie = challenge.winnerUserId === null;
              const myHistoryScore = partnership?.userId1 === user?.id
                ? challenge.user1Score
                : challenge.user2Score;
              const partnerHistoryScore = partnership?.userId1 === user?.id
                ? challenge.user2Score
                : challenge.user1Score;

              return (
                <Card key={challenge.id} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyType}>
                        {CHALLENGE_TYPE_NAMES[challenge.type]}
                      </Text>
                      <Text style={styles.historyDate}>
                        {format(parseISO(challenge.endDate), 'MMM d, yyyy')}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.resultBadge,
                        isWinner ? styles.winBadge : isTie ? styles.tieBadge : styles.lossBadge,
                      ]}
                    >
                      <Text style={styles.resultText}>
                        {isWinner ? 'Won' : isTie ? 'Tie' : 'Lost'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.historyScore}>
                    {myHistoryScore} - {partnerHistoryScore}
                  </Text>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  backButton: {
    marginRight: spacing.sm,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Active Challenge
  activeCard: {
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  challengeInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  challengeTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  challengeDates: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  daysRemaining: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 60,
  },
  daysNumber: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  daysLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  scoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  scoreColumn: {
    alignItems: 'center',
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  winningColumn: {
    backgroundColor: 'rgba(255, 197, 47, 0.15)',
  },
  scorePlayerLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  winningScore: {
    color: colors.primary,
  },
  vsContainer: {
    paddingHorizontal: spacing.md,
  },
  vsText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.textTertiary,
  },
  statusText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  // Pending Challenge
  pendingCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  pendingTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginTop: spacing.md,
  },
  pendingText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: typography.size.base * 1.5,
    paddingHorizontal: spacing.md,
  },
  pendingActions: {
    marginTop: spacing.lg,
    width: '100%',
    paddingHorizontal: spacing.md,
  },
  acceptButton: {
    marginBottom: spacing.sm,
  },
  declineButton: {
    padding: spacing.md,
    alignItems: 'center',
  },
  declineText: {
    fontSize: typography.size.base,
    color: colors.error,
  },
  // Create Challenge
  createCard: {
    marginBottom: spacing.lg,
  },
  createTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  createSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  challengeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  optionDescription: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  creatingIndicator: {
    marginTop: spacing.md,
  },
  // Record
  recordCard: {
    marginBottom: spacing.lg,
  },
  recordTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  recordItem: {
    alignItems: 'center',
  },
  recordNumber: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
  },
  recordLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // History
  historySection: {
    marginBottom: spacing.lg,
  },
  historyTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  historyCard: {
    marginBottom: spacing.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  historyInfo: {},
  historyType: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  historyDate: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  resultBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  winBadge: {
    backgroundColor: 'rgba(52, 199, 89, 0.2)',
  },
  lossBadge: {
    backgroundColor: 'rgba(255, 69, 58, 0.2)',
  },
  tieBadge: {
    backgroundColor: colors.backgroundSecondary,
  },
  resultText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  historyScore: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textSecondary,
  },
});

export default ChallengeScreen;
