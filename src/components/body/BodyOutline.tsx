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

// ─── Measurement points per silhouette (200×500 viewBox) ────────────────────
// Center measurements (neck, shoulders, chest, waist, hips) stay at x=100
// Side measurements shift inward for the female silhouette (narrower frame)

const MALE_MEASUREMENT_POINTS: MeasurementPoint[] = [
  { key: 'neck', label: 'Neck', x: 100, y: 62 },
  { key: 'shoulders', label: 'Shoulders', x: 100, y: 92 },
  { key: 'chest', label: 'Chest', x: 100, y: 135 },
  { key: 'left_arm', label: 'L Arm', x: 36, y: 150, side: 'left' },
  { key: 'right_arm', label: 'R Arm', x: 164, y: 150, side: 'right' },
  { key: 'left_forearm', label: 'L Forearm', x: 28, y: 210, side: 'left' },
  { key: 'right_forearm', label: 'R Forearm', x: 172, y: 210, side: 'right' },
  { key: 'waist', label: 'Waist', x: 100, y: 198 },
  { key: 'hips', label: 'Hips', x: 100, y: 240 },
  { key: 'left_thigh', label: 'L Thigh', x: 78, y: 295, side: 'left' },
  { key: 'right_thigh', label: 'R Thigh', x: 122, y: 295, side: 'right' },
  { key: 'left_calf', label: 'L Calf', x: 74, y: 390, side: 'left' },
  { key: 'right_calf', label: 'R Calf', x: 126, y: 390, side: 'right' },
];

const FEMALE_MEASUREMENT_POINTS: MeasurementPoint[] = [
  { key: 'neck', label: 'Neck', x: 100, y: 62 },
  { key: 'shoulders', label: 'Shoulders', x: 100, y: 92 },
  { key: 'chest', label: 'Chest', x: 100, y: 130 },
  { key: 'left_arm', label: 'L Arm', x: 42, y: 148, side: 'left' },
  { key: 'right_arm', label: 'R Arm', x: 158, y: 148, side: 'right' },
  { key: 'left_forearm', label: 'L Forearm', x: 34, y: 208, side: 'left' },
  { key: 'right_forearm', label: 'R Forearm', x: 166, y: 208, side: 'right' },
  { key: 'waist', label: 'Waist', x: 100, y: 195 },
  { key: 'hips', label: 'Hips', x: 100, y: 235 },
  { key: 'left_thigh', label: 'L Thigh', x: 76, y: 290, side: 'left' },
  { key: 'right_thigh', label: 'R Thigh', x: 124, y: 290, side: 'right' },
  { key: 'left_calf', label: 'L Calf', x: 74, y: 388, side: 'left' },
  { key: 'right_calf', label: 'R Calf', x: 126, y: 388, side: 'right' },
];

const VB_W = 200;
const VB_H = 500;

interface Props {
  measurements: Record<BodyMeasurementTypeKey, BodyMeasurement | undefined>;
  units: UnitSystem;
  onMeasurementPress: (key: BodyMeasurementTypeKey) => void;
  trends?: Record<string, 'up' | 'down' | 'same' | null>;
  sex?: 'male' | 'female' | null;
}

const CONTAINER_WIDTH = Dimensions.get('window').width - spacing.base * 4;
const CONTAINER_HEIGHT = 500;

// ─── Male Silhouette ────────────────────────────────────────────────────────
// Properly proportioned athletic male: 7.5-head canon
// Legs ≈ 50% of height, arms to mid-thigh, V-taper (broad shoulders, narrow waist)
// Head center y=33, shoulders y=88, waist y=195, crotch y=255, feet y=476

