import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card, Button } from '../components/common';
import { useAuth } from '../contexts/AuthContext';
import {
  getActivePartnership,
  getPartnerStats,
  getPartnerId,
  isAuthenticated,
} from '../services/partnershipService';
import {
  getActiveChallenge,
  getWinLossRecord,
  getDaysRemaining,
  amIWinning,
  processCompletedChallenges,
} from '../services/challengeService';
import {
  Partnership,
  PartnerStats,
  Challenge,
  CHALLENGE_TYPE_NAMES,
} from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SocialScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [partnership, setPartnership] = useState<Partnership | null>(null);
  const [partnerStats, setPartnerStats] = useState<PartnerStats | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [winLossRecord, setWinLossRecord] = useState<{ wins: number; losses: number; ties: number } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const authed = await isAuthenticated();
      if (!authed || !user) {
        setLoading(false);
        return;
      }

      const p = await getActivePartnership();
      setPartnership(p);

      if (p) {
        const partnerId = getPartnerId(p, user.id);
        const [stats, challenge] = await Promise.all([
          getPartnerStats(partnerId),
          getActiveChallenge(p.id),
        ]);
        setPartnerStats(stats);
        setActiveChallenge(challenge);

        await processCompletedChallenges(p.id);

        const record = await getWinLossRecord(p.id, user.id);
        setWinLossRecord(record);
      } else {
        setPartnerStats(null);
        setActiveChallenge(null);
        setWinLossRecord(null);
      }
    } catch {
      // Silently handle errors
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Social</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // No partner connected
  if (!partnership) {
    return (
      <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Social</Text>
        </View>
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={80} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>Find a Workout Partner</Text>
          <Text style={styles.emptySubtext}>
            Connect with a friend to track each other's progress, compete in challenges, and stay accountable.
          </Text>
          <Button
            title="Connect Partner"
            onPress={() => navigation.navigate('AccountabilityPartner')}
            size="large"
            style={styles.connectButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Partner connected
  const challengeStatus = activeChallenge && user
    ? amIWinning(activeChallenge, partnership, user.id)
    : null;
  const daysLeft = activeChallenge ? getDaysRemaining(activeChallenge) : 0;

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Social</Text>
        <TouchableOpacity
          style={styles.manageButton}
          onPress={() => navigation.navigate('AccountabilityPartner')}
        >
          <Ionicons name="settings-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Partner Card */}
        {partnerStats && (
          <Card>
            <TouchableOpacity
              onPress={() => navigation.navigate('AccountabilityPartner')}
              activeOpacity={0.7}
            >
              <View style={styles.partnerHeader}>
                <View style={styles.partnerAvatar}>
                  <Ionicons name="person" size={24} color={colors.textOnPrimary} />
                </View>
                <View style={styles.partnerInfo}>
                  <Text style={styles.partnerName}>{partnerStats.displayName}</Text>
                  <Text style={styles.partnerLastActive}>
                    {partnerStats.lastWorkoutDate
                      ? `Last workout ${formatDistanceToNow(parseISO(partnerStats.lastWorkoutDate), { addSuffix: true })}`
                      : 'No workouts yet'}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{partnerStats.workoutStreak}</Text>
                  <Text style={styles.statLabel}>Workout Streak</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{partnerStats.weeklySets}</Text>
                  <Text style={styles.statLabel}>Sets This Week</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{partnerStats.calorieStreak}</Text>
                  <Text style={styles.statLabel}>Calorie Streak</Text>
                </View>
              </View>
            </TouchableOpacity>
          </Card>
        )}

        {/* Active Challenge */}
        {activeChallenge && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Challenge', { partnershipId: partnership.id })}
          >
            <Card>
              <View style={styles.challengeHeader}>
                <View style={styles.challengeTitleRow}>
                  <Ionicons name="trophy" size={20} color={colors.warning} />
                  <Text style={styles.challengeTitle}>
                    {CHALLENGE_TYPE_NAMES[activeChallenge.type]}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  challengeStatus === 'winning' && styles.statusWinning,
                  challengeStatus === 'losing' && styles.statusLosing,
                  challengeStatus === 'tied' && styles.statusTied,
                ]}>
                  <Text style={[
                    styles.statusText,
                    challengeStatus === 'winning' && styles.statusTextWinning,
                    challengeStatus === 'losing' && styles.statusTextLosing,
                    challengeStatus === 'tied' && styles.statusTextTied,
                  ]}>
                    {challengeStatus === 'winning' ? 'Winning' : challengeStatus === 'losing' ? 'Losing' : 'Tied'}
                  </Text>
                </View>
              </View>

              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>You</Text>
                <Text style={styles.scoreValue}>
                  {user?.id === partnership.userId1 ? activeChallenge.user1Score : activeChallenge.user2Score}
                </Text>
                <Text style={styles.scoreSeparator}>-</Text>
                <Text style={styles.scoreValue}>
                  {user?.id === partnership.userId1 ? activeChallenge.user2Score : activeChallenge.user1Score}
                </Text>
                <Text style={styles.scoreLabel}>Partner</Text>
              </View>

              <Text style={styles.daysRemaining}>
                {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
              </Text>
            </Card>
          </TouchableOpacity>
        )}

        {/* No Active Challenge */}
        {!activeChallenge && (
          <Card>
            <View style={styles.noChallengeContainer}>
              <Ionicons name="trophy-outline" size={36} color={colors.textTertiary} />
              <Text style={styles.noChallengeTitle}>No Active Challenge</Text>
              <Text style={styles.noChallengeSubtext}>
                Start a weekly challenge with your partner
              </Text>
              <Button
                title="Start Challenge"
                onPress={() => navigation.navigate('Challenge', { partnershipId: partnership.id })}
                size="medium"
                style={styles.challengeButton}
              />
            </View>
          </Card>
        )}

        {/* Win/Loss Record */}
        {winLossRecord && (winLossRecord.wins > 0 || winLossRecord.losses > 0 || winLossRecord.ties > 0) && (
          <Card>
            <Text style={styles.recordTitle}>Challenge Record</Text>
            <View style={styles.recordRow}>
              <View style={styles.recordItem}>
                <Text style={[styles.recordValue, { color: colors.success }]}>{winLossRecord.wins}</Text>
                <Text style={styles.recordLabel}>Wins</Text>
              </View>
              <View style={styles.recordItem}>
                <Text style={[styles.recordValue, { color: colors.error }]}>{winLossRecord.losses}</Text>
                <Text style={styles.recordLabel}>Losses</Text>
              </View>
              <View style={styles.recordItem}>
                <Text style={[styles.recordValue, { color: colors.textSecondary }]}>{winLossRecord.ties}</Text>
                <Text style={styles.recordLabel}>Ties</Text>
              </View>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold as any,
    color: colors.text,
  },
  manageButton: {
    padding: spacing.xs,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold as any,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  connectButton: {
    marginTop: spacing.lg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  partnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  partnerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  partnerName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold as any,
    color: colors.text,
  },
  partnerLastActive: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold as any,
    color: colors.text,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    backgroundColor: colors.separator,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  challengeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  challengeTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold as any,
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.backgroundTertiary,
  },
  statusWinning: {
    backgroundColor: colors.success + '20',
  },
  statusLosing: {
    backgroundColor: colors.error + '20',
  },
  statusTied: {
    backgroundColor: colors.warning + '20',
  },
  statusText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold as any,
    color: colors.textSecondary,
  },
  statusTextWinning: {
    color: colors.success,
  },
  statusTextLosing: {
    color: colors.error,
  },
  statusTextTied: {
    color: colors.warning,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  scoreLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  scoreValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold as any,
    color: colors.text,
  },
  scoreSeparator: {
    fontSize: typography.size.lg,
    color: colors.textTertiary,
  },
  daysRemaining: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  noChallengeContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  noChallengeTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold as any,
    color: colors.text,
    marginTop: spacing.sm,
  },
  noChallengeSubtext: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  challengeButton: {
    marginTop: spacing.md,
  },
  recordTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold as any,
    color: colors.text,
    marginBottom: spacing.md,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  recordItem: {
    alignItems: 'center',
  },
  recordValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold as any,
  },
  recordLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

export default SocialScreen;
