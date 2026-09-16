import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import type { MissedExercise } from '../../services/missedExercises';

interface CatchUpCardProps {
  items: MissedExercise[];
  onPressExercise: (exerciseId: string) => void;
  onDismiss: (exerciseId: string) => void;
  onStart: () => void;
}

/**
 * Catch-up list: planned exercises from this week's finished workouts that
 * never got done. Skips and swap-outs both count; making the exercise up in
 * any later workout this week clears it.
 */
export function CatchUpCard({ items, onPressExercise, onDismiss, onStart }: CatchUpCardProps) {
  return (
    <Card padding="none">
      {items.map((item, index) => (
        <TouchableOpacity
          key={item.exercise.id}
          style={[styles.row, index === 0 && styles.rowFirst, index < items.length - 1 && styles.rowBorder]}
          onPress={() => onPressExercise(item.exercise.id)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={item.reason === 'swapped_out' ? 'swap-horizontal-outline' : 'remove-circle-outline'}
            size={20}
            color={colors.warning}
            style={styles.icon}
          />
          <View style={styles.info}>
            <Text style={styles.name}>{item.exercise.name}</Text>
            <Text style={styles.detail}>
              {item.reason === 'swapped_out'
                ? `Swapped out ${item.dayLabel}${item.replacementName ? ` for ${item.replacementName}` : ''}`
                : `Skipped ${item.dayLabel}`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.dismiss}
            onPress={() => onDismiss(item.exercise.id)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={`Dismiss ${item.exercise.name} for this week`}
          >
            <Ionicons name="close" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.startButton} onPress={onStart} activeOpacity={0.7}>
        <Ionicons name="barbell-outline" size={18} color={colors.primary} />
        <Text style={styles.startText}>Start Catch-Up Workout ({items.length})</Text>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  rowFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  icon: {
    marginRight: spacing.sm,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  detail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dismiss: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  startText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
});
