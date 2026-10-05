import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import type { RoutineChange } from '../../services/routineChanges';

interface RoutineChangesCardProps {
  items: RoutineChange[];
  onPressExercise: (exerciseId: string) => void;
}

/**
 * The week's change log: what was swapped for what, and what the plan asked
 * for that did not happen. Tapping a row opens that exercise's history.
 */
export function RoutineChangesCard({ items, onPressExercise }: RoutineChangesCardProps) {
  return (
    <Card padding="none">
      {items.map((item, index) => (
        <TouchableOpacity
          key={`${item.kind}-${item.exerciseId}-${item.at}`}
          testID={`routine-change-${item.kind}-${item.exerciseId}`}
          style={[styles.row, index === 0 && styles.rowFirst, index < items.length - 1 && styles.rowBorder]}
          onPress={() => onPressExercise(item.kind === 'swap' ? item.replacementId ?? item.exerciseId : item.exerciseId)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={item.kind === 'swap' ? 'swap-horizontal-outline' : 'remove-circle-outline'}
            size={20}
            color={item.kind === 'swap' ? colors.primary : colors.warning}
            style={styles.icon}
          />
          <View style={styles.info}>
            {item.kind === 'swap' ? (
              <Text style={styles.name}>
                {item.exerciseName} <Text style={styles.arrow}>→</Text> {item.replacementName}
              </Text>
            ) : (
              <Text style={styles.name}>{item.exerciseName}</Text>
            )}
            <Text style={styles.detail}>
              {item.kind === 'swap' ? 'Swapped' : 'Not done'} {item.dayLabel}
              {item.templateName ? ` · ${item.templateName}` : ''}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
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
  arrow: {
    color: colors.textSecondary,
  },
  detail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
