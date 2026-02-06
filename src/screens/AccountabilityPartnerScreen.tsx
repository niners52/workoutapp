import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Share,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card, Button } from '../components/common';
import { useWorkoutBarPadding } from '../components/workout';
import { useAuth } from '../contexts/AuthContext';
import {
  generateInviteCode,
  getMyInviteCode,
  validateInviteCode,
  acceptInviteCode,
  getActivePartnership,
  getPartnerStats,
  getPartnerId,
  disconnectPartner,
  isAuthenticated,
} from '../services/partnershipService';
import { getActiveChallenge, processCompletedChallenges } from '../services/challengeService';
import { Partnership, PartnerStats, Challenge, CHALLENGE_TYPE_NAMES } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function AccountabilityPartnerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const workoutBarPadding = useWorkoutBarPadding();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAuthenticated_, setIsAuthenticated_] = useState(false);
  const [partnership, setPartnership] = useState<Partnership | null>(null);
  const [partnerStats, setPartnerStats] = useState<PartnerStats | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [myInviteCode, setMyInviteCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    displayName?: string;
    error?: string;
  } | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const authenticated = await isAuthenticated();
      setIsAuthenticated_(authenticated);

      if (!authenticated) {
        setIsLoading(false);
        return;
      }

      const activePartnership = await getActivePartnership();
      setPartnership(activePartnership);

      if (activePartnership) {
        const partnerId = getPartnerId(activePartnership, user?.id || '');
        const stats = await getPartnerStats(partnerId);
        setPartnerStats(stats);

        // Process any completed challenges
        await processCompletedChallenges(activePartnership.id);
        const challenge = await getActiveChallenge(activePartnership.id);
        setActiveChallenge(challenge);
      } else {
        // Get existing invite code
        const code = await getMyInviteCode();
        setMyInviteCode(code?.code || null);
      }
    } catch (error) {
      console.error('[AccountabilityPartnerScreen] Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Generate invite code
  const handleGenerateCode = async () => {
    setIsGeneratingCode(true);
    try {
      const code = await generateInviteCode();
      if (code) {
        setMyInviteCode(code);
      } else {
        Alert.alert('Error', 'Failed to generate invite code. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to generate invite code.');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  // Copy code to clipboard
  const handleCopyCode = async () => {
    if (myInviteCode) {
      await Clipboard.setStringAsync(myInviteCode);
      Alert.alert('Copied', 'Invite code copied to clipboard');
    }
  };

  // Share code
  const handleShareCode = async () => {
    if (myInviteCode) {
      try {
        await Share.share({
          message: `Join me as my accountability partner! Use this code in the Workout Tracker app: ${myInviteCode}`,
        });
      } catch (error) {
        console.error('[AccountabilityPartnerScreen] Share error:', error);
      }
    }
  };

  // Validate entered code
  const handleValidateCode = async () => {
    if (codeInput.length !== 6) {
      setValidationResult({ valid: false, error: 'Code must be 6 characters' });
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await validateInviteCode(codeInput);
      setValidationResult(result);
    } catch (error) {
      setValidationResult({ valid: false, error: 'Failed to validate code' });
    } finally {
      setIsValidating(false);
    }
  };

  // Accept code and create partnership
  const handleAcceptCode = async () => {
    setIsAccepting(true);
    try {
      const result = await acceptInviteCode(codeInput);
      if (result.success && result.partnership) {
        setPartnership(result.partnership);
        setCodeInput('');
        setValidationResult(null);
        setMyInviteCode(null);
        // Reload to get partner stats
        await loadData();
      } else {
        Alert.alert('Error', result.error || 'Failed to accept invite code');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to accept invite code');
    } finally {
      setIsAccepting(false);
    }
  };

  // Disconnect from partner
  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Partner',
      'Are you sure you want to disconnect from your accountability partner? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            if (partnership) {
              const success = await disconnectPartner(partnership.id);
              if (success) {
                setPartnership(null);
                setPartnerStats(null);
                setActiveChallenge(null);
              } else {
                Alert.alert('Error', 'Failed to disconnect. Please try again.');
              }
            }
          },
        },
      ]
    );
  };

  // Navigate to challenge screen
  const handleStartChallenge = () => {
    if (partnership) {
      navigation.navigate('Challenge', { partnershipId: partnership.id });
    }
  };

  // Render not authenticated state
  if (!isAuthenticated_) {
    return (
      <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Accountability Partner</Text>
        </View>
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="account-group" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptySubtitle}>
            You need to sign in to use the accountability partner feature.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Render loading state
  if (isLoading) {
    return (
      <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Accountability Partner</Text>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Render partner dashboard (has partner)
  if (partnership && partnerStats) {
    const lastWorkoutText = partnerStats.lastWorkoutDate
      ? `${partnerStats.lastWorkoutType || 'Workout'} - ${formatDistanceToNow(parseISO(partnerStats.lastWorkoutDate), { addSuffix: true })}`
      : 'No recent workouts';

    return (
      <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Accountability Partner</Text>
        </View>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + workoutBarPadding }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
          }
        >
          {/* Partner Card */}
          <Card style={styles.partnerCard}>
            <View style={styles.partnerHeader}>
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={32} color={colors.textSecondary} />
              </View>
              <View style={styles.partnerInfo}>
                <Text style={styles.partnerName}>{partnerStats.displayName}</Text>
                <Text style={styles.partnerSince}>
                  Partner since {format(parseISO(partnership.createdAt), 'MMM d, yyyy')}
                </Text>
              </View>
            </View>

            {/* Streaks */}
            <View style={styles.streaksRow}>
              <View style={styles.streakItem}>
                <MaterialCommunityIcons name="arm-flex" size={24} color={colors.primary} />
                <Text style={styles.streakCount}>{partnerStats.workoutStreak}</Text>
                <Text style={styles.streakLabel}>Workout Streak</Text>
              </View>
              {partnerStats.calorieStreak > 0 && (
                <View style={styles.streakItem}>
                  <MaterialCommunityIcons name="silverware-fork-knife" size={24} color={colors.primary} />
                  <Text style={styles.streakCount}>{partnerStats.calorieStreak}</Text>
                  <Text style={styles.streakLabel}>Calorie Streak</Text>
                </View>
              )}
              <View style={styles.streakItem}>
                <MaterialCommunityIcons name="dumbbell" size={24} color={colors.primary} />
                <Text style={styles.streakCount}>{partnerStats.weeklySets}</Text>
                <Text style={styles.streakLabel}>Sets This Week</Text>
              </View>
            </View>

            {/* Last Workout */}
            <View style={styles.lastWorkout}>
              <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.lastWorkoutText}>{lastWorkoutText}</Text>
            </View>
          </Card>

          {/* Active Challenge */}
          {activeChallenge && activeChallenge.status === 'active' && (
            <TouchableOpacity onPress={handleStartChallenge}>
              <Card style={styles.challengeCard}>
                <View style={styles.challengeHeader}>
                  <MaterialCommunityIcons name="trophy" size={24} color={colors.primary} />
                  <Text style={styles.challengeTitle}>
                    Active Challenge: {CHALLENGE_TYPE_NAMES[activeChallenge.type]}
                  </Text>
                </View>
                <View style={styles.challengeScores}>
                  <View style={styles.scoreItem}>
                    <Text style={styles.scoreLabel}>You</Text>
                    <Text style={styles.scoreValue}>
                      {partnership.userId1 === user?.id
                        ? activeChallenge.user1Score
                        : activeChallenge.user2Score}
                    </Text>
                  </View>
                  <Text style={styles.vsText}>vs</Text>
                  <View style={styles.scoreItem}>
                    <Text style={styles.scoreLabel}>{partnerStats.displayName}</Text>
                    <Text style={styles.scoreValue}>
                      {partnership.userId1 === user?.id
                        ? activeChallenge.user2Score
                        : activeChallenge.user1Score}
                    </Text>
                  </View>
                </View>
                <Text style={styles.challengeEnds}>
                  Ends {format(parseISO(activeChallenge.endDate), 'EEEE, MMM d')}
                </Text>
              </Card>
            </TouchableOpacity>
          )}

          {/* Pending Challenge */}
          {activeChallenge && activeChallenge.status === 'pending' && (
            <Card style={styles.challengeCard}>
              <View style={styles.challengeHeader}>
                <MaterialCommunityIcons name="trophy-outline" size={24} color={colors.warning} />
                <Text style={styles.challengeTitle}>
                  {activeChallenge.createdBy === user?.id
                    ? 'Challenge Pending...'
                    : 'Challenge Invite!'}
                </Text>
              </View>
              <Text style={styles.challengeType}>
                {CHALLENGE_TYPE_NAMES[activeChallenge.type]}
              </Text>
              {activeChallenge.createdBy !== user?.id && (
                <View style={styles.challengeActions}>
                  <Button
                    title="Accept"
                    onPress={handleStartChallenge}
                    size="small"
                  />
                </View>
              )}
            </Card>
          )}

          {/* Start Challenge Button */}
          {!activeChallenge && (
            <Button
              title="Start Challenge"
              onPress={handleStartChallenge}
              size="large"
              fullWidth
              style={styles.challengeButton}
            />
          )}

          {/* Disconnect */}
          <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
            <Ionicons name="person-remove-outline" size={20} color={colors.error} />
            <Text style={styles.disconnectText}>Disconnect Partner</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Render no partner state (add partner flow)
  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Accountability Partner</Text>
      </View>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + workoutBarPadding }]}
      >
        <Text style={styles.introText}>
          Connect with a friend to share your progress and challenge each other to stay consistent!
        </Text>

        {/* Share Your Code Section */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Share Your Code</Text>
          <Text style={styles.sectionSubtitle}>
            Generate a code and share it with your friend
          </Text>

          {myInviteCode ? (
            <View style={styles.codeDisplay}>
              <Text style={styles.codeText}>{myInviteCode}</Text>
              <View style={styles.codeActions}>
                <TouchableOpacity style={styles.codeAction} onPress={handleCopyCode}>
                  <Ionicons name="copy-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.codeAction} onPress={handleShareCode}>
                  <Ionicons name="share-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Button
              title={isGeneratingCode ? 'Generating...' : 'Generate Code'}
              onPress={handleGenerateCode}
              disabled={isGeneratingCode}
              fullWidth
            />
          )}
        </Card>

        {/* Enter Code Section */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Enter Partner's Code</Text>
          <Text style={styles.sectionSubtitle}>
            Have a code? Enter it below to connect
          </Text>

          <TextInput
            style={styles.codeInput}
            value={codeInput}
            onChangeText={(text) => {
              setCodeInput(text.toUpperCase());
              setValidationResult(null);
            }}
            placeholder="Enter 6-character code"
            placeholderTextColor={colors.textTertiary}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          {validationResult && (
            <View style={[styles.validationResult, validationResult.valid ? styles.validResult : styles.invalidResult]}>
              {validationResult.valid ? (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <Text style={styles.validText}>
                    Connect with {validationResult.displayName}?
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="close-circle" size={20} color={colors.error} />
                  <Text style={styles.invalidText}>{validationResult.error}</Text>
                </>
              )}
            </View>
          )}

          {validationResult?.valid ? (
            <Button
              title={isAccepting ? 'Connecting...' : 'Connect'}
              onPress={handleAcceptCode}
              disabled={isAccepting}
              fullWidth
            />
          ) : (
            <Button
              title={isValidating ? 'Validating...' : 'Validate Code'}
              onPress={handleValidateCode}
              disabled={isValidating || codeInput.length !== 6}
              fullWidth
            />
          )}
        </Card>
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
    padding: spacing.xxl,
  },
  emptyTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: typography.size.base * 1.5,
  },
  introText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: typography.size.base * 1.5,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  codeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  codeText: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
    letterSpacing: 4,
  },
  codeActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  codeAction: {
    padding: spacing.sm,
  },
  codeInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: spacing.md,
  },
  validationResult: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  validResult: {
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
  },
  invalidResult: {
    backgroundColor: 'rgba(255, 69, 58, 0.15)',
  },
  validText: {
    fontSize: typography.size.sm,
    color: colors.success,
    flex: 1,
  },
  invalidText: {
    fontSize: typography.size.sm,
    color: colors.error,
    flex: 1,
  },
  // Partner Dashboard styles
  partnerCard: {
    marginBottom: spacing.lg,
  },
  partnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  partnerSince: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  streaksRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  streakItem: {
    alignItems: 'center',
    padding: spacing.sm,
  },
  streakCount: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginTop: spacing.xs,
  },
  streakLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  lastWorkout: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  lastWorkoutText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  challengeCard: {
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  challengeTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  challengeScores: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  scoreItem: {
    alignItems: 'center',
    minWidth: 80,
  },
  scoreLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  scoreValue: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  vsText: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    fontWeight: typography.weight.semibold,
  },
  challengeEnds: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  challengeType: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  challengeActions: {
    marginTop: spacing.sm,
  },
  challengeButton: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  disconnectText: {
    fontSize: typography.size.base,
    color: colors.error,
  },
});

export default AccountabilityPartnerScreen;
