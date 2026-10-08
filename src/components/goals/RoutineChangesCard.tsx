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

const ICONS: Record<RoutineChange['kind'], React.ComponentProps<typeof Ionicons>['name']> = {
  swap: 'swap-horizontal-outline',
  missed: 'remove-circle-outline',
  skippedDay: 'calendar-clear-outline',
};

function detailFor(item: RoutineChange): string {
  if (item.kind === 'skippedDay') {
    if (!item.instead) return `Not done ${item.dayLabel}`;
    const where = item.instead.locationName ? `a ${item.instead.locationName} workout` : 'another workout';
    return `Not done ${item.dayLabel} · did ${where} instead (${item.instead.sets} sets)`;
  }
  const verb = item.kind === 'swap' ? 'Swapped' : 'Not done';
  return `${verb} ${item.dayLabel}${item.templateName ? ` · ${item.templateName}` : ''}`;
}

/**
 * The week's change log: what was swapped for what, what the plan asked for
 * that did not happen, and scheduled days that never ran. Tapping an exercise
 * row opens its history.
 */
export function RoutineChangesCard({ items, onPressExercise }: RoutineChangesCardProps) {
  return (
    <Card padding="none">
      {items.map((item, index) => (
        <TouchableOpacity
          key={`${item.kind}-${item.exerciseId}-${item.at}`}
          testID={`routine-change-${item.kind}-${item.exerciseId}`}
          style={[styles.row, index === 0 && styles.rowFirst, index < items.length - 1 && styles.rowBorder]}
          onPress={() => item.kind !== 'skippedDay' && onPressExercise(item.kind === 'swap' ? item.replacementId ?? item.exerciseId : item.exerciseId)}
          disabled={item.kind === 'skippedDay'}
          activeOpacity={0.7}
        >
          <Ionicons
            name={ICONS[item.kind]}
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
            <Text style={styles.detail}>{detailFor(item)}</Text>
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
