import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, FlatList, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import type { Exercise, WorkoutLocation } from '../../types';
import type { FlexItem, FlexPlan } from '../../services/rotationWeek';

interface FlexCardProps {
  plan: FlexPlan;
  locations: WorkoutLocation[];
  locationId?: string;
  /** Exercises offered by "Add exercise", already filtered to the chosen gym. */
  addable: Exercise[];
  onChangeLocation: (locationId: string) => void;
  onRemove: (exerciseId: string) => void;
  onAdd: (exerciseId: string) => void;
  onPressExercise: (exerciseId: string) => void;
  onStart: () => void;
  /** Tiers and Flex length. */
  onOpenSettings: () => void;
}

const TIER_LABEL = { build: 'build', maintain: 'maintain', covered: 'covered' } as const;
const fmtMin = (m: number) => `${Math.round(m)} min`;

function reasonText(item: FlexItem): string {
  const why =
    item.priority === 'b'
      ? 'Flex default'
      : item.priority === 'added'
        ? 'Added'
        : item.priority === 'skipped'
          ? `Skipped in ${item.slotLabel ?? 'a workout'} · ${TIER_LABEL[item.tier]}`
          : `Owed from ${item.slotLabel ?? 'this week'} · ${TIER_LABEL[item.tier]}`;
  if (item.insteadOf) return `${why} · instead of ${item.insteadOf.name}`;
  if (item.notAvailableHere) return `${why} · not at this gym`;
  return why;
}

/**
 * Flex: exercises skipped from workouts already done, then owed build-tier
 * work, then the Flex default template, then owed maintain-tier work, fitted to the gym picked here and to the time cap.
 * What does not fit expires when the week resets. Built fresh from the week
 * each time; removing or adding an exercise sticks until the week ends.
 */
export function FlexCard({
  plan,
  locations,
  locationId,
  addable,
  onChangeLocation,
  onRemove,
  onAdd,
  onPressExercise,
  onStart,
  onOpenSettings,
}: FlexCardProps) {
  const items = plan.items;
  const [showExpired, setShowExpired] = useState(false);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  const inList = useMemo(() => new Set(items.map(i => i.exerciseId)), [items]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return addable.filter(e => !inList.has(e.id) && (!q || e.name.toLowerCase().includes(q))).slice(0, 60);
  }, [addable, inList, query]);

  return (
    <Card padding="none">
      <View style={styles.chips}>
        {locations.map(loc => (
          <TouchableOpacity
            key={loc.id}
            style={[styles.chip, loc.id === locationId && styles.chipOn]}
            onPress={() => onChangeLocation(loc.id)}
            activeOpacity={0.7}
            testID={`flex-location-${loc.id}`}
          >
            <Text style={[styles.chipText, loc.id === locationId && styles.chipTextOn]}>{loc.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText} testID="flex-minutes">
          {fmtMin(plan.totalMinutes)} of {fmtMin(plan.capMinutes)}
        </Text>
        <TouchableOpacity onPress={onOpenSettings} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Flex settings">
          <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <Text style={styles.empty}>Nothing owed, and the Flex default is covered. Add anything you like below.</Text>
      ) : (
        items.map(item => (
          <TouchableOpacity
            key={item.exerciseId}
            style={styles.row}
            onPress={() => onPressExercise(item.exerciseId)}
            activeOpacity={0.7}
            testID={`flex-item-${item.exerciseId}`}
          >
            <Ionicons
              name={item.priority === 'b' ? 'barbell-outline' : item.priority === 'added' ? 'add-circle-outline' : 'time-outline'}
              size={18}
              color={item.priority === 'skipped' || item.priority === 'a' ? colors.warning : colors.textSecondary}
              style={styles.icon}
            />
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.detail}>{reasonText(item)}</Text>
            </View>
            <Text style={styles.minutes}>
              {item.sets}× · {fmtMin(item.minutes)}
            </Text>
            <TouchableOpacity
              onPress={() => onRemove(item.exerciseId)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={`Take ${item.name} off Flex this week`}
            >
              <Ionicons name="close" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))
      )}

      {plan.expiresSunday.length > 0 && (
        <TouchableOpacity style={styles.expired} onPress={() => setShowExpired(v => !v)} activeOpacity={0.7} testID="flex-expires">
          <Text style={styles.expiredTitle}>
            {plan.expiresSunday.length} didn't fit · expires Sunday {showExpired ? '▾' : '▸'}
          </Text>
          {showExpired &&
            plan.expiresSunday.map(item => (
              <Text key={item.exerciseId} style={styles.detail}>
                {item.name} — {reasonText(item)} · {fmtMin(item.minutes)}
              </Text>
            ))}
        </TouchableOpacity>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={() => setPicking(true)} activeOpacity={0.7}>
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.actionText}>Add exercise</Text>
        </TouchableOpacity>
        {items.length > 0 && (
          <TouchableOpacity style={[styles.action, styles.actionPrimary]} onPress={onStart} activeOpacity={0.7}>
            <Ionicons name="play" size={16} color={colors.textOnPrimary} />
            <Text style={[styles.actionText, styles.actionTextPrimary]}>Start Flex ({items.length})</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={picking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(false)}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add to Flex</Text>
            <TouchableOpacity onPress={() => setPicking(false)}>
              <Text style={styles.sheetDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.search}
            placeholder="Search exercises"
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          <FlatList
            data={matches}
            keyExtractor={e => e.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickRow}
                onPress={() => {
                  onAdd(item.id);
                  setPicking(false);
                  setQuery('');
                }}
              >
                <Text style={styles.name}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.base,
    paddingBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  chipTextOn: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  summaryText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  minutes: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginHorizontal: spacing.sm,
  },
  expired: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    gap: 2,
  },
  expiredTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  empty: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  actionPrimary: {
    backgroundColor: colors.primary,
  },
  actionText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  actionTextPrimary: {
    color: colors.textOnPrimary,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
  },
  sheetTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  sheetDone: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  search: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.size.md,
    color: colors.text,
  },
  pickRow: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
});
