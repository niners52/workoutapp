import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import type { RemainingExercise } from '../../services/weekProgress';

interface LeftThisWeekCardProps {
  items: RemainingExercise[];
  onPressExercise: (exerciseId: string) => void;
  onDismiss: (exerciseId: string) => void;
  onStart: () => void;
}

/**
 * What this week's plan still expects: exercises scheduled for any day this
 * week, plus ones skipped in a finished session, minus anything already logged
 * this week in any session. One tap starts a workout with the lot, which is the
 * point — a night session to clear what the morning missed.
 */
export function LeftThisWeekCard({ items, onPressExercise, onDismiss, onStart }: LeftThisWeekCardProps) {
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
            name={item.reason === 'skipped' ? 'remove-circle-outline' : 'calendar-outline'}
            size={20}
            color={item.reason === 'skipped' ? colors.warning : colors.textSecondary}
            style={styles.icon}
          />
          <View style={styles.info}>
            <Text style={styles.name}>{item.exercise.name}</Text>
            <Text style={styles.detail}>
              {item.reason === 'skipped' ? `Skipped ${item.dayLabel}` : `Planned ${item.dayLabel}`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.dismiss}
            onPress={() => onDismiss(item.exercise.id)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={`Drop ${item.exercise.name} for this week`}
          >
            <Ionicons name="close" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.startButton} onPress={onStart} activeOpacity={0.7}>
        <Ionicons name="barbell-outline" size={18} color={colors.primary} />
        <Text style={styles.startText}>Start Workout With These ({items.length})</Text>
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
