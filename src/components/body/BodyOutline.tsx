import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { formatMeasurement } from '../../services/units';
import { BodyMeasurementTypeKey, BodyMeasurement } from '../../types';
import { UnitSystem } from '../../services/units';

interface MeasurementPoint {
  key: BodyMeasurementTypeKey;
  label: string;
  x: number;
  y: number;
  side?: 'left' | 'right';
}

// Measurement points on the body outline (normalized 0-100 coordinates)
const MEASUREMENT_POINTS: MeasurementPoint[] = [
  { key: 'neck', label: 'Neck', x: 50, y: 12 },
  { key: 'shoulders', label: 'Shoulders', x: 50, y: 18 },
  { key: 'chest', label: 'Chest', x: 50, y: 26 },
  { key: 'left_arm', label: 'L Arm', x: 22, y: 30, side: 'left' },
  { key: 'right_arm', label: 'R Arm', x: 78, y: 30, side: 'right' },
  { key: 'left_forearm', label: 'L Forearm', x: 15, y: 42, side: 'left' },
  { key: 'right_forearm', label: 'R Forearm', x: 85, y: 42, side: 'right' },
  { key: 'waist', label: 'Waist', x: 50, y: 40 },
  { key: 'hips', label: 'Hips', x: 50, y: 50 },
  { key: 'left_thigh', label: 'L Thigh', x: 38, y: 60, side: 'left' },
  { key: 'right_thigh', label: 'R Thigh', x: 62, y: 60, side: 'right' },
  { key: 'left_calf', label: 'L Calf', x: 38, y: 78, side: 'left' },
  { key: 'right_calf', label: 'R Calf', x: 62, y: 78, side: 'right' },
];

interface Props {
  measurements: Record<BodyMeasurementTypeKey, BodyMeasurement | undefined>;
  units: UnitSystem;
  onMeasurementPress: (key: BodyMeasurementTypeKey) => void;
  trends?: Record<string, 'up' | 'down' | 'same' | null>;
}

const CONTAINER_WIDTH = Dimensions.get('window').width - spacing.base * 4;
const CONTAINER_HEIGHT = 400;

