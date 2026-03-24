import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { ProgressRing } from './ProgressRing';
import { CalorieRing } from './CalorieRing';
import { Card } from '../common';
import { colors, typography, spacing } from '../../theme';
import { DailyGoalStatus, LetterGrade, GRADE_COLORS, gradeIsHit, getStandardGrade, WeeklySummary } from '../../services/streaks';
import { DailyGoals, UserSettings } from '../../types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface TodayRingsProps {
  status: DailyGoalStatus;
  dailyGoals: DailyGoals;
  calorieTolerancePercent?: number;
  userSettings?: UserSettings;
  weeklySummary?: WeeklySummary | null;
}

interface GoalInfo {
  key: string;
  label: string;
  met: boolean;
  grade: LetterGrade;
  color: string;
}

export function TodayRings({ status, dailyGoals, calorieTolerancePercent = 10, userSettings, weeklySummary }: TodayRingsProps) {
  const [expanded, setExpanded] = useState(false);

  // Build list of active goals
  const goals = useMemo<GoalInfo[]>(() => {
    const list: GoalInfo[] = [];
    list.push({ key: 'sleep', label: 'Sleep', grade: status.sleep.grade, met: gradeIsHit(status.sleep.grade), color: GRADE_COLORS[status.sleep.grade] });
    list.push({ key: 'protein', label: 'Protein', grade: status.protein.grade, met: gradeIsHit(status.protein.grade), color: GRADE_COLORS[status.protein.grade] });
    if (status.calories.goal > 0) {
      list.push({
        key: 'calories',
        label: 'Calories',
        grade: status.calories.grade,
        met: gradeIsHit(status.calories.grade),
        color: GRADE_COLORS[status.calories.grade],
      });
    }
    if (status.supplements.total > 0) {
      list.push({ key: 'supps', label: 'Supps', grade: status.supplements.grade, met: gradeIsHit(status.supplements.grade), color: GRADE_COLORS[status.supplements.grade] });
    }
    if (dailyGoals.trackTraining) {
      list.push({ key: 'training', label: 'Training', grade: status.training.grade, met: gradeIsHit(status.training.grade), color: GRADE_COLORS[status.training.grade] });
    }
    if (dailyGoals.trackPT && status.physicalTherapy.total > 0) {
      list.push({ key: 'pt', label: 'PT', grade: status.physicalTherapy.grade, met: gradeIsHit(status.physicalTherapy.grade), color: GRADE_COLORS[status.physicalTherapy.grade] });
    }
    return list;
  }, [status, dailyGoals]);

  const goalsMet = goals.filter(g => g.met).length;
  const totalGoals = goals.length;
  const summaryProgress = totalGoals > 0 ? (goalsMet / totalGoals) * 100 : 0;
  const allMet = goalsMet === totalGoals && totalGoals > 0;

  // Progress ring values
  const sleepProgress = dailyGoals.sleepHours > 0
    ? (status.sleep.hours / dailyGoals.sleepHours) * 100
    : 0;
  const proteinProgress = dailyGoals.proteinGrams > 0
    ? (status.protein.grams / dailyGoals.proteinGrams) * 100
    : 0;
  const supplementsProgress = status.supplements.total > 0
    ? (status.supplements.taken / status.supplements.total) * 100
    : 0;
  const trainingProgress = status.training.completed ? 100 : 0;
  const ptProgress = status.physicalTherapy.total > 0
    ? (status.physicalTherapy.completed / status.physicalTherapy.total) * 100
    : 0;

  const sleepValue = `${status.sleep.hours.toFixed(1)}/${dailyGoals.sleepHours}`;
  const proteinValue = `${Math.round(status.protein.grams)}/${dailyGoals.proteinGrams}`;
  const supplementsValue = `${status.supplements.taken}/${status.supplements.total}`;
  const ptValue = `${status.physicalTherapy.completed}/${status.physicalTherapy.total}`;

  const toggleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => !prev);
  }, []);

  // Summary ring SVG params
  const summarySize = 100;
  const summaryStroke = 8;
  const summaryRadius = (summarySize - summaryStroke) / 2;
  const summaryCircumference = summaryRadius * 2 * Math.PI;
  const summaryDashoffset = summaryCircumference - (Math.min(summaryProgress, 100) / 100) * summaryCircumference;

  return (
    <Card style={styles.card}>
      <TouchableOpacity onPress={toggleExpand} activeOpacity={0.7}>
        {/* Collapsed: summary ring + goal dots */}
        <View style={styles.collapsedRow}>
          <View style={styles.summaryRingContainer}>
            <Svg width={summarySize} height={summarySize}>
              <G rotation="-90" origin={`${summarySize / 2}, ${summarySize / 2}`}>
                <Circle
                  cx={summarySize / 2}
                  cy={summarySize / 2}
                  r={summaryRadius}
                  stroke={colors.backgroundTertiary}
                  strokeWidth={summaryStroke}
                  fill="transparent"
                />
                <Circle
                  cx={summarySize / 2}
                  cy={summarySize / 2}
                  r={summaryRadius}
                  stroke={allMet ? colors.success : colors.primary}
                  strokeWidth={summaryStroke}
                  fill="transparent"
                  strokeLinecap="round"
                  strokeDasharray={summaryCircumference}
                  strokeDashoffset={summaryDashoffset}
                />
              </G>
            </Svg>
            <View style={styles.summaryCenter}>
              <Text style={[styles.summaryCount, allMet && styles.summaryCountComplete]}>
                {goalsMet}/{totalGoals}
              </Text>
              <Text style={styles.summaryLabel}>goals</Text>
            </View>
            {allMet && (
              <View
                style={[
                  styles.glowEffect,
                  {
                    width: summarySize + 10,
                    height: summarySize + 10,
                    borderRadius: (summarySize + 10) / 2,
                    borderColor: colors.success,
                  },
                ]}
              />
            )}
          </View>

          {/* Goal indicator dots */}
          <View style={styles.goalDotsContainer}>
            <Text style={styles.collapsedTitle}>Today's Progress</Text>
            <View style={styles.goalDotsGrid}>
              {goals.map(goal => (
                <View key={goal.key} style={styles.goalDotRow}>
                  <View
                    style={[
                      styles.goalDot,
                      { backgroundColor: goal.color },
                      goal.met && styles.goalDotMet,
                    ]}
                  />
                  <Text style={[
                    styles.goalDotLabel,
                    goal.met && styles.goalDotLabelMet,
                  ]}>
                    {goal.label}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.tapHint}>
              {expanded ? 'Tap to collapse' : 'Tap for details'}
            </Text>
          </View>
        </View>

        {/* Expanded: individual rings */}
        {expanded && (
          <View style={styles.expandedSection}>
            <View style={styles.divider} />
            <View style={styles.ringsRow}>
              <ProgressRing
                progress={sleepProgress}
                label="Sleep"
                value={sleepValue}
                color={colors.chartSleep}
                grade={status.sleep.grade}
              />
              <ProgressRing
                progress={proteinProgress}
                label="Protein"
                value={proteinValue}
                color={colors.chartProtein}
                grade={status.protein.grade}
              />
              {status.calories.goal > 0 && (
                <CalorieRing
                  consumed={status.calories.consumed}
                  goal={status.calories.goal}
                  mode={status.calories.mode}
                  tolerancePercent={calorieTolerancePercent}
                  grade={status.calories.grade}
                />
              )}
              {status.supplements.total > 0 && (
                <ProgressRing
                  progress={supplementsProgress}
                  label="Supps"
                  value={supplementsValue}
                  color={colors.primary}
                  grade={status.supplements.grade}
                />
              )}
              {dailyGoals.trackTraining && (
                <ProgressRing
                  progress={trainingProgress}
                  label="Training"
                  isBoolean
                  color={colors.chartTraining}
                  grade={status.training.grade}
                />
              )}
              {dailyGoals.trackPT && status.physicalTherapy.total > 0 && (
                <ProgressRing
                  progress={ptProgress}
                  label="PT"
                  value={ptValue}
                  color={colors.success}
                  grade={status.physicalTherapy.grade}
                />
              )}
            </View>
            {/* Weekly yoga/cardio progress (not daily goals) */}
            {(userSettings?.trackYoga || userSettings?.trackCardio) && weeklySummary && (
              <View style={styles.weeklyRingsSection}>
                <Text style={styles.weeklyRingsLabel}>Weekly Progress</Text>
                <View style={styles.ringsRow}>
                  {userSettings?.trackYoga && (() => {
                    const yogaGoal = userSettings.weeklyGoals?.yogaMinutes ?? 60;
                    const yogaProgress = yogaGoal > 0 ? (weeklySummary.yogaMinutes / yogaGoal) * 100 : 0;
                    const yogaGrade = getStandardGrade(yogaProgress);
                    return (
                      <ProgressRing
                        progress={yogaProgress}
                        label="Yoga"
                        value={`${weeklySummary.yogaMinutes}/${yogaGoal}`}
                        color={colors.chartYoga}
                        grade={yogaGrade}
                      />
                    );
                  })()}
                  {userSettings?.trackCardio && (() => {
                    const cardioGoal = userSettings.weeklyGoals?.cardioMinutes ?? 60;
                    const cardioProgress = cardioGoal > 0 ? (weeklySummary.cardioMinutes / cardioGoal) * 100 : 0;
                    const cardioGrade = getStandardGrade(cardioProgress);
                    return (
                      <ProgressRing
                        progress={cardioProgress}
                        label="Cardio"
                        value={`${weeklySummary.cardioMinutes}/${cardioGoal}`}
                        color={colors.chartCardio}
                        grade={cardioGrade}
                      />
                    );
                  })()}
                </View>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.base,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryRingContainer: {
    position: 'relative',
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCount: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  summaryCountComplete: {
    color: colors.success,
  },
  summaryLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: -2,
  },
  glowEffect: {
    position: 'absolute',
    borderWidth: 1,
    opacity: 0.3,
  },
  goalDotsContainer: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  collapsedTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  goalDotsGrid: {
    gap: spacing.xs,
  },
  goalDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  goalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  goalDotMet: {
    shadowColor: colors.success,
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  goalDotLabel: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  goalDotLabelMet: {
    color: colors.text,
  },
  tapHint: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  expandedSection: {
    marginTop: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginBottom: spacing.md,
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  weeklyRingsSection: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  weeklyRingsLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});

export default TodayRings;
