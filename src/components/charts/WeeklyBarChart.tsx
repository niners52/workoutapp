import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';

interface BarData {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  onPress?: () => void;
}

interface WeeklyBarChartProps {
  data: BarData[];
  title?: string;
  height?: number;
}

export function WeeklyBarChart({
  data,
  title,
  height = 120,
}: WeeklyBarChartProps) {
  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View style={[styles.chartContainer, { height }]}>
        {data.map((bar, index) => {
          const percentage = bar.maxValue > 0
            ? Math.min((bar.value / bar.maxValue) * 100, 100)
            : 0;
          const displayValue = bar.value > bar.maxValue
            ? `${Math.round((bar.value / bar.maxValue) * 100)}%`
            : `${Math.round(percentage)}%`;

          return (
            <TouchableOpacity
              key={index}
              style={styles.barContainer}
              onPress={bar.onPress}
              disabled={!bar.onPress}
              activeOpacity={bar.onPress ? 0.7 : 1}
            >
              <View style={styles.barWrapper}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${percentage}%`,
                      backgroundColor: bar.color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.valueText}>{displayValue}</Text>
              <Text style={styles.labelText}>{bar.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  barWrapper: {
    flex: 1,
    width: 40,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: borderRadius.sm,
  },
  valueText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginTop: spacing.sm,
  },
  labelText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});

export default WeeklyBarChart;