const MALE_BODY = `
  M 100 54
  C 106 54, 110 56, 113 60
  C 115 63, 114 66, 113 68
  C 120 72, 134 78, 148 84
  C 155 87, 160 90, 162 96
  C 164 102, 165 110, 166 118
  C 167 128, 170 140, 172 152
  C 174 164, 176 176, 177 186
  C 178 196, 178 206, 176 216
  C 174 228, 170 242, 166 254
  C 163 264, 161 270, 160 276
  L 158 282
  C 156 286, 153 287, 150 284
  C 152 276, 154 266, 156 256
  C 159 242, 161 228, 161 214
  C 161 202, 160 190, 158 178
  C 156 166, 152 154, 148 144
  C 145 136, 142 128, 139 120
  C 138 128, 136 140, 135 152
  C 134 166, 132 180, 130 194
  C 129 206, 128 216, 128 224
  C 129 234, 130 244, 133 254
  C 136 262, 138 270, 139 278
  C 140 288, 140 298, 138 308
  C 136 322, 134 336, 133 350
  C 132 362, 132 372, 134 382
  C 136 392, 136 402, 135 412
  C 134 422, 131 432, 128 442
  C 126 452, 124 460, 122 466
  L 120 472
  C 120 474, 120 476, 120 478
  L 138 478
  L 138 482
  L 116 482
  C 114 480, 114 477, 115 473
  C 116 468, 117 464, 118 458
  L 80 458
  C 82 464, 83 468, 84 473
  C 85 477, 85 480, 83 482
  L 62 482
  L 62 478
  L 80 478
  C 80 476, 80 474, 79 472
  L 78 466
  C 76 460, 74 452, 72 442
  C 69 432, 66 422, 65 412
  C 64 402, 64 392, 66 382
  C 68 372, 68 362, 67 350
  C 66 336, 64 322, 62 308
  C 60 298, 60 288, 61 278
  C 62 270, 64 262, 67 254
  C 70 244, 71 234, 72 224
  C 72 216, 71 206, 70 194
  C 68 180, 66 166, 65 152
  C 64 140, 62 128, 61 120
  C 58 128, 55 136, 52 144
  C 48 154, 44 166, 42 178
  C 40 190, 39 202, 39 214
  C 39 228, 41 242, 44 256
  C 46 266, 48 276, 50 284
  C 47 287, 44 286, 42 282
  L 40 276
  C 39 270, 37 264, 34 254
  C 30 242, 26 228, 24 216
  C 22 206, 22 196, 23 186
  C 24 176, 26 164, 28 152
  C 30 140, 33 128, 34 118
  C 35 110, 36 102, 38 96
  C 40 90, 45 87, 52 84
  C 66 78, 80 72, 87 68
  C 86 66, 85 63, 87 60
  C 90 56, 94 54, 100 54
  Z
`;

// ─── Female Silhouette ──────────────────────────────────────────────────────
// Properly proportioned athletic female: 7.5-head canon
// Narrower shoulders, wider hips (hourglass), thinner arms, longer legs proportionally

const FEMALE_BODY = `
  M 100 54
  C 106 54, 110 56, 112 60
  C 114 63, 113 66, 112 68
  C 118 72, 128 78, 142 84
  C 148 87, 152 90, 154 96
  C 156 102, 157 110, 158 118
  C 159 128, 160 140, 162 152
  C 163 162, 164 172, 165 182
  C 166 192, 166 202, 164 212
  C 162 224, 158 236, 154 248
  C 151 258, 149 264, 148 270
  L 146 276
  C 144 280, 141 281, 139 278
  C 140 270, 142 260, 144 250
  C 147 236, 149 224, 149 210
  C 149 198, 148 188, 146 176
  C 144 164, 141 154, 138 144
  C 136 136, 134 128, 132 120
  C 131 128, 130 138, 128 150
  C 127 164, 126 178, 124 192
  C 123 204, 122 214, 122 222
  C 123 232, 126 244, 130 256
  C 134 264, 137 272, 138 280
  C 140 290, 140 300, 138 310
  C 136 324, 134 338, 132 352
  C 131 364, 131 374, 132 384
  C 134 394, 134 404, 133 414
  C 131 424, 128 434, 126 444
  C 124 452, 122 460, 120 466
  L 118 472
  C 118 474, 118 476, 118 478
  L 136 478
  L 136 482
  L 114 482
  C 113 480, 112 477, 113 473
  C 114 468, 115 464, 116 458
  L 82 458
  C 84 464, 85 468, 86 473
  C 87 477, 87 480, 85 482
  L 64 482
  L 64 478
  L 82 478
  C 82 476, 82 474, 81 472
  L 80 466
  C 78 460, 76 452, 74 444
  C 72 434, 69 424, 67 414
  C 66 404, 66 394, 68 384
  C 69 374, 69 364, 68 352
  C 66 338, 64 324, 62 310
  C 60 300, 60 290, 62 280
  C 63 272, 66 264, 70 256
  C 74 244, 77 232, 78 222
  C 78 214, 77 204, 76 192
  C 74 178, 73 164, 72 150
  C 70 138, 69 128, 68 120
  C 66 128, 64 136, 62 144
  C 59 154, 56 164, 54 176
  C 52 188, 51 198, 51 210
  C 51 224, 53 236, 56 250
  C 58 260, 60 270, 61 278
  C 59 281, 56 280, 54 276
  L 52 270
  C 51 264, 49 258, 46 248
  C 42 236, 38 224, 36 212
  C 34 202, 34 192, 35 182
  C 36 172, 37 162, 38 152
  C 40 140, 41 128, 42 118
  C 43 110, 44 102, 46 96
  C 48 90, 52 87, 58 84
  C 72 78, 82 72, 88 68
  C 87 66, 87 63, 88 60
  C 90 56, 94 54, 100 54
  Z
`;

