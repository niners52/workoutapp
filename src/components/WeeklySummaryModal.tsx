import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format, startOfWeek, endOfWeek, subWeeks, eachDayOfInterval, parseISO } from 'date-fns';
import { colors, typography, spacing, borderRadius } from '../theme';
import { Button, Card } from './common';
import { useData } from '../contexts/DataContext';
import { formatVolume } from '../services/units';
import { PersonalRecord, getExercisePRsInDateRange } from '../services/personalRecords';
import { getWeeklyGridData, DailyGoalStatus } from '../services/streaks';
import { getCachedInsights, Insight } from '../services/insights';
import { WeekStartDay } from '../types';

interface WeeklySummaryData {
  weekStart: Date;
  weekEnd: Date;
  totalWorkouts: number;
  totalSets: number;
  totalVolume: number;
  prsThisWeek: PersonalRecord[];
  calorieGoalDays: number;
  proteinGoalDays: number;
  perfectDays: number;
  trainingDays: number;
  yogaMinutes: number;
  cardioMinutes: number;
  // Previous week comparison
  prevTotalWorkouts: number;
  prevTotalSets: number;
  prevTotalVolume: number;
  prevWeekWasDeload: boolean;
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
  weekStart: Date;
}

export function WeeklySummaryModal({ visible, onDismiss, weekStart }: Props) {
  const { workouts, sets, exercises, userSettings, bodyMeasurements } = useData();
  const [data, setData] = useState<WeeklySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekInsights, setWeekInsights] = useState<Insight[]>([]);

  const units = userSettings?.units || 'imperial';
  const weekStartDay: WeekStartDay = userSettings?.weekStartDay || 'sunday';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Calculate week boundaries
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: weekStartDay === 'monday' ? 1 : 0 });
      const prevWeekStart = subWeeks(weekStart, 1);
      const prevWeekEnd = subWeeks(weekEnd, 1);

      // Get workouts for this week
      const thisWeekWorkouts = workouts.filter(w => {
        if (!w.completedAt) return false;
        const date = parseISO(w.startedAt);
        return date >= weekStart && date <= weekEnd;
      });

      // Identify deload workouts
      const deloadWorkoutIds = new Set(
        thisWeekWorkouts.filter(w => w.isDeload).map(w => w.id)
      );

      // Get sets for this week (exclude deload for volume accuracy)
      const thisWeekSets = sets.filter(s => {
        if (deloadWorkoutIds.has(s.workoutId)) return false;
        const date = parseISO(s.loggedAt);
        return date >= weekStart && date <= weekEnd;
      });

      // Calculate volume (non-deload only)
      const totalVolume = thisWeekSets.reduce((sum, s) => {
        return sum + ((s.weight || 0) * (s.reps || 0));
      }, 0);

      // Get PRs for this week
      const prsThisWeek = await getExercisePRsInDateRange(
        exercises,
        sets,
        weekStart,
        weekEnd
      );

      // Get daily goal data
      let calorieGoalDays = 0;
      let proteinGoalDays = 0;
      let perfectDays = 0;
      let trainingDays = 0;
      let yogaMinutes = 0;
      let cardioMinutes = 0;

      try {
        const gridData = await getWeeklyGridData(
          userSettings,
          workouts,
          [],
          []
        );
        if (gridData) {
          for (const day of gridData.days) {
            if (day.calories.met) calorieGoalDays++;
            if (day.protein.met) proteinGoalDays++;
            if (day.perfectDay) perfectDays++;
            if (day.training.completed) trainingDays++;
            yogaMinutes += day.yoga?.minutes || 0;
            cardioMinutes += day.cardio?.minutes || 0;
          }
        }
      } catch (e) {
        // Goal data not available, use training days from workouts
        trainingDays = thisWeekWorkouts.length;
      }

      // Previous week data
      const prevWeekWorkouts = workouts.filter(w => {
        if (!w.completedAt) return false;
        const date = parseISO(w.startedAt);
        return date >= prevWeekStart && date <= prevWeekEnd;
      });

      // Check if previous week was a deload week (majority of workouts were deload)
      const prevDeloadCount = prevWeekWorkouts.filter(w => w.isDeload).length;
      const prevWeekWasDeload = prevWeekWorkouts.length > 0 && prevDeloadCount > prevWeekWorkouts.length / 2;

      // Exclude deload from previous week comparison too
      const prevDeloadIds = new Set(
        prevWeekWorkouts.filter(w => w.isDeload).map(w => w.id)
      );
      const prevWeekSets = sets.filter(s => {
        if (prevDeloadIds.has(s.workoutId)) return false;
        const date = parseISO(s.loggedAt);
        return date >= prevWeekStart && date <= prevWeekEnd;
      });

      const prevTotalVolume = prevWeekSets.reduce((sum, s) => {
        return sum + ((s.weight || 0) * (s.reps || 0));
      }, 0);

      setData({
        weekStart,
        weekEnd,
        totalWorkouts: thisWeekWorkouts.filter(w => !w.isDeload).length,
        totalSets: thisWeekSets.length,
        totalVolume,
        prsThisWeek,
        calorieGoalDays,
        proteinGoalDays,
        perfectDays,
        trainingDays,
        yogaMinutes: Math.round(yogaMinutes),
        cardioMinutes: Math.round(cardioMinutes),
        prevTotalWorkouts: prevWeekWorkouts.filter(w => !w.isDeload).length,
        prevTotalSets: prevWeekSets.length,
        prevTotalVolume,
        prevWeekWasDeload,
      });
      // Load insights for the weekly summary
      try {
        const insights = await getCachedInsights({
          exercises,
          sets,
          workouts,
          bodyMeasurements,
          userSettings,
          bodyWeightLbs: null,
          nutritionHistory: new Map(),
          sleepHistory: new Map(),
        });
        setWeekInsights(insights.slice(0, 3));
      } catch {
        setWeekInsights([]);
      }
    } catch (error) {
      console.error('[WeeklySummary] Error loading data:', error);
    }
    setLoading(false);
  }, [weekStart, workouts, sets, exercises, userSettings, weekStartDay, bodyMeasurements]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  const renderComparison = (current: number, previous: number, suffix: string = '') => {
    const diff = current - previous;
    if (diff === 0) return null;

    const isPositive = diff > 0;
    return (
      <View style={styles.comparison}>
        <Ionicons
          name={isPositive ? 'arrow-up' : 'arrow-down'}
          size={12}
          color={isPositive ? colors.success : colors.error}
        />
        <Text style={[styles.comparisonText, { color: isPositive ? colors.success : colors.error }]}>
          {Math.abs(diff)}{suffix} vs last week
        </Text>
      </View>
    );
  };

  const renderVolumeComparison = (current: number, previous: number) => {
    const diff = current - previous;
    if (diff === 0) return null;

    const isPositive = diff > 0;
    const percentChange = previous > 0 ? Math.round((Math.abs(diff) / previous) * 100) : 0;

    return (
      <View style={styles.comparison}>
        <Ionicons
          name={isPositive ? 'arrow-up' : 'arrow-down'}
          size={12}
          color={isPositive ? colors.success : colors.error}
        />
        <Text style={[styles.comparisonText, { color: isPositive ? colors.success : colors.error }]}>
          {percentChange}% vs last week
        </Text>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Weekly Summary</Text>
          <View style={styles.closeButton} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading summary...</Text>
          </View>
        ) : data ? (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {/* Week Date Range */}
            <Text style={styles.dateRange}>
              {format(data.weekStart, 'MMM d')} - {format(data.weekEnd, 'MMM d, yyyy')}
            </Text>

            {/* Main Stats */}
            <View style={styles.statsGrid}>
              <Card style={styles.statCard}>
                <MaterialCommunityIcons name="weight-lifter" size={28} color={colors.primary} />
                <Text style={styles.statValue}>{data.totalWorkouts}</Text>
                <Text style={styles.statLabel}>Workouts</Text>
                {!data.prevWeekWasDeload && renderComparison(data.totalWorkouts, data.prevTotalWorkouts)}
              </Card>

              <Card style={styles.statCard}>
                <MaterialCommunityIcons name="dumbbell" size={28} color={colors.primary} />
                <Text style={styles.statValue}>{data.totalSets.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Total Sets</Text>
                {!data.prevWeekWasDeload && renderComparison(data.totalSets, data.prevTotalSets)}
              </Card>
            </View>

            {/* Post-deload notice */}
            {data.prevWeekWasDeload && (
              <View style={styles.deloadNotice}>
                <Ionicons name="refresh-outline" size={16} color={colors.primary} />
                <Text style={styles.deloadNoticeText}>
                  Previous week was deload — comparisons skipped
                </Text>
              </View>
            )}

            {/* Volume */}
            {data.totalVolume > 0 && (
              <Card style={styles.volumeCard}>
                <View style={styles.volumeHeader}>
                  <Ionicons name="barbell-outline" size={24} color={colors.primary} />
                  <Text style={styles.volumeLabel}>Total Volume</Text>
                </View>
                <Text style={styles.volumeValue}>{formatVolume(data.totalVolume, units)}</Text>
                {!data.prevWeekWasDeload && renderVolumeComparison(data.totalVolume, data.prevTotalVolume)}
              </Card>
            )}

            {/* Goal Hit Rates */}
            {(userSettings?.dailyGoals?.calories || userSettings?.dailyGoals?.protein) && (
              <Card style={styles.goalsCard}>
                <Text style={styles.sectionTitle}>Goal Progress</Text>
                <View style={styles.goalRows}>
                  {userSettings?.dailyGoals?.calories && (
                    <View style={styles.goalRow}>
                      <View style={styles.goalInfo}>
                        <MaterialCommunityIcons name="fire" size={20} color={colors.caloriesRing} />
                        <Text style={styles.goalLabel}>Calorie Goal</Text>
                      </View>
                      <Text style={styles.goalValue}>{data.calorieGoalDays}/7 days</Text>
                    </View>
                  )}
                  {userSettings?.dailyGoals?.protein && (
                    <View style={styles.goalRow}>
                      <View style={styles.goalInfo}>
                        <MaterialCommunityIcons name="food-drumstick" size={20} color={colors.proteinRing} />
                        <Text style={styles.goalLabel}>Protein Goal</Text>
                      </View>
                      <Text style={styles.goalValue}>{data.proteinGoalDays}/7 days</Text>
                    </View>
                  )}
                  <View style={styles.goalRow}>
                    <View style={styles.goalInfo}>
                      <MaterialCommunityIcons name="star" size={20} color={colors.warning} />
                      <Text style={styles.goalLabel}>Perfect Days</Text>
                    </View>
                    <Text style={styles.goalValue}>{data.perfectDays}/7 days</Text>
                  </View>
                  {userSettings?.trackYoga && (
                    <View style={styles.goalRow}>
                      <View style={styles.goalInfo}>
                        <MaterialCommunityIcons name="yoga" size={20} color={colors.chartYoga} />
                        <Text style={styles.goalLabel}>Yoga</Text>
                      </View>
                      <Text style={styles.goalValue}>
                        {data.yogaMinutes}/{userSettings.weeklyGoals?.yogaMinutes ?? 60} min
                      </Text>
                    </View>
                  )}
                  {userSettings?.trackCardio && (
                    <View style={styles.goalRow}>
                      <View style={styles.goalInfo}>
                        <MaterialCommunityIcons name="run" size={20} color={colors.chartCardio} />
                        <Text style={styles.goalLabel}>Cardio</Text>
                      </View>
                      <Text style={styles.goalValue}>
                        {data.cardioMinutes}/{userSettings.weeklyGoals?.cardioMinutes ?? 60} min
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            )}

            {/* PRs */}
            {data.prsThisWeek.length > 0 && (
              <Card style={styles.prsCard}>
                <View style={styles.prsHeader}>
                  <MaterialCommunityIcons name="trophy" size={24} color={colors.warning} />
                  <Text style={styles.sectionTitle}>Personal Records</Text>
                </View>
                <Text style={styles.prsCount}>
                  {data.prsThisWeek.length} PR{data.prsThisWeek.length !== 1 ? 's' : ''} this week!
                </Text>
                <View style={styles.prsList}>
                  {data.prsThisWeek.slice(0, 5).map((pr, index) => {
                    const exercise = exercises.find(e => e.id === pr.exerciseId);
                    return (
                      <View key={`${pr.exerciseId}-${pr.type}-${index}`} style={styles.prRow}>
                        <Text style={styles.prExercise} numberOfLines={1}>
                          {exercise?.name || 'Unknown Exercise'}
                        </Text>
                        <Text style={styles.prValue}>
                          {pr.type === 'weight' && `${pr.value} lbs`}
                          {pr.type === 'reps' && `${pr.value} reps`}
                          {pr.type === 'volume' && `${pr.value} vol`}
                          {pr.type === 'e1rm' && `${pr.value} e1RM`}
                        </Text>
                      </View>
                    );
                  })}
                  {data.prsThisWeek.length > 5 && (
                    <Text style={styles.moreText}>
                      +{data.prsThisWeek.length - 5} more
                    </Text>
                  )}
                </View>
              </Card>
            )}

            {/* Weekly Insights */}
            {weekInsights.length > 0 && (
              <Card style={styles.insightsCard}>
                <View style={styles.insightsHeader}>
                  <Ionicons name="bulb-outline" size={20} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Weekly Insights</Text>
                </View>
                {weekInsights.map((insight) => (
                  <View key={insight.id} style={styles.insightRow}>
                    <Ionicons
                      name={insight.icon as any}
                      size={16}
                      color={colors.primary}
                    />
                    <View style={styles.insightTextContainer}>
                      <Text style={styles.insightTitle}>{insight.title}</Text>
                      <Text style={styles.insightDetail} numberOfLines={2}>{insight.detail}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}

            {/* No workouts message */}
            {data.totalWorkouts === 0 && (
              <Card style={styles.emptyCard}>
                <MaterialCommunityIcons name="calendar-blank" size={48} color={colors.textTertiary} />
                <Text style={styles.emptyText}>No workouts this week</Text>
                <Text style={styles.emptySubtext}>Start fresh next week!</Text>
              </Card>
            )}
          </ScrollView>
        ) : null}

        {/* Dismiss Button */}
        <View style={styles.footer}>
          <Button
            title="Got it!"
            onPress={onDismiss}
            size="large"
            fullWidth
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.base,
    paddingBottom: 100,
  },
  dateRange: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  statValue: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginTop: spacing.sm,
  },
  statLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  comparison: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  comparisonText: {
    fontSize: typography.size.xs,
  },
  volumeCard: {
    marginBottom: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  volumeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  volumeLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  volumeValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  goalsCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  goalRows: {
    gap: spacing.sm,
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  goalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  goalLabel: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  goalValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.primary,
  },
  prsCard: {
    marginBottom: spacing.md,
  },
  prsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  prsCount: {
    fontSize: typography.size.base,
    color: colors.warning,
    fontWeight: typography.weight.medium,
    marginBottom: spacing.md,
  },
  prsList: {
    gap: spacing.sm,
  },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prExercise: {
    fontSize: typography.size.base,
    color: colors.text,
    flex: 1,
  },
  prValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.primary,
  },
  moreText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    fontSize: typography.size.lg,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: typography.size.base,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  insightsCard: {
    marginBottom: spacing.md,
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  insightTextContainer: {
    flex: 1,
  },
  insightTitle: {
    fontSize: typography.size.sm,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  insightDetail: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: typography.size.xs * 1.5,
  },
  deloadNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  deloadNoticeText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    flex: 1,
  },
  footer: {
    padding: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
  },
});

export default WeeklySummaryModal;
