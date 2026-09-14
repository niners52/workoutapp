import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../../theme';
import { Card } from '../common';
import type { ReminderView } from '../../services/healthDashboard';

interface RemindersCardProps {
  items: ReminderView[] | null;
  onToggleDone: (id: string) => void;
  onManage: () => void;
}

export function RemindersCard({ items, onToggleDone, onManage }: RemindersCardProps) {
  return (
    <Card padding="none">
      <TouchableOpacity style={styles.header} onPress={onManage} activeOpacity={0.7}>
        <Text style={styles.title}>Next draws</Text>
        <Text style={styles.manage}>Manage ›</Text>
      </TouchableOpacity>

      {items === null ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>No open reminders. Add rechecks under Manage.</Text>
      ) : (
        items.map(({ reminder, status, dueLabel }, index) => {
          const emphasized = status !== 'upcoming';
          const dueColor = status === 'overdue' ? colors.error : status === 'dueNow' ? colors.warning : colors.textSecondary;
          return (
            <View
              key={reminder.id}
              testID={`reminder-${reminder.id}`}
              style={[styles.row, index > 0 && styles.rowBorder, emphasized && { borderLeftColor: dueColor }]}
            >
              <TouchableOpacity
                onPress={() => onToggleDone(reminder.id)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: false }}
                accessibilityLabel={`Mark ${reminder.title} done`}
              >
                <Ionicons name="ellipse-outline" size={24} color={emphasized ? dueColor : colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.info}>
                <Text style={[styles.reminderTitle, emphasized && styles.reminderTitleEmphasized]}>{reminder.title}</Text>
                {reminder.detail ? <Text style={styles.detail}>{reminder.detail}</Text> : null}
                <Text style={[styles.due, { color: dueColor }]}>{dueLabel}</Text>
              </View>
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  manage: {
    fontSize: typography.size.sm,
    color: colors.primary,
  },
  empty: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.base,
    paddingLeft: spacing.base - 3,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  info: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  reminderTitleEmphasized: {
    fontWeight: typography.weight.semibold,
  },
  detail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  due: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.xs,
  },
});
