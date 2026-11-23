/**
 * Analytics -> Ratios: shoulders ÷ waist, shoulders ÷ narrowest waist and
 * waist ÷ chest from the tape measurements, latest value plus trend.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { format, parseISO } from 'date-fns';
import { colors, typography, spacing } from '../../theme';
import { Card } from '../common';
import { MiniLineChart } from '../charts/MiniLineChart';
import { useData } from '../../contexts/DataContext';
import { measurementRatios } from '../../services/bodyComposition';

const CHART_WIDTH = Dimensions.get('window').width - spacing.base * 4;

export function RatioCard() {
  const { bodyMeasurements } = useData();
  const ratios = useMemo(() => measurementRatios(bodyMeasurements), [bodyMeasurements]);

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Ratios</Text>
      <Card>
        {ratios.map((r, i) => {
          const good = r.change === null || r.change === 0 ? null : (r.change > 0) === r.spec.higherIsBetter;
          return (
            <View key={r.spec.key} style={[styles.ratio, i > 0 && styles.ratioBorder]}>
              <View style={styles.ratioHeader}>
                <Text style={styles.label}>{r.spec.label}</Text>
                <Text style={styles.value}>{r.latest ? r.latest.value.toFixed(3) : '—'}</Text>
              </View>
              <Text style={styles.detail}>
                {r.latest
                  ? `${format(parseISO(r.latest.date), 'MMM d')}${
                      r.change !== null
                        ? ` · ${r.change >= 0 ? '+' : ''}${r.change.toFixed(3)} since ${format(parseISO(r.series[0]!.date), 'MMM d')}`
                        : ''
                    }`
                  : `Log ${r.spec.numerator.replace('_', ' ')} and ${r.spec.denominator.replace('_', ' ')} on the same day`}
              </Text>
              {good !== null && (
                <Text style={[styles.trend, { color: good ? colors.healthGood : colors.warning }]}>
                  {good ? 'Trending the right way' : 'Trending the wrong way'}
                </Text>
              )}
              {r.series.length >= 2 && <MiniLineChart points={r.series} width={CHART_WIDTH} height={90} decimals={3} />}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  title: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text, marginBottom: spacing.sm },
  ratio: { paddingVertical: spacing.sm },
  ratioBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  ratioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: typography.size.md, color: colors.text },
  value: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text },
  detail: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: 2 },
  trend: { fontSize: typography.size.xs, marginTop: 2 },
});
