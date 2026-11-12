/**
 * Settings -> Flex: what each muscle is for this block (build / maintain /
 * covered) and how long a Flex session may run. Flex fills in this order:
 * owed build-tier work, then the Flex default template, then owed
 * maintain-tier work; covered muscles' owed work is left out.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card, NumberInput } from '../components/common';
import { useData } from '../contexts/DataContext';
import { DEFAULT_FLEX_MINUTES, DEFAULT_TIERS, type Tier } from '../services/rotationWeek';
import { DEFAULT_HEALTH_TARGETS, MUSCLE_GROUP_DISPLAY_NAMES } from '../types';

const TIERS: Array<{ value: Tier; label: string }> = [
  { value: 'build', label: 'Build' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'covered', label: 'Covered' },
];

/** Every muscle with a seeded tier, in the order the seed lists them. */
const MUSCLES = Object.keys(DEFAULT_TIERS);

export function FlexSettingsScreen() {
  const { userSettings, updateUserSettings } = useData();
  const t = userSettings.healthTargets ?? DEFAULT_HEALTH_TARGETS;
  const tiers = { ...DEFAULT_TIERS, ...(t.muscleTiers ?? {}) };
  const names = MUSCLE_GROUP_DISPLAY_NAMES as Record<string, string>;

  const setTier = (muscle: string, tier: Tier) =>
    updateUserSettings({ healthTargets: { ...t, muscleTiers: { ...tiers, [muscle]: tier } } });
  const setMinutes = (minutes: number) =>
    updateUserSettings({ healthTargets: { ...t, flexMinutes: Math.max(15, Math.round(minutes)) } });

  return (
    <ScrollView style={commonStyles.container} contentContainerStyle={styles.content}>
      <Text style={styles.section}>Flex length</Text>
      <Card>
        <View style={styles.lengthRow}>
          <Text style={styles.label}>Minutes</Text>
          <NumberInput value={t.flexMinutes ?? DEFAULT_FLEX_MINUTES} onChangeValue={setMinutes} step={5} min={15} max={240} suffix="min" />
        </View>
        <Text style={styles.hint}>
          Flex fills up to this. Durations come from how long each exercise has taken you before; anything that does not
          fit is listed as expiring Sunday.
        </Text>
      </Card>

      <Text style={styles.section}>Muscle tiers</Text>
      <Text style={[styles.hint, styles.padded]}>
        Build: owed work goes on Flex first. Maintain: owed work goes on last. Covered: owed work is left off — the
        Flex default template still fills it if it is under target.
      </Text>
      <Card padding="none">
        {MUSCLES.map((muscle, i) => (
          <View key={muscle} style={[styles.row, i > 0 && styles.rowBorder]}>
            <Text style={styles.label}>{names[muscle] ?? muscle}</Text>
            <View style={styles.segment}>
              {TIERS.map(option => {
                const on = tiers[muscle] === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.segmentItem, on && styles.segmentItemOn]}
                    onPress={() => setTier(muscle, option.value)}
                    testID={`tier-${muscle}-${option.value}`}
                  >
                    <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxxl,
  },
  section: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  lengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: typography.size.md,
    color: colors.text,
    flex: 1,
  },
  hint: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  padded: {
    marginBottom: spacing.sm,
    marginTop: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  segmentItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  segmentItemOn: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  segmentTextOn: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
});
