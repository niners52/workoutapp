import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Path, Circle, Ellipse, G } from 'react-native-svg';
import { colors, typography, spacing } from '../../theme';
import { formatMeasurement } from '../../services/units';
import { BodyMeasurementTypeKey, BodyMeasurement } from '../../types';
import { UnitSystem } from '../../services/units';

interface MeasurementPoint {
  key: BodyMeasurementTypeKey;
  label: string;
  x: number; // viewBox coordinates (0-200)
  y: number; // viewBox coordinates (0-500)
  side?: 'left' | 'right';
}

// Measurement points in viewBox coords (200x500)
// Center points are spaced 55 units apart to prevent label overlap
const MEASUREMENT_POINTS: MeasurementPoint[] = [
  { key: 'neck', label: 'Neck', x: 100, y: 50 },
  { key: 'shoulders', label: 'Shoulders', x: 100, y: 105 },
  { key: 'chest', label: 'Chest', x: 100, y: 160 },
  { key: 'left_arm', label: 'L Arm', x: 32, y: 155, side: 'left' },
  { key: 'right_arm', label: 'R Arm', x: 168, y: 155, side: 'right' },
  { key: 'left_forearm', label: 'L Forearm', x: 22, y: 215, side: 'left' },
  { key: 'right_forearm', label: 'R Forearm', x: 178, y: 215, side: 'right' },
  { key: 'waist', label: 'Waist', x: 100, y: 215 },
  { key: 'hips', label: 'Hips', x: 100, y: 270 },
  { key: 'left_thigh', label: 'L Thigh', x: 72, y: 300, side: 'left' },
  { key: 'right_thigh', label: 'R Thigh', x: 128, y: 300, side: 'right' },
  { key: 'left_calf', label: 'L Calf', x: 70, y: 395, side: 'left' },
  { key: 'right_calf', label: 'R Calf', x: 130, y: 395, side: 'right' },
];

const VB_W = 200;
const VB_H = 500;

interface Props {
  measurements: Record<BodyMeasurementTypeKey, BodyMeasurement | undefined>;
  units: UnitSystem;
  onMeasurementPress: (key: BodyMeasurementTypeKey) => void;
  trends?: Record<string, 'up' | 'down' | 'same' | null>;
}

const CONTAINER_WIDTH = Dimensions.get('window').width - spacing.base * 4;
const CONTAINER_HEIGHT = 500;

// Athletic male silhouette — right side (mirrored for left)
// Drawn as one continuous outline for a clean look
const BODY_RIGHT_HALF = `
  M 100 55
  C 100 55, 108 56, 112 62
  C 114 65, 114 72, 112 76
  L 112 78
  C 130 80, 148 86, 155 95
  C 160 100, 162 105, 162 108
  L 162 110
  C 164 112, 170 118, 174 128
  C 178 138, 180 148, 180 155
  C 180 162, 178 170, 175 180
  C 172 190, 168 200, 164 210
  L 158 228
  C 156 232, 154 236, 152 240
  L 148 240
  C 148 238, 147 236, 146 234
  L 136 234
  C 138 240, 139 246, 139 250
  C 140 260, 142 270, 142 278
  C 142 290, 140 300, 138 310
  C 136 320, 134 330, 133 340
  C 131 355, 130 365, 130 375
  C 130 382, 131 390, 132 398
  C 133 405, 132 412, 130 420
  C 128 430, 124 440, 122 448
  L 120 460
  C 119 464, 118 468, 118 470
  L 140 472
  L 140 478
  L 115 478
  C 113 476, 112 474, 112 470
  C 112 466, 113 462, 114 458
  L 116 448
`;

