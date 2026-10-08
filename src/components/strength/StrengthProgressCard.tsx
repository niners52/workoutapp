import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../common';
import { colors, typography, spacing } from '../../theme';
import { STRENGTH_LEVEL_COLORS } from '../../services/strengthStandards';
import type { StrengthHighlight } from '../../services/strengthProgress';

interface StrengthProgressCardProps {
  items: StrengthHighlight[];
  onPress?: () => void;
}

/** Where each lift stands, and what the next level costs in pounds. */
export function StrengthProgressCard({ items, onPress }: StrengthProgressCardProps) {
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress} disabled={!onPress}>
      <Card padding="none">
        {items.map((item, index) => (
          <View key={item.exerciseName} style={[styles.row, index < items.length - 1 && styles.rowBorder]}>
            <View style={[styles.dot, { backgroundColor: STRENGTH_LEVEL_COLORS[item.level] }]} />
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {item.exerciseName}
              </Text>
              <Text style={styles.level}>
                {item.previousLevelLabel
                  ? `Now ${item.levelLabel} — up from ${item.previousLevelLabel}`
                  : item.levelLabel}
              </Text>
            </View>
            {item.poundsToNext !== null && item.nextLevelLabel ? (
              <View style={styles.next}>
                {item.atThreshold ? (
                  <Text style={styles.nextValue}>on the edge</Text>
                ) : (
                  <Text style={styles.nextValue}>{item.poundsToNext} lb</Text>
                )}
                <Text style={styles.nextLabel}>
                  {item.atThreshold ? `of ${item.nextLevelLabel}` : `to ${item.nextLevelLabel}`}
                </Text>
              </View>
            ) : (
              <Ionicons name="trophy-outline" size={18} color={STRENGTH_LEVEL_COLORS.elite} />
            )}
          </View>
        ))}
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  level: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  next: {
    alignItems: 'flex-end',
  },
  nextValue: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  nextLabel: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
});
