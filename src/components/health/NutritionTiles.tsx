import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { ProgressBar } from '../common';
import {
  CALCIUM_LABEL,
  DAY_RULE_LABELS,
  formatInt,
  type CalciumTile,
  type CaloriesTile,
  type CarbsTile,
  type DayVerdict,
  type FatTile,
  type LoggingTile,
  type ProteinTile,
  type SodiumTile,
  type Tone,
} from '../../services/healthDashboard';
import { HealthTile, toneColor } from './HealthTile';

const RING_SIZE = 72;
const RING_STROKE = 8;

type Pct = `${number}%`;
const pct = (fraction: number): Pct => `${Math.max(0, Math.min(1, fraction)) * 100}%`;

/** Alert tones show their color; a plain reading stays white; no data is gray. */
function headlineColor(tone: Tone | null): string {
  if (tone === null || tone === 'muted') return colors.textSecondary;
  return tone === 'normal' ? colors.text : toneColor(tone);
}

// ─── Sodium: a ring that counts DOWN ────────────────────────────────────────

export function SodiumTileView({ state, onPress }: { state: SodiumTile; onPress?: () => void }) {
  const budget = state.kind === 'budget' ? state : null;
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = RING_SIZE / 2;
  // The arc is the budget still left; over budget is a solid red ring.
  const fraction = !budget ? 0 : budget.tone === 'danger' ? 1 : budget.fractionRemaining;
  const arcColor = budget?.tone === 'danger' ? colors.error : budget?.tone === 'warning' ? colors.warning : colors.primary;

  return (
    <HealthTile label={state.label} onPress={onPress} testID="sodium-tile" accent={budget?.tone} half>
      <View style={styles.visual}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <G rotation="-90" origin={`${center}, ${center}`}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={colors.backgroundTertiary}
              strokeWidth={RING_STROKE}
              fill="transparent"
              strokeDasharray={budget ? undefined : '3 5'}
            />
            {fraction > 0 && (
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={arcColor}
                strokeWidth={RING_STROKE}
                fill="transparent"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - fraction)}
              />
            )}
          </G>
        </Svg>
      </View>
      <Text testID="sodium-headline" style={[styles.headline, { color: headlineColor(budget ? budget.tone : null) }]}>
        {state.headline}
      </Text>
      <Text style={styles.detail}>{state.detail}</Text>
    </HealthTile>
  );
}

// ─── Calcium: a target band, never a ring ───────────────────────────────────

function CalciumGauge({ state }: { state: CalciumTile }) {
  // The scale runs a quarter past the band; values beyond it pin to the edge.
  const scaleMax = state.highMg * 1.25;
  const markerColor = state.tone === 'good' ? colors.healthGood : state.tone === 'warning' ? colors.warning : colors.text;
  return (
    <View style={styles.visual}>
      <View style={[styles.gauge, state.kind !== 'band' && styles.gaugeDim]}>
        <View
          style={[
            styles.gaugeBand,
            { left: pct(state.lowMg / scaleMax), width: pct((state.highMg - state.lowMg) / scaleMax) },
          ]}
        />
        {state.mg !== null && (
          <View
            testID="calcium-marker"
            style={[styles.gaugeMarker, { left: pct(state.mg / scaleMax), backgroundColor: markerColor }]}
          />
        )}
      </View>
      <View style={styles.gaugeScale}>
        <Text style={[styles.gaugeTick, { left: pct(state.lowMg / scaleMax) }]}>
          {formatInt(state.lowMg)}–{formatInt(state.highMg)}
        </Text>
      </View>
    </View>
  );
}

export function CalciumTileView({ state, onPress }: { state: CalciumTile; onPress?: () => void }) {
  return (
    <HealthTile
      label={CALCIUM_LABEL}
      onPress={onPress}
      testID="calcium-tile"
      accent={state.kind === 'noData' ? undefined : state.tone}
      half
    >
      <CalciumGauge state={state} />
      <Text
        testID="calcium-headline"
        style={[styles.headline, { color: state.kind === 'noData' ? colors.textSecondary : headlineColor(state.tone) }]}
      >
        {state.headline}
      </Text>
      <Text style={styles.detail}>{state.detail}</Text>
      {state.kind === 'notSyncing' && <Text style={styles.link}>How to fix ›</Text>}
    </HealthTile>
  );
}

