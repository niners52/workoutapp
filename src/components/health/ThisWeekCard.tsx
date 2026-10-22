import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { Card } from '../common';
import type { ThisWeekRow } from '../../services/thisWeek';

interface ThisWeekCardProps {
  rows: ThisWeekRow[] | null;
  error?: boolean;
  deload?: boolean;
  onRowPress: (muscleGroup: string) => void;
}

const n = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));
type Pct = `${number}%`;
const pct = (fraction: number): Pct => `${Math.max(0, Math.min(1, fraction)) * 100}%`;

/**
 * One bar per muscle, three parts that always mean the same thing:
 *   solid yellow   — done
 *   outlined       — still scheduled this week
 *   empty          — nothing planned: that is Flex work
 * Groups already at target fold into one line at the bottom.
 */
export function ThisWeekCard({ rows, error = false, deload = false, onRowPress }: ThisWeekCardProps) {
  const [showDone, setShowDone] = useState(false);

  if (error) {
    return (
      <Card style={styles.card}>
        <Text style={styles.empty}>Could not load this week</Text>
      </Card>
    );
  }
  if (!rows) {
    return (
      <Card style={styles.card}>
        <Text style={styles.empty}>Loading…</Text>
      </Card>
    );
  }

  const open = rows.filter(r => r.done < r.target || r.pinned);
  const met = rows.filter(r => r.done >= r.target && !r.pinned);
  const flexTotal = rows.reduce((s, r) => s + r.flex, 0);

  return (
    <Card padding="none" style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Sets this week</Text>
        <Text style={styles.subtitle}>
          {deload ? 'Deload week — targets paused' : flexTotal > 0 ? `${n(flexTotal)} sets need a Flex session` : 'The rest of the week covers it'}
        </Text>
        <View style={styles.legend} testID="this-week-legend">
          <LegendSwatch kind="done" label="Done" />
          <LegendSwatch kind="scheduled" label="Scheduled" />
          <LegendSwatch kind="flex" label="Flex" />
        </View>
      </View>

      {open.map(row => (
        <MuscleRow key={row.muscleGroup} row={row} onPress={() => onRowPress(row.muscleGroup)} />
      ))}

      {met.length > 0 && (
        <TouchableOpacity style={styles.metToggle} onPress={() => setShowDone(v => !v)} activeOpacity={0.7}>
          <Text style={styles.metText}>
            {showDone ? 'Hide' : 'Show'} {met.length} {met.length === 1 ? 'muscle' : 'muscles'} already at target ✓
          </Text>
        </TouchableOpacity>
      )}
      {showDone && met.map(row => <MuscleRow key={row.muscleGroup} row={row} onPress={() => onRowPress(row.muscleGroup)} />)}
    </Card>
  );
}

function MuscleRow({ row, onPress }: { row: ThisWeekRow; onPress: () => void }) {
  const met = row.done >= row.target;
  const doneShare = row.done / row.target;
  const scheduledShare = row.scheduled / row.target;
  const parts: string[] = [];
  if (row.scheduled > 0) parts.push(`${n(row.scheduled)} on ${row.scheduledDays.join('/')}`);
  if (row.flex > 0) parts.push(`${n(row.flex)} for Flex`);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7} testID={`this-week-row-${row.muscleGroup}`}>
      <View style={styles.rowTop}>
        <Text style={styles.label} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={[styles.count, met && styles.countMet]}>
          {n(row.done)} / {row.target}
          {met ? ' ✓' : ''}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.done, { width: pct(doneShare) }]} />
        {row.scheduled > 0 && <View style={[styles.scheduled, { width: pct(scheduledShare) }]} />}
      </View>
      {parts.length > 0 && <Text style={styles.detail}>{parts.join(' · ')}</Text>}
    </TouchableOpacity>
  );
}

function LegendSwatch({ kind, label }: { kind: 'done' | 'scheduled' | 'flex'; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, kind === 'done' ? styles.done : kind === 'scheduled' ? styles.scheduled : styles.swatchFlex]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const BAR_HEIGHT = 8;

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  header: {
    padding: spacing.base,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.base,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  swatch: {
    width: 14,
    height: BAR_HEIGHT,
    borderRadius: 2,
  },
  swatchFlex: {
    backgroundColor: colors.backgroundTertiary,
  },
  row: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  label: {
    flex: 1,
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  count: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  countMet: {
    color: colors.textSecondary,
  },
  track: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: colors.backgroundTertiary,
    overflow: 'hidden',
  },
  done: {
    height: BAR_HEIGHT,
    backgroundColor: colors.primary,
  },
  scheduled: {
    height: BAR_HEIGHT,
    backgroundColor: colors.primaryDim,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  detail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  metToggle: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  metText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  empty: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
  },
});
