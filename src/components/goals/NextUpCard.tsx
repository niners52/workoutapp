import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { DAY_NAMES } from '../../types';
import type { RotationState, SlotState } from '../../services/rotationWeek';

interface NextUpCardProps {
  state: RotationState;
  /** Start a rotation workout. Next up is the default; any slot can be picked. */
  onStart: (slot: SlotState) => void;
}

/**
 * The rotation, at a glance: which workouts are done this week, and the
 * lowest-numbered one that is not. The weekday is only a "usually" label —
 * W3 on a Thursday is still W3.
 */
export function NextUpCard({ state, onStart }: NextUpCardProps) {
  const next = state.nextUp;
  const done = state.slots.filter(s => s.performed).length;

  return (
    <Card padding="none" style={styles.card}>
      <View style={styles.body}>
        <View style={styles.info}>
          <Text style={styles.kicker}>
            {next ? 'Next up' : 'Rotation done'} · {done} of {state.slots.length} this week
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {next ? `${next.slot.label} — ${next.template?.name ?? 'Missing template'}` : 'Flex is next'}
          </Text>
          {next?.slot.usualDay != null && <Text style={styles.detail}>Usually {DAY_NAMES[next.slot.usualDay]}</Text>}
        </View>
        {next && (
          <TouchableOpacity style={styles.start} onPress={() => onStart(next)} activeOpacity={0.7} testID="next-up-start">
            <Ionicons name="play" size={16} color={colors.textOnPrimary} />
            <Text style={styles.startText}>Start</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.chips}>
        {state.slots.map(s => {
          const isNext = s.slot.id === next?.slot.id;
          return (
            <TouchableOpacity
              key={s.slot.id}
              style={[styles.chip, s.performed && styles.chipDone, isNext && styles.chipNext]}
              onPress={() => onStart(s)}
              activeOpacity={0.7}
              accessibilityLabel={`Start ${s.slot.label}${s.performed ? ', already done this week' : ''}`}
              testID={`next-up-slot-${s.slot.id}`}
            >
              <Text style={[styles.chipText, isNext && styles.chipTextNext]}>
                {s.slot.label}
                {s.performed ? ' ✓' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    gap: spacing.md,
  },
  info: {
    flex: 1,
  },
  kicker: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginTop: 2,
  },
  detail: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  start: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  startText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textOnPrimary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipDone: {
    backgroundColor: colors.backgroundTertiary,
  },
  chipNext: {
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  chipTextNext: {
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
});
