import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { PrimaryMuscleGroup, MUSCLE_GROUP_DISPLAY_NAMES } from '../../types';
import { formatWeight } from '../../services/units';
import { UnitSystem } from '../../services/units';
import {
  MuscleStrengthResult,
  STRENGTH_LEVEL_LABELS,
  STRENGTH_LEVEL_COLORS,
  StrengthLevel,
} from '../../services/strengthStandards';

interface Props {
  visible: boolean;
  onClose: () => void;
  muscleGroup: PrimaryMuscleGroup | null;
  currentResult: MuscleStrengthResult | null;
  startResult: MuscleStrengthResult | null;
  units: UnitSystem;
}

function LevelBadge({ level }: { level: StrengthLevel }) {
  return (
    <View style={[styles.badge, { backgroundColor: STRENGTH_LEVEL_COLORS[level] + '30' }]}>
      <Text style={[styles.badgeText, { color: STRENGTH_LEVEL_COLORS[level] }]}>
        {STRENGTH_LEVEL_LABELS[level]}
      </Text>
    </View>
  );
}

export function MuscleDetailModal({
  visible,
  onClose,
  muscleGroup,
  currentResult,
  startResult,
  units,
}: Props) {
  if (!muscleGroup) return null;

  const displayName = (MUSCLE_GROUP_DISPLAY_NAMES as Record<string, string>)[muscleGroup] || muscleGroup;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{displayName}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Current Level */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Current Level</Text>
            {currentResult ? (
              <View style={styles.levelRow}>
                <LevelBadge level={currentResult.level} />
                {currentResult.bestExercise?.percentToNext !== undefined &&
                  currentResult.bestExercise.percentToNext < 100 &&
                  currentResult.bestExercise.nextLevelE1rm && (
                    <Text style={styles.nextLevelText}>
                      {currentResult.bestExercise.percentToNext}% to next level
                    </Text>
                  )}
              </View>
            ) : (
              <Text style={styles.noDataText}>No data — train a matching exercise</Text>
            )}
          </View>

          {/* Start vs Now */}
          {startResult && currentResult && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Progress</Text>
              <View style={styles.comparisonRow}>
                <View style={styles.comparisonItem}>
                  <Text style={styles.comparisonLabel}>Start</Text>
                  <LevelBadge level={startResult.level} />
                </View>
                <Text style={styles.arrow}>→</Text>
                <View style={styles.comparisonItem}>
                  <Text style={styles.comparisonLabel}>Now</Text>
                  <LevelBadge level={currentResult.level} />
                </View>
              </View>
            </View>
          )}

          {/* Contributing Exercises */}
          {currentResult && currentResult.allExercises.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Contributing Exercises</Text>
              {currentResult.allExercises.map(ex => (
                <View key={ex.exerciseId} style={styles.exerciseRow}>
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{ex.exerciseName}</Text>
                    <Text style={styles.exerciseE1rm}>
                      e1RM: {formatWeight(ex.e1rmLbs, units)}
                    </Text>
                  </View>
                  <LevelBadge level={ex.level} />
                </View>
              ))}
            </View>
          )}

          {/* Next Level Target */}
          {currentResult?.bestExercise?.nextLevelE1rm && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Next Level Target</Text>
              <Text style={styles.targetText}>
                Reach {formatWeight(currentResult.bestExercise.nextLevelE1rm, units)} e1RM on{' '}
                {currentResult.bestExercise.exerciseName}
              </Text>
            </View>
          )}
        </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.separator,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  closeText: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  section: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.separator,
  },
  sectionLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  nextLevelText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  noDataText: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  comparisonItem: {
    alignItems: 'center',
    gap: 4,
  },
  comparisonLabel: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  arrow: {
    fontSize: typography.size.lg,
    color: colors.textSecondary,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  exerciseInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  exerciseName: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  exerciseE1rm: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  targetText: {
    fontSize: typography.size.md,
    color: colors.text,
  },
});

export default MuscleDetailModal;
