/**
 * A small line chart for a handful of dated points (scan history, ratios).
 * One series, first/last date on the x axis, min/max on the y axis.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { format, parseISO } from 'date-fns';
import { colors, typography, spacing } from '../../theme';

interface Props {
  points: { date: string; value: number }[];
  width: number;
  height?: number;
  color?: string;
  /** Decimal places on the y labels. */
  decimals?: number;
  emptyText?: string;
}

const PAD = { top: 12, right: 8, bottom: 20, left: 40 };

export function MiniLineChart({ points, width, height = 120, color = colors.primary, decimals = 1, emptyText }: Props) {
  if (points.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>{emptyText ?? 'No data yet'}</Text>
      </View>
    );
  }
  const values = points.map(p => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.max(Math.abs(hi) * 0.05, 1);
  const min = lo - span * 0.15;
  const max = hi + span * 0.15;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ');
  const label = (v: number) => v.toFixed(decimals);
  const dateLabel = (s: string) => format(parseISO(s), 'MMM d');

  return (
    <Svg width={width} height={height}>
      {[hi, lo].map((v, i) => (
        <React.Fragment key={i}>
          <Line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={colors.backgroundTertiary} strokeDasharray="4,4" strokeWidth={1} />
          <SvgText x={PAD.left - 6} y={y(v) + 4} fontSize="10" fill={colors.textTertiary} textAnchor="end">
            {label(v)}
          </SvgText>
        </React.Fragment>
      ))}
      {points.length > 1 && <Path d={d} stroke={color} strokeWidth={2} fill="none" />}
      {points.map((p, i) => (
        <Circle key={p.date + i} cx={x(i)} cy={y(p.value)} r={3.5} fill={color} />
      ))}
      <SvgText x={PAD.left} y={height - 4} fontSize="10" fill={colors.textTertiary} textAnchor="start">
        {dateLabel(points[0]!.date)}
      </SvgText>
      {points.length > 1 && (
        <SvgText x={width - PAD.right} y={height - 4} fontSize="10" fill={colors.textTertiary} textAnchor="end">
          {dateLabel(points[points.length - 1]!.date)}
        </SvgText>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    padding: spacing.sm,
  },
});
