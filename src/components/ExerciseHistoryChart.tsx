import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { format, subMonths, subYears, isAfter } from 'date-fns';
import { colors, typography, spacing, borderRadius } from '../theme';
import { WorkoutSet, Workout, UnitSystem } from '../types';
import { displayWeight, estimated1RM, weightUnit } from '../services/units';
import { Card } from './common';

const screenWidth = Dimensions.get('window').width;

type ChartMetric = 'topSet' | 'e1rm' | 'volume';
type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'All';

interface SessionDataPoint {
  date: Date;
  topSetWeight: number;
  bestE1rm: number;
  totalVolume: number;
  sets: WorkoutSet[];
}

interface ExerciseHistoryChartProps {
  exerciseId: string;
  sets: WorkoutSet[];
  workouts: Workout[];
  units: UnitSystem;
}

export function ExerciseHistoryChart({
  exerciseId,
  sets,
  workouts,
  units,
}: ExerciseHistoryChartProps) {
  const [metric, setMetric] = useState<ChartMetric>('topSet');
  const [timeRange, setTimeRange] = useState<TimeRange>('3M');

  // Build workout dates map
  const workoutDates = useMemo(() => {
    const map = new Map<string, Date>();
    workouts.forEach(w => {
      const dateStr = w.completedAt || w.startedAt;
      if (dateStr) {
        map.set(w.id, new Date(dateStr));
      }
    });
    return map;
  }, [workouts]);

  // Filter and process sets for this exercise
  const sessionData = useMemo(() => {
    const exerciseSets = sets.filter(s => s.exerciseId === exerciseId && s.weight > 0 && s.reps > 0);

    // Group by workout date
    const sessionMap = new Map<string, { date: Date; sets: WorkoutSet[] }>();

    exerciseSets.forEach(set => {
      const workoutDate = workoutDates.get(set.workoutId);
      if (workoutDate) {
        const dateKey = format(workoutDate, 'yyyy-MM-dd');
        if (!sessionMap.has(dateKey)) {
          sessionMap.set(dateKey, { date: workoutDate, sets: [] });
        }
        sessionMap.get(dateKey)!.sets.push(set);
      }
    });

    // Calculate metrics for each session
    const dataPoints: SessionDataPoint[] = [];
    sessionMap.forEach(({ date, sets: sessionSets }) => {
      const topSetWeight = Math.max(...sessionSets.map(s => s.weight));
      const bestE1rm = Math.max(...sessionSets.map(s => estimated1RM(s.weight, s.reps)));
      const totalVolume = sessionSets.reduce((sum, s) => sum + s.weight * s.reps, 0);

      dataPoints.push({
        date,
        topSetWeight,
        bestE1rm,
        totalVolume,
        sets: sessionSets.sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()),
      });
    });

    // Sort by date ascending
    return dataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [sets, exerciseId, workoutDates]);

  // Filter by time range
  const filteredData = useMemo(() => {
    const now = new Date();
    let cutoffDate: Date;

    switch (timeRange) {
      case '1M':
        cutoffDate = subMonths(now, 1);
        break;
      case '3M':
        cutoffDate = subMonths(now, 3);
        break;
      case '6M':
        cutoffDate = subMonths(now, 6);
        break;
      case '1Y':
        cutoffDate = subYears(now, 1);
        break;
      case 'All':
      default:
        cutoffDate = new Date(0); // Beginning of time
        break;
    }

    return sessionData.filter(d => isAfter(d.date, cutoffDate));
  }, [sessionData, timeRange]);

  // Get chart data based on metric
  const chartData = useMemo(() => {
    if (filteredData.length === 0) return null;

    const labels = filteredData.map(d => format(d.date, 'M/d'));
    let data: number[];

    switch (metric) {
      case 'topSet':
        data = filteredData.map(d => displayWeight(d.topSetWeight, units));
        break;
      case 'e1rm':
        data = filteredData.map(d => displayWeight(d.bestE1rm, units));
        break;
      case 'volume':
        // For volume, convert each component weight
        data = filteredData.map(d => {
          // Volume is weight × reps, display in user's units
          // We need to convert the weight portion
          const volumeInUserUnits = d.sets.reduce((sum, s) =>
            sum + displayWeight(s.weight, units) * s.reps, 0
          );
          return Math.round(volumeInUserUnits);
        });
        break;
      default:
        data = [];
    }

    return { labels, data };
  }, [filteredData, metric, units]);

  // Most recent session
  const mostRecentSession = filteredData.length > 0 ? filteredData[filteredData.length - 1] : null;

  if (sessionData.length < 2) {
    return (
      <Card style={styles.container}>
        <Text style={styles.sectionTitle}>Progress Chart</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Log more sessions to see your progress chart.</Text>
          <Text style={styles.emptySubtext}>
            {sessionData.length === 0 ? 'No sessions logged yet.' : '1 session logged so far.'}
          </Text>
        </View>
      </Card>
    );
  }

  if (!chartData || chartData.data.length < 2) {
    return (
      <Card style={styles.container}>
        <Text style={styles.sectionTitle}>Progress Chart</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Not enough data in this time range.</Text>
          <Text style={styles.emptySubtext}>Try selecting a longer time range.</Text>
        </View>
        {/* Time Range Selector */}
        <View style={styles.timeRangeRow}>
          {(['1M', '3M', '6M', '1Y', 'All'] as TimeRange[]).map(range => (
            <TouchableOpacity
              key={range}
              style={[styles.timeRangeButton, timeRange === range && styles.timeRangeButtonSelected]}
              onPress={() => setTimeRange(range)}
            >
              <Text style={[styles.timeRangeText, timeRange === range && styles.timeRangeTextSelected]}>
                {range}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>
    );
  }

  const getMetricLabel = () => {
    switch (metric) {
      case 'topSet': return `Top Set (${weightUnit(units)})`;
      case 'e1rm': return `Est. 1RM (${weightUnit(units)})`;
      case 'volume': return `Volume (${weightUnit(units)})`;
    }
  };

  // Calculate min/max for better Y-axis
  const minValue = Math.min(...chartData.data);
  const maxValue = Math.max(...chartData.data);
  const yAxisPadding = (maxValue - minValue) * 0.1 || 10;

  return (
    <Card style={styles.container}>
      <Text style={styles.sectionTitle}>Progress Chart</Text>

      {/* Metric Toggle */}
      <View style={styles.metricRow}>
        {(['topSet', 'e1rm', 'volume'] as ChartMetric[]).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.metricButton, metric === m && styles.metricButtonSelected]}
            onPress={() => setMetric(m)}
          >
            <Text style={[styles.metricText, metric === m && styles.metricTextSelected]}>
              {m === 'topSet' ? 'Top Set' : m === 'e1rm' ? 'Est. 1RM' : 'Volume'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Time Range Selector */}
      <View style={styles.timeRangeRow}>
        {(['1M', '3M', '6M', '1Y', 'All'] as TimeRange[]).map(range => (
          <TouchableOpacity
            key={range}
            style={[styles.timeRangeButton, timeRange === range && styles.timeRangeButtonSelected]}
            onPress={() => setTimeRange(range)}
          >
            <Text style={[styles.timeRangeText, timeRange === range && styles.timeRangeTextSelected]}>
              {range}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        <LineChart
          data={{
            labels: chartData.labels.length > 8
              ? chartData.labels.filter((_, i) => i % Math.ceil(chartData.labels.length / 8) === 0 || i === chartData.labels.length - 1)
              : chartData.labels,
            datasets: [{ data: chartData.data }],
          }}
          width={screenWidth - spacing.base * 4 - 32}
          height={180}
          yAxisSuffix=""
          yAxisInterval={1}
          fromZero={metric === 'volume'}
          chartConfig={{
            backgroundColor: colors.backgroundSecondary,
            backgroundGradientFrom: colors.backgroundSecondary,
            backgroundGradientTo: colors.backgroundSecondary,
            decimalPlaces: metric === 'volume' ? 0 : 1,
            color: (opacity = 1) => `rgba(255, 197, 47, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(160, 160, 160, ${opacity})`,
            style: {
              borderRadius: borderRadius.md,
            },
            propsForDots: {
              r: '4',
              strokeWidth: '2',
              stroke: colors.primary,
              fill: colors.primary,
            },
            propsForBackgroundLines: {
              strokeDasharray: '',
              stroke: colors.backgroundTertiary,
              strokeWidth: 1,
            },
          }}
          bezier
          style={styles.chart}
        />
        <Text style={styles.chartYLabel}>{getMetricLabel()}</Text>
      </View>

      {/* Most Recent Session Stats */}
      {mostRecentSession && (
        <View style={styles.recentSession}>
          <Text style={styles.recentSessionTitle}>
            Most Recent: {format(mostRecentSession.date, 'MMM d, yyyy')}
          </Text>
          <View style={styles.recentSessionStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {displayWeight(mostRecentSession.topSetWeight, units)} {weightUnit(units)}
              </Text>
              <Text style={styles.statLabel}>Top Set</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{mostRecentSession.sets.length}</Text>
              <Text style={styles.statLabel}>Sets</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {Math.round(displayWeight(mostRecentSession.totalVolume /
                  mostRecentSession.sets.reduce((sum, s) => sum + s.reps, 0) || 1, units) *
                  mostRecentSession.sets.reduce((sum, s) => sum + s.reps, 0)
                ).toLocaleString()}
              </Text>
              <Text style={styles.statLabel}>Volume</Text>
            </View>
          </View>
          <Text style={styles.recentSessionSets}>
            {mostRecentSession.sets.map((s, i) =>
              `${displayWeight(s.weight, units)}×${s.reps}`
            ).join('  ')}
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  emptyContainer: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  metricRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  metricButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  metricButtonSelected: {
    backgroundColor: colors.primary,
  },
  metricText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  metricTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
  timeRangeRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  timeRangeButtonSelected: {
    backgroundColor: colors.primaryDim,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  timeRangeText: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  timeRangeTextSelected: {
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  chartContainer: {
    alignItems: 'center',
  },
  chart: {
    marginVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  chartYLabel: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    alignSelf: 'flex-start',
  },
  recentSession: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  recentSessionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  recentSessionStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.sm,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  recentSessionSets: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default ExerciseHistoryChart;
