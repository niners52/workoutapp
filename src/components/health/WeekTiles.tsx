import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { Card } from '../common';
import type { BodyWeightTile, SleepTile, VolumeRow, WeeklyVolumeView } from '../../services/healthDashboard';
import { HealthTile, toneColor } from './HealthTile';

type Pct = `${number}%`;
const pct = (fraction: number): Pct => `${Math.max(0, Math.min(1, fraction)) * 100}%`;
const sets = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function DeloadBanner() {
  return (
    <View style={styles.deload} testID="deload-banner">
      <MaterialCommunityIcons name="restart" size={20} color={colors.primary} />
      <Text style={styles.deloadText}>Deload week — targets suspended</Text>
    </View>
  );
}

// ─── Weekly volume: gap to target, worst first ──────────────────────────────

function VolumeRowView({ row, onPress }: { row: VolumeRow; onPress: () => void }) {
  const met = row.gap !== null && row.gap <= 0;
  const gapColor = row.tone === 'normal' ? colors.text : toneColor(row.tone);
  const barColor = row.tone === 'warning' || row.tone === 'danger' ? toneColor(row.tone) : met ? colors.textTertiary : colors.primary;
  const gapText = row.target === null ? `${sets(row.sets)} sets` : met ? `${sets(row.sets)}/${row.target} ✓` : `${sets(row.gap!)} to go`;

  return (
    <TouchableOpacity style={styles.volumeRow} onPress={onPress} activeOpacity={0.7} testID={`volume-row-${row.key}`}>
      <View style={styles.volumeRowTop}>
        <Text style={styles.volumeLabel} numberOfLines={1}>
          {row.label}
        </Text>
        <Text testID={`volume-gap-${row.key}`} style={[styles.volumeGap, { color: gapColor }]}>
          {gapText}
        </Text>
      </View>
      {row.target !== null ? (
        <>
          <View style={styles.track}>
            <View style={[styles.fill, { width: pct(row.sets / row.target), backgroundColor: barColor }]} />
          </View>
          <Text style={styles.volumeSub}>
            {sets(row.sets)} of {row.target} sets
          </Text>
        </>
      ) : (
        <Text style={styles.volumeSub}>No target set</Text>
      )}
    </TouchableOpacity>
  );
}

interface WeeklyVolumeCardProps {
  view: WeeklyVolumeView | null;
  error?: boolean;
  onRowPress: (muscleGroup: string) => void;
  onOpenAnalytics: () => void;
}

export function WeeklyVolumeCard({ view, error = false, onRowPress, onOpenAnalytics }: WeeklyVolumeCardProps) {
  return (
    <Card padding="none" style={styles.card}>
      <TouchableOpacity style={styles.cardHeader} onPress={onOpenAnalytics} activeOpacity={0.7}>
        <Text style={styles.cardTitle}>Weekly volume · gap to target</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      {error ? (
        <Text style={styles.empty}>Could not load this week’s volume</Text>
      ) : !view ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : (
        <>
          {view.focus.length > 0 && <Text style={styles.subhead}>Focus</Text>}
          {view.focus.map(row => (
            <VolumeRowView key={row.key} row={row} onPress={() => onRowPress(row.muscleGroup)} />
          ))}
          {view.open.length + view.met.length === 0 ? (
            <Text style={styles.empty}>No weekly targets set</Text>
          ) : (
            <>
              <Text style={styles.subhead}>Biggest gaps</Text>
              {view.open.length === 0 && <Text style={styles.empty}>Every targeted group is at or over target</Text>}
              {view.open.map(row => (
                <VolumeRowView key={row.key} row={row} onPress={() => onRowPress(row.muscleGroup)} />
              ))}
            </>
          )}
          {view.met.length > 0 && (
            <TouchableOpacity style={styles.metRow} onPress={onOpenAnalytics} activeOpacity={0.7}>
              <Text testID="volume-met-summary" style={styles.metText}>
                {view.met.length} {view.met.length === 1 ? 'group' : 'groups'} at or over target ›
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Body weight ────────────────────────────────────────────────────────────

function Sparkline({ series, goal }: { series: Array<{ date: string; avg: number }>; goal: number }) {
  const W = 100;
  const H = 40;
  const first = series[0];
  if (!first) return null;
  const values = [...series.map(s => s.avg), goal];
  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;
  const span = Math.max(1, differenceInCalendarDays(parseISO(series[series.length - 1]!.date), parseISO(first.date)));
  const x = (date: string) => (series.length === 1 ? W / 2 : (differenceInCalendarDays(parseISO(date), parseISO(first.date)) / span) * W);
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  return (
    <Svg width="100%" height={40} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Line x1={0} x2={W} y1={y(goal)} y2={y(goal)} stroke={colors.healthGood} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <Polyline
        points={series.map(s => `${x(s.date)},${y(s.avg)}`).join(' ')}
        fill="none"
        stroke={colors.primary}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}

export function BodyWeightTileView({ state, onPress }: { state: BodyWeightTile; onPress?: () => void }) {
  return (
    <HealthTile label="Body weight" onPress={onPress} testID="weight-tile" accent={state.kind === 'stale' ? 'warning' : undefined} half>
      {state.kind === 'trend' ? (
        <>
          <View style={styles.sparkline}>
            <Sparkline series={state.series} goal={state.goal} />
          </View>
          <Text style={styles.headline}>
            {state.headline} <Text style={styles.headlineUnit}>7-day avg</Text>
          </Text>
          <Text testID="weight-detail" style={[styles.detail, state.atGoal && { color: colors.healthGood }]}>
            {state.detail}
          </Text>
          <Text testID="weight-calorie-copy" style={styles.detail}>
            {state.calorieCopy}
          </Text>
        </>
      ) : (
        <>
          <View style={styles.iconVisual}>
            <MaterialCommunityIcons
              name="scale-bathroom"
              size={26}
              color={state.kind === 'stale' ? colors.warning : colors.textTertiary}
            />
          </View>
          <Text testID="weight-detail" style={[styles.headline, { color: state.kind === 'stale' ? colors.warning : colors.textSecondary }]}>
            {state.headline}
          </Text>
          <Text style={styles.detail}>{state.detail}</Text>
        </>
      )}
    </HealthTile>
  );
}

// ─── Sleep ──────────────────────────────────────────────────────────────────

export function SleepTileView({ state, onPress }: { state: SleepTile; onPress?: () => void }) {
  const night = state.kind === 'night' ? state : null;
  return (
    <HealthTile label="Sleep last night" onPress={night ? onPress : undefined} testID="sleep-tile" half>
      <View style={styles.iconVisual}>
        <Ionicons name="moon-outline" size={24} color={night ? toneColor(night.tone) : colors.textTertiary} />
      </View>
      <Text style={[styles.headline, { color: night ? toneColor(night.tone) : colors.textSecondary }]}>{state.headline}</Text>
      <Text style={styles.detail}>{state.detail}</Text>
    </HealthTile>
  );
}

const styles = StyleSheet.create({
  deload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryDim,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  deloadText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  card: {
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  chevron: {
    fontSize: typography.size.lg,
    color: colors.textTertiary,
  },
  subhead: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
  empty: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  volumeRow: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  volumeRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  volumeLabel: {
    flex: 1,
    fontSize: typography.size.base,
    color: colors.text,
    marginRight: spacing.sm,
  },
  volumeGap: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.backgroundTertiary,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  volumeSub: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  metRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  metText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  sparkline: {
    height: 40,
    marginBottom: spacing.sm,
  },
  iconVisual: {
    height: 40,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  headline: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  headlineUnit: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.regular,
    color: colors.textSecondary,
  },
  detail: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