// ─── Protein: a floor, counts up, exceeding stays uncolored ─────────────────

export function ProteinTileView({ state, onPress }: { state: ProteinTile; onPress?: () => void }) {
  const progress = state.kind === 'progress' ? state : null;
  return (
    <HealthTile label="Protein floor" onPress={onPress} testID="protein-tile" half>
      <View style={styles.barVisual}>
        <ProgressBar progress={progress?.progressPct ?? 0} height={10} color={colors.primary} />
      </View>
      <Text testID="protein-headline" style={[styles.headline, { color: progress ? colors.text : colors.textSecondary }]}>
        {state.headline}
      </Text>
      <Text style={styles.detail}>{state.detail}</Text>
    </HealthTile>
  );
}

// ─── Calories: a band, so the visual is a band, not a ring ──────────────────

function BandGauge({ low, high, value, markerColor, dim }: { low: number; high: number; value: number | null; markerColor: string; dim: boolean }) {
  // The scale runs a quarter past the band so "over" has somewhere to sit.
  const scaleMax = high * 1.25;
  return (
    <View style={styles.visual}>
      <View style={[styles.gauge, dim && styles.gaugeDim]}>
        <View style={[styles.gaugeBand, { left: pct(low / scaleMax), width: pct((high - low) / scaleMax) }]} />
        {value !== null && (
          <View testID="calorie-marker" style={[styles.gaugeMarker, { left: pct(value / scaleMax), backgroundColor: markerColor }]} />
        )}
      </View>
      <View style={styles.gaugeScale}>
        <Text style={[styles.gaugeTick, { left: pct(low / scaleMax) }]}>
          {formatInt(low)}–{formatInt(high)}
        </Text>
      </View>
    </View>
  );
}

export function CaloriesTileView({ state, onPress }: { state: CaloriesTile; onPress?: () => void }) {
  const band = state.kind === 'band' ? state : null;
  return (
    <HealthTile label="Calories — band, not a ceiling" onPress={onPress} testID="calories-tile" accent={band ? state.tone : undefined} half>
      <BandGauge
        low={state.band.lowKcal}
        high={state.band.highKcal}
        value={band?.kcal ?? null}
        markerColor={band?.tone === 'good' ? colors.healthGood : band ? colors.warning : colors.text}
        dim={!band}
      />
      <Text testID="calories-headline" style={[styles.headline, styles.headlineSmall, { color: headlineColor(band ? state.tone : null) }]}>
        {state.headline}
      </Text>
      <Text style={styles.detail}>{state.detail}</Text>
    </HealthTile>
  );
}

// ─── Fat: a floor, amber only late in the day ───────────────────────────────

export function FatTileView({ state, onPress }: { state: FatTile; onPress?: () => void }) {
  const progress = state.kind === 'progress' ? state : null;
  const barColor = state.tone === 'warning' ? colors.warning : state.tone === 'good' ? colors.healthGood : colors.primary;
  return (
    <HealthTile label="Fat floor" onPress={onPress} testID="fat-tile" accent={state.tone === 'warning' ? 'warning' : undefined} half>
      <View style={styles.barVisual}>
        <ProgressBar
          progress={progress ? Math.min(100, (progress.grams / Math.max(1, progress.floorG)) * 100) : 0}
          height={10}
          color={barColor}
        />
      </View>
      <Text testID="fat-headline" style={[styles.headline, { color: headlineColor(progress ? state.tone : null) }]}>
        {state.headline}
      </Text>
      <Text testID="fat-detail" style={styles.detail}>
        {state.detail}
      </Text>
    </HealthTile>
  );
}

// ─── Carbs: flex fuel, information only, never colored ──────────────────────