export function BodyOutline({ measurements, units, onMeasurementPress, trends }: Props) {
  const scaleX = (x: number) => (x / 100) * CONTAINER_WIDTH;
  const scaleY = (y: number) => (y / 100) * CONTAINER_HEIGHT;

  const getTrendColor = (key: string): string => {
    const trend = trends?.[key];
    if (!trend) return colors.backgroundSecondary;
    switch (trend) {
      case 'up':
        return colors.success + '30'; // 30% opacity
      case 'down':
        return colors.error + '30';
      default:
        return colors.backgroundSecondary;
    }
  };

  return (
    <View style={styles.container}>
      <Svg width={CONTAINER_WIDTH} height={CONTAINER_HEIGHT} viewBox={`0 0 ${CONTAINER_WIDTH} ${CONTAINER_HEIGHT}`}>
        {/* Body outline - front facing silhouette */}
        <G>
          {/* Head */}
          <Circle
            cx={scaleX(50)}
            cy={scaleY(5)}
            r={scaleY(4)}
            fill={colors.backgroundTertiary}
            stroke={colors.textTertiary}
            strokeWidth="1"
          />

          {/* Neck */}
          <Path
            d={`
              M ${scaleX(47)} ${scaleY(9)}
              L ${scaleX(47)} ${scaleY(14)}
              L ${scaleX(53)} ${scaleY(14)}
              L ${scaleX(53)} ${scaleY(9)}
              Z
            `}
            fill={colors.backgroundTertiary}
            stroke={colors.textTertiary}
            strokeWidth="1"
          />

          {/* Torso */}
          <Path
            d={`
              M ${scaleX(35)} ${scaleY(14)}
              C ${scaleX(25)} ${scaleY(16)}, ${scaleX(22)} ${scaleY(20)}, ${scaleX(22)} ${scaleY(28)}
              L ${scaleX(22)} ${scaleY(30)}
              L ${scaleX(28)} ${scaleY(30)}
              C ${scaleX(30)} ${scaleY(35)}, ${scaleX(30)} ${scaleY(40)}, ${scaleX(32)} ${scaleY(48)}
              L ${scaleX(32)} ${scaleY(52)}
              L ${scaleX(38)} ${scaleY(52)}
              L ${scaleX(38)} ${scaleY(14)}
              Z
              M ${scaleX(62)} ${scaleY(14)}
              L ${scaleX(62)} ${scaleY(52)}
              L ${scaleX(68)} ${scaleY(52)}
              L ${scaleX(68)} ${scaleY(48)}
              C ${scaleX(70)} ${scaleY(40)}, ${scaleX(70)} ${scaleY(35)}, ${scaleX(72)} ${scaleY(30)}
              L ${scaleX(78)} ${scaleY(30)}
              L ${scaleX(78)} ${scaleY(28)}
              C ${scaleX(78)} ${scaleY(20)}, ${scaleX(75)} ${scaleY(16)}, ${scaleX(65)} ${scaleY(14)}
              Z
              M ${scaleX(38)} ${scaleY(14)}
              L ${scaleX(38)} ${scaleY(52)}
              L ${scaleX(62)} ${scaleY(52)}
              L ${scaleX(62)} ${scaleY(14)}
              L ${scaleX(53)} ${scaleY(14)}
              L ${scaleX(53)} ${scaleY(14)}
              L ${scaleX(47)} ${scaleY(14)}
              L ${scaleX(47)} ${scaleY(14)}
              Z
            `}
            fill={colors.backgroundTertiary}
            stroke={colors.textTertiary}
            strokeWidth="1"
          />

          {/* Left Arm */}
          <Path
            d={`
              M ${scaleX(22)} ${scaleY(28)}
              C ${scaleX(18)} ${scaleY(30)}, ${scaleX(16)} ${scaleY(34)}, ${scaleX(14)} ${scaleY(40)}
              C ${scaleX(12)} ${scaleY(46)}, ${scaleX(10)} ${scaleY(50)}, ${scaleX(10)} ${scaleY(52)}
              L ${scaleX(18)} ${scaleY(52)}
              C ${scaleX(18)} ${scaleY(48)}, ${scaleX(20)} ${scaleY(44)}, ${scaleX(22)} ${scaleY(38)}
              C ${scaleX(24)} ${scaleY(34)}, ${scaleX(26)} ${scaleY(32)}, ${scaleX(28)} ${scaleY(30)}
              L ${scaleX(22)} ${scaleY(28)}
              Z
            `}
            fill={colors.backgroundTertiary}
            stroke={colors.textTertiary}
            strokeWidth="1"
          />

          {/* Right Arm */}
          <Path
            d={`
              M ${scaleX(78)} ${scaleY(28)}
              C ${scaleX(82)} ${scaleY(30)}, ${scaleX(84)} ${scaleY(34)}, ${scaleX(86)} ${scaleY(40)}
              C ${scaleX(88)} ${scaleY(46)}, ${scaleX(90)} ${scaleY(50)}, ${scaleX(90)} ${scaleY(52)}
              L ${scaleX(82)} ${scaleY(52)}
              C ${scaleX(82)} ${scaleY(48)}, ${scaleX(80)} ${scaleY(44)}, ${scaleX(78)} ${scaleY(38)}
              C ${scaleX(76)} ${scaleY(34)}, ${scaleX(74)} ${scaleY(32)}, ${scaleX(72)} ${scaleY(30)}
              L ${scaleX(78)} ${scaleY(28)}
              Z
            `}
            fill={colors.backgroundTertiary}
            stroke={colors.textTertiary}
            strokeWidth="1"
          />

          {/* Left Leg */}
          <Path
            d={`
              M ${scaleX(32)} ${scaleY(52)}
              L ${scaleX(32)} ${scaleY(70)}
              C ${scaleX(32)} ${scaleY(78)}, ${scaleX(33)} ${scaleY(85)}, ${scaleX(34)} ${scaleY(92)}
              L ${scaleX(42)} ${scaleY(92)}
              C ${scaleX(42)} ${scaleY(85)}, ${scaleX(42)} ${scaleY(78)}, ${scaleX(44)} ${scaleY(70)}
              L ${scaleX(44)} ${scaleY(52)}
              Z
            `}
            fill={colors.backgroundTertiary}
            stroke={colors.textTertiary}
            strokeWidth="1"
          />

          {/* Right Leg */}
          <Path
            d={`
              M ${scaleX(56)} ${scaleY(52)}
              L ${scaleX(56)} ${scaleY(70)}
              C ${scaleX(58)} ${scaleY(78)}, ${scaleX(58)} ${scaleY(85)}, ${scaleX(58)} ${scaleY(92)}
              L ${scaleX(66)} ${scaleY(92)}
              C ${scaleX(67)} ${scaleY(85)}, ${scaleX(68)} ${scaleY(78)}, ${scaleX(68)} ${scaleY(70)}
              L ${scaleX(68)} ${scaleY(52)}
              Z
            `}
            fill={colors.backgroundTertiary}
            stroke={colors.textTertiary}
            strokeWidth="1"
          />
        </G>

        {/* Measurement points */}
        {MEASUREMENT_POINTS.map((point) => {
          const measurement = measurements[point.key];
          const hasValue = measurement?.value !== undefined;

          return (
            <G key={point.key}>
              <Circle
                cx={scaleX(point.x)}
                cy={scaleY(point.y)}
                r={8}
                fill={hasValue ? getTrendColor(point.key) : colors.backgroundSecondary}
                stroke={hasValue ? colors.primary : colors.textTertiary}
                strokeWidth={hasValue ? 2 : 1}
              />
            </G>
          );
        })}
      </Svg>

      {/* Touchable measurement labels */}
      {MEASUREMENT_POINTS.map((point) => {
        const measurement = measurements[point.key];
        const hasValue = measurement?.value !== undefined;

        // Position labels to the side for arms/legs, centered for torso
        let labelStyle: any = {
          position: 'absolute' as const,
          top: scaleY(point.y) - 12,
        };

        if (point.side === 'left') {
          labelStyle.right = CONTAINER_WIDTH - scaleX(point.x) + 12;
        } else if (point.side === 'right') {
          labelStyle.left = scaleX(point.x) + 12;
        } else {
          // Center measurements - show below the point
          labelStyle.left = scaleX(point.x) - 40;
          labelStyle.top = scaleY(point.y) + 12;
          labelStyle.width = 80;
          labelStyle.alignItems = 'center';
        }

        return (
          <TouchableOpacity
            key={point.key}
            style={[styles.measurementLabel, labelStyle]}
            onPress={() => onMeasurementPress(point.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.labelText, hasValue && styles.labelTextActive]}>
              {point.label}
            </Text>
            {hasValue && measurement?.value !== undefined && (
              <Text style={styles.labelValue}>
                {formatMeasurement(measurement.value, units)}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  measurementLabel: {
    flexDirection: 'column',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  labelText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  labelTextActive: {
    color: colors.text,
  },
  labelValue: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
});

export default BodyOutline;
