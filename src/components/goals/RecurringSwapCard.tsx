import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import type { RecurringSwap } from '../../services/recurringSwaps';

interface RecurringSwapCardProps {
  items: RecurringSwap[];
  onMakePermanent: (swap: RecurringSwap) => void;
  onDismiss: (swap: RecurringSwap) => void;
}

/**
 * "You have done this three weeks running — should it just be the plan?"
 * Accepting rewrites the templates; declining stops the app asking about that
 * pair again.
 */
export function RecurringSwapCard({ items, onMakePermanent, onDismiss }: RecurringSwapCardProps) {
  return (
    <Card padding="none">
      {items.map((swap, index) => (
        <View key={swap.key} style={[styles.row, index < items.length - 1 && styles.rowBorder]}>
          <View style={styles.header}>
            <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
            <Text style={styles.title}>
              {swap.currentName} instead of {swap.originalName}
            </Text>
          </View>
          <Text style={styles.detail}>{swap.weeks} weeks running. Make it the plan?</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={() => onMakePermanent(swap)}
              testID={`promote-${swap.key}`}
            >
              <Text style={styles.buttonPrimaryText}>Update template</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => onDismiss(swap)}>
              <Text style={styles.buttonText}>Keep swapping</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: spacing.base,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  detail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  button: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.backgroundTertiary,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  buttonPrimaryText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.background,
  },
});