// ─── Head parameters ────────────────────────────────────────────────────────

const MALE_HEAD = { cx: 100, cy: 30, rx: 17, ry: 22 };
const FEMALE_HEAD = { cx: 100, cy: 30, rx: 16, ry: 21 };

// ─── Subtle definition lines ────────────────────────────────────────────────

function MaleDefinitionLines() {
  return (
    <G opacity={0.3}>
      {/* Chest split */}
      <Path
        d="M 100 90 L 100 160"
        stroke={colors.textTertiary}
        strokeWidth="0.5"
      />
      {/* Pec lines */}
      <Path
        d="M 72 115 C 80 126, 92 130, 100 128"
        stroke={colors.textTertiary}
        strokeWidth="0.5"
        fill="none"
      />
      <Path
        d="M 128 115 C 120 126, 108 130, 100 128"
        stroke={colors.textTertiary}
        strokeWidth="0.5"
        fill="none"
      />
      {/* Ab lines */}
      <Path d="M 88 168 L 112 168" stroke={colors.textTertiary} strokeWidth="0.5" />
      <Path d="M 87 182 L 113 182" stroke={colors.textTertiary} strokeWidth="0.5" />
      <Path d="M 86 196 L 114 196" stroke={colors.textTertiary} strokeWidth="0.5" />
    </G>
  );
}

function FemaleDefinitionLines() {
  return (
    <G opacity={0.25}>
      {/* Subtle waist curve */}
      <Path
        d="M 78 190 C 85 186, 95 184, 100 184 C 105 184, 115 186, 122 190"
        stroke={colors.textTertiary}
        strokeWidth="0.5"
        fill="none"
      />
      {/* Navel */}
      <Path
        d="M 98 196 C 99 198, 101 198, 102 196"
        stroke={colors.textTertiary}
        strokeWidth="0.4"
        fill="none"
      />
    </G>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BodyOutline({ measurements, units, onMeasurementPress, trends, sex }: Props) {
  const toScreenX = (vx: number) => (vx / VB_W) * CONTAINER_WIDTH;
  const toScreenY = (vy: number) => (vy / VB_H) * CONTAINER_HEIGHT;

  const isFemale = sex === 'female';
  const bodyPath = isFemale ? FEMALE_BODY : MALE_BODY;
  const head = isFemale ? FEMALE_HEAD : MALE_HEAD;
  const points = isFemale ? FEMALE_MEASUREMENT_POINTS : MALE_MEASUREMENT_POINTS;

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
          cx={String(head.cx)}
          cy={String(head.cy)}
          rx={String(head.rx)}
          ry={String(head.ry)}
          fill={colors.backgroundTertiary}
          stroke={colors.textTertiary}
          strokeWidth="1"
        />

        {/* Body silhouette */}
        <Path
          d={bodyPath}
          fill={colors.backgroundTertiary}
          stroke={colors.textTertiary}
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* Subtle definition lines */}
        {isFemale ? <FemaleDefinitionLines /> : <MaleDefinitionLines />}

        {/* Measurement point dots */}
        {points.map((point) => {
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
      {points.map((point) => {
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
