import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, subMonths, subYears, startOfDay } from 'date-fns';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import {
  getMeasurementType,
  MEASUREMENT_INSTRUCTIONS,
  isIncreasePositive,
} from '../constants/bodyMeasurements';
import { getTypedMeasurementHistory } from '../services/storage';
import { formatMeasurement, displayMeasurement, measurementUnit } from '../services/units';
import { RootStackParamList } from '../navigation/types';
import { BodyMeasurementTypeKey } from '../types';

type RouteProps = RouteProp<RootStackParamList, 'MeasurementHistory'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '6M', label: '6M' },
  { key: '1Y', label: '1Y' },
  { key: 'ALL', label: 'All' },
];

const CHART_WIDTH = Dimensions.get('window').width - spacing.base * 4;
const CHART_HEIGHT = 180;
const CHART_PADDING = { top: 20, right: 10, bottom: 30, left: 45 };

export function MeasurementHistoryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { measurementType } = route.params;
  const { userSettings } = useData();

  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('3M');
  const [history, setHistory] = useState<{ date: string; value: number }[]>([]);

  const typeConfig = getMeasurementType(measurementType);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let startDate: Date;
      const endDate = new Date();

      switch (timeRange) {
        case '1M':
          startDate = subMonths(endDate, 1);
          break;
        case '3M':
          startDate = subMonths(endDate, 3);
          break;
        case '6M':
          startDate = subMonths(endDate, 6);
          break;
        case '1Y':
          startDate = subYears(endDate, 1);
          break;
        case 'ALL':
          startDate = subYears(endDate, 10); // Far enough back
          break;
        default:
          startDate = subMonths(endDate, 3);
      }

      const data = await getTypedMeasurementHistory(
        measurementType as BodyMeasurementTypeKey,
        startDate,
        endDate
      );
      setHistory(data);
    } catch (error) {
      console.error('Failed to load measurement history:', error);
    } finally {
      setLoading(false);
    }
  }, [measurementType, timeRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    navigation.setOptions({
      title: typeConfig?.label || 'Measurement History',
    });
  }, [navigation, typeConfig]);

  // Chart calculations
  const chartData = history.map((item) => ({
    date: new Date(item.date),
    value: displayMeasurement(item.value, userSettings.units),
  }));

  const minValue = chartData.length > 0 ? Math.min(...chartData.map((d) => d.value)) : 0;
  const maxValue = chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) : 0;
  const valueRange = maxValue - minValue || 1;
  const paddedMin = minValue - valueRange * 0.1;
  const paddedMax = maxValue + valueRange * 0.1;
  const paddedRange = paddedMax - paddedMin;

  const chartInnerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const chartInnerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const getX = (index: number) => {
    if (chartData.length <= 1) return CHART_PADDING.left + chartInnerWidth / 2;
    return CHART_PADDING.left + (index / (chartData.length - 1)) * chartInnerWidth;
  };

  const getY = (value: number) => {
    return CHART_PADDING.top + chartInnerHeight - ((value - paddedMin) / paddedRange) * chartInnerHeight;
  };

  // Generate path for line chart
  let pathD = '';
  if (chartData.length > 0) {
    pathD = chartData.reduce((path, point, index) => {
      const x = getX(index);
      const y = getY(point.value);
      if (index === 0) {
        return `M ${x} ${y}`;
      }
      return `${path} L ${x} ${y}`;
    }, '');
  }

  // Y-axis labels
  const yLabels = [paddedMin, (paddedMin + paddedMax) / 2, paddedMax].map((v) =>
    Math.round(v * 10) / 10
  );

  // Calculate stats
  const latestValue = history.length > 0 ? history[history.length - 1].value : null;
  const firstValue = history.length > 0 ? history[0].value : null;
  const change = latestValue && firstValue ? latestValue - firstValue : null;

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>Current</Text>
            <Text style={styles.statValue}>
              {latestValue !== null
                ? formatMeasurement(latestValue, userSettings.units)
                : '--'}
            </Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>Change</Text>
            <Text
              style={[
                styles.statValue,
                change !== null && change !== 0 && {
                  color:
                    (change > 0 && isIncreasePositive(measurementType)) ||
                    (change < 0 && !isIncreasePositive(measurementType))
                      ? colors.success
                      : colors.error,
                },
              ]}
            >
              {change !== null
                ? `${change >= 0 ? '+' : ''}${displayMeasurement(change, userSettings.units)} ${measurementUnit(userSettings.units)}`
                : '--'}
            </Text>
          </Card>
        </View>

        {/* Time Range Selector */}
        <View style={styles.timeRangeContainer}>
          {TIME_RANGES.map((range) => (
            <TouchableOpacity
              key={range.key}
              style={[
                styles.timeRangeButton,
                timeRange === range.key && styles.timeRangeButtonActive,
              ]}
              onPress={() => setTimeRange(range.key)}
            >
              <Text
                style={[
                  styles.timeRangeText,
                  timeRange === range.key && styles.timeRangeTextActive,
                ]}
              >
                {range.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart */}
        <Card style={styles.chartCard}>
          {loading ? (
            <View style={styles.chartLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : chartData.length < 2 ? (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartEmptyText}>
                {chartData.length === 0
                  ? 'No measurements logged yet'
                  : 'Need at least 2 data points for chart'}
              </Text>
            </View>
          ) : (
            <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
              {/* Y-axis labels */}
              {yLabels.map((label, index) => (
                <SvgText
                  key={index}
                  x={CHART_PADDING.left - 8}
                  y={getY(label) + 4}
                  fontSize="11"
                  fill={colors.textTertiary}
                  textAnchor="end"
                >
                  {label}
                </SvgText>
              ))}

              {/* Horizontal grid lines */}
              {yLabels.map((label, index) => (
                <Line
                  key={index}
                  x1={CHART_PADDING.left}
                  y1={getY(label)}
                  x2={CHART_WIDTH - CHART_PADDING.right}
                  y2={getY(label)}
                  stroke={colors.backgroundTertiary}
                  strokeWidth="1"
                  strokeDasharray="4,4"
                />
              ))}

              {/* Line */}
              <Path d={pathD} stroke={colors.primary} strokeWidth="2" fill="none" />

              {/* Data points */}
              {chartData.map((point, index) => (
                <Circle
                  key={index}
                  cx={getX(index)}
                  cy={getY(point.value)}
                  r="4"
                  fill={colors.primary}
                />
              ))}

              {/* X-axis labels (first, middle, last) */}
              {chartData.length >= 2 && (
                <>
                  <SvgText
                    x={CHART_PADDING.left}
                    y={CHART_HEIGHT - 8}
                    fontSize="10"
                    fill={colors.textTertiary}
                    textAnchor="start"
                  >
                    {format(chartData[0].date, 'MMM d')}
                  </SvgText>
                  <SvgText
                    x={CHART_WIDTH - CHART_PADDING.right}
                    y={CHART_HEIGHT - 8}
                    fontSize="10"
                    fill={colors.textTertiary}
                    textAnchor="end"
                  >
                    {format(chartData[chartData.length - 1].date, 'MMM d')}
                  </SvgText>
                </>
              )}
            </Svg>
          )}
        </Card>

        {/* Unit indicator */}
        <Text style={styles.unitIndicator}>
          Values in {measurementUnit(userSettings.units)}
        </Text>

        {/* History List */}
        <Text style={styles.sectionTitle}>History</Text>
        {history.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>No measurements logged</Text>
            <Text style={styles.emptySubtext}>
              {MEASUREMENT_INSTRUCTIONS[measurementType]}
            </Text>
          </Card>
        ) : (
          <Card>
            {[...history].reverse().map((item, index) => (
              <View
                key={item.date}
                style={[styles.historyRow, index > 0 && styles.historyRowBorder]}
              >
                <Text style={styles.historyDate}>
                  {format(new Date(item.date), 'MMMM d, yyyy')}
                </Text>
                <Text style={styles.historyValue}>
                  {formatMeasurement(item.value, userSettings.units)}
                </Text>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  timeRangeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  timeRangeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
  },
  timeRangeButtonActive: {
    backgroundColor: colors.primary,
  },
  timeRangeText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  timeRangeTextActive: {
    color: colors.background,
  },
  chartCard: {
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  chartLoading: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartEmpty: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartEmptyText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  unitIndicator: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyCard: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  historyRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.backgroundTertiary,
  },
  historyDate: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  historyValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
});

export default MeasurementHistoryScreen;
