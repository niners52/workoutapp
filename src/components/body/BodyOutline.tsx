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

// Athletic male silhouette — right side then left side
// 8-head proportions: broad shoulders, V-taper, arms to mid-thigh
const BODY_RIGHT_HALF = `
  M 100 52
  C 104 52, 108 54, 111 57
  C 113 60, 113 63, 113 66
  C 118 68, 132 74, 148 80
  C 156 84, 162 88, 165 94
  C 168 100, 170 106, 172 114
  C 174 124, 178 138, 180 150
  C 182 160, 184 172, 186 184
  C 188 196, 188 208, 187 218
  C 186 232, 182 248, 178 262
  C 175 272, 172 280, 170 288
  L 168 294
  C 166 298, 163 299, 160 296
  C 162 288, 164 278, 166 268
  C 169 254, 171 240, 172 226
  C 173 214, 172 202, 170 190
  C 168 178, 164 166, 160 156
  C 157 148, 154 140, 150 132
  C 147 126, 143 120, 140 116
  C 140 126, 139 138, 138 150
  C 137 165, 136 178, 134 192
  C 133 202, 132 210, 132 218
  C 133 228, 134 238, 137 248
  C 140 256, 142 264, 143 272
  C 144 282, 143 292, 142 302
  C 140 316, 138 330, 137 344
  C 136 354, 136 362, 137 372
  C 138 382, 139 392, 139 402
  C 139 410, 137 420, 134 430
  C 131 440, 128 448, 126 456
  L 124 464
  C 123 468, 122 471, 122 474
  L 142 476
  L 142 480
  L 118 480
  C 116 478, 115 475, 116 470
  C 117 466, 118 462, 119 458
  L 120 450
`;

const BODY_LEFT_HALF = `
  L 80 450
  C 81 454, 82 460, 83 466
  C 84 470, 84 475, 82 480
  L 58 480
  L 58 476
  L 78 474
  C 78 471, 77 468, 76 464
  L 74 456
  C 72 448, 69 440, 66 430
  C 63 420, 61 410, 61 402
  C 61 392, 62 382, 63 372
  C 64 362, 64 354, 63 344
  C 62 330, 60 316, 58 302
  C 57 292, 56 282, 57 272
  C 58 264, 60 256, 63 248
  C 66 238, 67 228, 68 218
  C 68 210, 67 202, 66 192
  C 64 178, 63 165, 62 150
  C 61 138, 60 126, 60 116
  C 57 120, 53 126, 50 132
  C 46 140, 43 148, 40 156
  C 36 166, 32 178, 30 190
  C 28 202, 27 214, 28 226
  C 29 240, 31 254, 34 268
  C 36 278, 38 288, 40 296
  C 37 299, 34 298, 32 294
  L 30 288
  C 28 280, 25 272, 22 262
  C 18 248, 14 232, 13 218
  C 12 208, 12 196, 14 184
  C 16 172, 18 160, 20 150
  C 22 138, 26 124, 28 114
  C 30 106, 32 100, 35 94
  C 38 88, 44 84, 52 80
  C 68 74, 82 68, 87 66
  C 87 63, 87 60, 89 57
  C 92 54, 96 52, 100 52
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
          cy="28"
          rx="17"
          ry="22"
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
            d="M 100 90 L 100 165"
            stroke={colors.textTertiary}
            strokeWidth="0.5"
          />
          {/* Pec lines */}
          <Path
            d="M 72 120 C 80 132, 92 138, 100 136"
            stroke={colors.textTertiary}
            strokeWidth="0.5"
            fill="none"
          />
          <Path
            d="M 128 120 C 120 132, 108 138, 100 136"
            stroke={colors.textTertiary}
            strokeWidth="0.5"
            fill="none"
          />
          {/* Ab lines */}
          <Path
            d="M 86 172 L 114 172"
            stroke={colors.textTertiary}
            strokeWidth="0.5"
          />
          <Path
            d="M 85 188 L 115 188"
            stroke={colors.textTertiary}
            strokeWidth="0.5"
          />
          <Path
            d="M 84 204 L 116 204"
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