const BODY_LEFT_HALF = `
  L 84 448
  C 86 454, 87 460, 88 466
  C 88 470, 88 474, 87 478
  L 60 478
  L 60 472
  L 82 470
  C 82 468, 81 464, 80 460
  L 78 448
  C 76 440, 72 430, 70 420
  C 68 412, 67 405, 68 398
  C 69 390, 70 382, 70 375
  C 70 365, 69 355, 67 340
  C 66 330, 64 320, 62 310
  C 60 300, 58 290, 58 278
  C 58 270, 60 260, 61 250
  C 61 246, 62 240, 64 234
  L 54 234
  C 53 236, 52 238, 52 240
  L 48 240
  C 46 236, 44 232, 42 228
  L 36 210
  C 32 200, 28 190, 25 180
  C 22 170, 20 162, 20 155
  C 20 148, 22 138, 26 128
  C 30 118, 36 112, 38 110
  L 38 108
  C 38 105, 40 100, 45 95
  C 52 86, 70 80, 88 78
  L 88 76
  C 86 72, 86 65, 88 62
  C 92 56, 100 55, 100 55
  Z
`;

export function BodyOutline({ measurements, units, onMeasurementPress, trends }: Props) {
  const toScreenX = (vx: number) => (vx / VB_W) * CONTAINER_WIDTH;
  const toScreenY = (vy: number) => (vy / VB_H) * CONTAINER_HEIGHT;

  const getTrendColor = (key: string): string => {
    const trend = trends?.[key];
    if (!trend) return colors.backgroundSecondary;
    switch (trend) {
      case 'up':
        return colors.success + '30';
      case 'down':
        return colors.error + '30';
      default:
        return colors.backgroundSecondary;
    }
  };

  return (
    <View style={styles.container}>
      <Svg
        width={CONTAINER_WIDTH}
        height={CONTAINER_HEIGHT}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
      >
        {/* Head */}
        <Ellipse
          cx="100"
          cy="32"
          rx="22"
          ry="28"
          fill={colors.backgroundTertiary}
          stroke={colors.textTertiary}
          strokeWidth="1"
        />

        {/* Body silhouette */}
        <Path
          d={BODY_RIGHT_HALF + BODY_LEFT_HALF}
          fill={colors.backgroundTertiary}
          stroke={colors.textTertiary}
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* Subtle muscle definition lines */}
        <G opacity={0.3}>
          {/* Chest split */}
          <Path
            d="M 100 98 L 100 155"
            stroke={colors.textTertiary}
            strokeWidth="0.5"
          />
          {/* Pec lines */}
          <Path
            d="M 78 115 C 85 125, 95 130, 100 128"
            stroke={colors.textTertiary}
            strokeWidth="0.5"
            fill="none"
          />
          <Path
            d="M 122 115 C 115 125, 105 130, 100 128"
            stroke={colors.textTertiary}
            strokeWidth="0.5"
            fill="none"
          />
          {/* Ab lines */}
          <Path
            d="M 88 165 L 112 165"
            stroke={colors.textTertiary}
            strokeWidth="0.5"
          />
          <Path
            d="M 87 180 L 113 180"
            stroke={colors.textTertiary}
            strokeWidth="0.5"
          />
          <Path
            d="M 86 195 L 114 195"
            stroke={colors.textTertiary}
            strokeWidth="0.5"
          />
        </G>

        {/* Measurement point dots */}
        {MEASUREMENT_POINTS.map((point) => {
          const measurement = measurements[point.key];
          const hasValue = measurement?.value !== undefined;

          return (
            <Circle
              key={point.key}
              cx={point.x}
              cy={point.y}
              r={6}
              fill={hasValue ? getTrendColor(point.key) : colors.backgroundSecondary}
              stroke={hasValue ? colors.primary : colors.textTertiary}
              strokeWidth={hasValue ? 1.5 : 0.8}
            />
          );
        })}
      </Svg>

      {/* Touchable measurement labels */}
      {MEASUREMENT_POINTS.map((point) => {
        const measurement = measurements[point.key];
        const hasValue = measurement?.value !== undefined;

        const screenX = toScreenX(point.x);
        const screenY = toScreenY(point.y);

        let labelStyle: any = {
          position: 'absolute' as const,
          top: screenY - 12,
        };

        if (point.side === 'left') {
          labelStyle.right = CONTAINER_WIDTH - screenX + 10;
        } else if (point.side === 'right') {
          labelStyle.left = screenX + 10;
        } else {
          labelStyle.left = screenX - 44;
          labelStyle.top = screenY + 10;
          labelStyle.width = 88;
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
