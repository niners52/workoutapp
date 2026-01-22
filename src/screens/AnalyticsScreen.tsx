import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { MuscleGroupVolumeChart } from '../components/charts';
import { useData } from '../contexts/DataContext';
import {
  getWeeklyVolume,
  getVolumeHistory,
  calculateTrainingScore,
  aggregateChildMuscleGroups,
} from '../services/analytics';
import {
  WeeklyVolume,
  MUSCLE_GROUP_DISPLAY_NAMES,
  getParentMuscleGroup,
} from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function AnalyticsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { userSettings } = useData();

  const [refreshing, setRefreshing] = useState(false);
  const [currentWeekVolume, setCurrentWeekVolume] = useState<WeeklyVolume | null>(null);
  const [volumeHistory, setVolumeHistory] = useState<WeeklyVolume[]>([]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const today = new Date();
      const current = await getWeeklyVolume(today);
      setCurrentWeekVolume(current);

      const history = await getVolumeHistory(52); // Load a full year of history
      setVolumeHistory(history);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const displayVolume = selectedWeekIndex === 0 && currentWeekVolume
    ? currentWeekVolume
    : volumeHistory[volumeHistory.length - 1 - selectedWeekIndex];

  const trainingScore = displayVolume
    ? calculateTrainingScore(displayVolume.muscleGroups)
    : 0;

  const handleMuscleGroupPress = (muscleGroup: string) => {
    if (displayVolume) {
      navigation.navigate('MuscleGroupDetail', {
        muscleGroup,
        weekStart: displayVolume.weekStart,
      });
    }
  };

  const dayOffset = userSettings.weekStartDay === 'sunday' ? 0 : 1;
  const weekStart = startOfWeek(new Date(), { weekStartsOn: dayOffset as 0 | 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: dayOffset as 0 | 1 });

  // Get parent group aggregates
  const parentVolumes = displayVolume
    ? aggregateChildMuscleGroups(displayVolume.muscleGroups)
    : [];

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
      >
        {/* Header */}
        <Text style={styles.title}>Analytics</Text>

        {/* Week Selector */}
        <View style={styles.weekSelector}>
          <TouchableOpacity
            style={styles.weekButton}
            onPress={() => setSelectedWeekIndex(Math.min(selectedWeekIndex + 1, volumeHistory.length - 1))}
            disabled={selectedWeekIndex >= volumeHistory.length - 1}
          >
            <Text style={[styles.weekButtonText, selectedWeekIndex >= volumeHistory.length - 1 && styles.weekButtonDisabled]}>
              ‹ Previous
            </Text>
          </TouchableOpacity>

          <View style={styles.weekInfo}>
            <Text style={styles.weekLabel}>
              {selectedWeekIndex === 0 ? 'This Week' : `${selectedWeekIndex} week${selectedWeekIndex > 1 ? 's' : ''} ago`}
            </Text>
            {displayVolume && (
              <Text style={styles.weekDates}>
                {format(new Date(displayVolume.weekStart), 'MMM d, yyyy')} -{' '}
                {format(new Date(displayVolume.weekEnd), 'MMM d, yyyy')}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.weekButton}
            onPress={() => setSelectedWeekIndex(Math.max(selectedWeekIndex - 1, 0))}
            disabled={selectedWeekIndex <= 0}
          >
            <Text style={[styles.weekButtonText, selectedWeekIndex <= 0 && styles.weekButtonDisabled]}>
              Next ›
            </Text>
          </TouchableOpacity>
        </View>

        {/* Training Score */}
        <Card style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Training Score</Text>
          <Text style={[styles.scoreValue, trainingScore >= 100 && styles.scoreComplete]}>
            {trainingScore}%
          </Text>
          {displayVolume && (
            <Text style={styles.scoreSubtext}>
              {displayVolume.totalSets} / {displayVolume.targetSets} total sets
            </Text>
          )}
        </Card>

        {/* Parent Group Summary */}
        {parentVolumes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Group Summary</Text>
            <View style={styles.parentGrid}>
              {parentVolumes.map(pv => (
                <TouchableOpacity
                  key={pv.parent}
                  style={styles.parentCard}
                  onPress={() => {/* Could expand to show children */}}
                >
                  <Text style={styles.parentName}>
                    {pv.parent.charAt(0).toUpperCase() + pv.parent.slice(1)}
                  </Text>
                  <Text style={styles.parentSets}>
                    {pv.totalSets} / {pv.totalTarget}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Volume by Muscle Group */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Volume by Muscle Group</Text>
          {displayVolume ? (
            <MuscleGroupVolumeChart
              volumes={displayVolume.muscleGroups}
              onMuscleGroupPress={handleMuscleGroupPress}
            />
          ) : (
            <Card>
              <Text style={styles.emptyText}>No data for this week</Text>
            </Card>
          )}
        </View>

        {/* Weekly Trend - Show last 8 weeks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training Score (Last 8 Weeks)</Text>
          <Card>
            <View style={styles.trendChartContainer}>
              <View style={styles.trendYAxis}>
                <Text style={styles.trendYLabel}>100%</Text>
                <Text style={styles.trendYLabel}>50%</Text>
                <Text style={styles.trendYLabel}>0%</Text>
              </View>
              <View style={styles.trendChart}>
                {volumeHistory.slice(-8).map((week, index) => {
                  const actualIndex = volumeHistory.length - 8 + index;
                  const score = calculateTrainingScore(week.muscleGroups);
                  const chartHeight = 80; // Fixed height in pixels
                  const barHeight = Math.max((score / 100) * chartHeight, 4);
                  const isSelected = actualIndex === volumeHistory.length - 1 - selectedWeekIndex;
                  const weekStartDate = new Date(week.weekStart);
                  const weekEndDate = new Date(week.weekEnd);

                  return (
                    <TouchableOpacity
                      key={week.weekStart}
                      style={styles.trendBarContainer}
                      onPress={() => setSelectedWeekIndex(volumeHistory.length - 1 - actualIndex)}
                    >
                      <View style={styles.trendBarArea}>
                        <View
                          style={[
                            styles.trendBar,
                            { height: barHeight },
                            isSelected && styles.trendBarSelected,
                            score >= 100 && styles.trendBarComplete,
                          ]}
                        />
                      </View>
                      <Text style={[styles.trendLabel, isSelected && styles.trendLabelSelected]}>
                        {format(weekStartDate, 'M/d')}-{format(weekEndDate, 'M/d')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <Text style={styles.trendCaption}>% of target sets completed per week</Text>
          </Card>
        </View>
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
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  weekSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  weekButton: {
    padding: spacing.sm,
  },
  weekButtonText: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  weekButtonDisabled: {
    opacity: 0.3,
  },
  weekInfo: {
    alignItems: 'center',
  },
  weekLabel: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  weekDates: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  scoreCard: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  scoreLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginVertical: spacing.sm,
  },
  scoreComplete: {
    color: colors.success,
  },
  scoreSubtext: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  parentGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  parentCard: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    alignItems: 'center',
  },
  parentName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  parentSets: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  trendChartContainer: {
    flexDirection: 'row',
  },
  trendYAxis: {
    width: 36,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: spacing.xs,
    paddingBottom: 24,
    height: 104,
  },
  trendYLabel: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  trendChart: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 104,
  },
  trendBarContainer: {
    flex: 1,
    alignItems: 'center',
  },
  trendBarArea: {
    height: 80,
    width: 24,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  trendBar: {
    width: 20,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.sm,
    minHeight: 4,
  },
  trendBarSelected: {
    backgroundColor: colors.primary,
  },
  trendBarComplete: {
    backgroundColor: colors.success,
  },
  trendLabel: {
    fontSize: 8,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  trendLabelSelected: {
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  trendCaption: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});

export default AnalyticsScreen;