export function CarbsTileView({ state, onPress }: { state: CarbsTile; onPress?: () => void }) {
  return (
    <HealthTile label="Carbs — flex fuel" onPress={onPress} testID="carbs-tile" half>
      <BandGauge low={state.lowG} high={state.highG} value={state.grams} markerColor={colors.text} dim={state.kind !== 'info'} />
      <Text testID="carbs-headline" style={[styles.headline, { color: state.grams === null ? colors.textSecondary : colors.text }]}>
        {state.headline}
      </Text>
      <Text testID="carbs-detail" style={styles.detail}>
        {state.detail}
      </Text>
    </HealthTile>
  );
}

// ─── Day verdict: the composite call on a complete day ──────────────────────

export function DayVerdictCard({ state, label, onPress }: { state: DayVerdict; label?: string; onPress?: () => void }) {
  const verdict = state.kind === 'verdict' ? state : null;
  const tone: Tone = verdict ? verdict.tone : 'muted';
  const icon = !verdict ? 'time-outline' : verdict.tone === 'good' ? 'checkmark-circle' : 'alert-circle';
  return (
    <HealthTile label={label ?? 'Last complete day'} onPress={onPress} testID="day-verdict" accent={verdict?.tone}>
      <View style={styles.verdictRow}>
        <Ionicons name={icon} size={22} color={tone === 'muted' ? colors.textTertiary : toneColor(tone)} />
        <View style={styles.verdictText}>
          <Text testID="day-verdict-headline" style={[styles.headline, styles.headlineSmall, { color: headlineColor(tone) }]}>
            {state.headline}
          </Text>
          <Text testID="day-verdict-detail" style={styles.detail}>
            {state.detail}
          </Text>
        </View>
      </View>
      {verdict && verdict.passed.length > 0 && (
        <Text testID="day-verdict-passed" style={styles.verdictPassed}>
          Met: {verdict.passed.map(r => DAY_RULE_LABELS[r]).join(', ')}
        </Text>
      )}
    </HealthTile>
  );
}

// ─── Logging completeness ───────────────────────────────────────────────────

export function LoggingTileView({ state, onPress }: { state: LoggingTile; onPress?: () => void }) {
  const icon = state.nudge ? 'alert-circle' : state.tone === 'muted' ? 'time-outline' : 'restaurant-outline';
  const iconColor = state.nudge ? colors.warning : state.tone === 'muted' ? colors.textTertiary : colors.textSecondary;
  return (
    <HealthTile label="Food logging" onPress={onPress} testID="logging-tile" accent={state.nudge ? 'warning' : undefined} half>
      <View style={styles.barVisual}>
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <Text
        testID="logging-headline"
        style={[styles.headline, styles.headlineSmall, { color: state.tone === 'muted' ? colors.textSecondary : colors.text }]}
      >
        {state.headline}
      </Text>
      <Text style={styles.detail}>{state.detail}</Text>
      {state.nudge && (
        <View style={styles.nudge}>
          <Text testID="logging-nudge" style={styles.nudgeText}>
            {state.nudge}
          </Text>
        </View>
      )}
    </HealthTile>
  );
}

const styles = StyleSheet.create({
  visual: {
    height: RING_SIZE,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  barVisual: {
    height: 28,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  headline: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  headlineSmall: {
    fontSize: typography.size.md,
  },
  detail: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  link: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  gauge: {
    height: 16,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
  },
  gaugeDim: {
    opacity: 0.5,
  },
  gaugeBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: colors.healthGoodDim,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.healthGood,
  },
  gaugeMarker: {
    position: 'absolute',
    width: 4,
    height: 28,
    marginLeft: -2,
    borderRadius: 2,
  },
  gaugeScale: {
    height: 16,
    marginTop: spacing.xs,
  },
  gaugeTick: {
    position: 'absolute',
    fontSize: typography.size.xs,
    color: colors.healthGood,
  },
  nudge: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.warningDim,
  },
  nudgeText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.warning,
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  verdictText: {
    flex: 1,
  },
  verdictPassed: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
});
