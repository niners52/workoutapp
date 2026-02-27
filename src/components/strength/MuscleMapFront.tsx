import React from 'react';
import Svg, { Path, G, Ellipse } from 'react-native-svg';
import { PrimaryMuscleGroup } from '../../types';
import { colors } from '../../theme';

interface MuscleMapProps {
  muscleColors: Partial<Record<PrimaryMuscleGroup, string>>;
  onMusclePress?: (muscleGroup: PrimaryMuscleGroup) => void;
  width: number;
  height: number;
}

const VB_W = 200;
const VB_H = 500;

const DEFAULT_COLOR = colors.backgroundTertiary;
const OUTLINE_COLOR = colors.textTertiary;

// ─── Front Body Muscle Region Paths ─────────────────────────────────────────
// ViewBox: 200×500, 8-head athletic male proportions

// Chest — left pec
const CHEST_LEFT = `
  M 100 100 C 96 102, 88 106, 78 110
  C 72 113, 68 118, 66 124
  C 64 130, 66 138, 72 142
  C 80 146, 90 148, 100 146
  Z
`;

// Chest — right pec
const CHEST_RIGHT = `
  M 100 100 C 104 102, 112 106, 122 110
  C 128 113, 132 118, 134 124
  C 136 130, 134 138, 128 142
  C 120 146, 110 148, 100 146
  Z
`;

// Front delts — left
const FRONT_DELT_LEFT = `
  M 66 86 C 60 88, 54 92, 52 98
  C 50 104, 50 112, 52 118
  C 54 114, 58 110, 64 108
  C 70 106, 74 102, 72 96
  C 70 90, 68 88, 66 86
  Z
`;

// Front delts — right
const FRONT_DELT_RIGHT = `
  M 134 86 C 140 88, 146 92, 148 98
  C 150 104, 150 112, 148 118
  C 146 114, 142 110, 136 108
  C 130 106, 126 102, 128 96
  C 130 90, 132 88, 134 86
  Z
`;

// Side delts — left (visible from front as outer shoulder cap)
const SIDE_DELT_LEFT = `
  M 60 82 C 54 84, 48 88, 46 94
  C 44 100, 44 108, 46 114
  C 48 110, 50 106, 52 100
  C 54 94, 58 88, 62 86
  C 62 84, 60 82, 60 82
  Z
`;

// Side delts — right
const SIDE_DELT_RIGHT = `
  M 140 82 C 146 84, 152 88, 154 94
  C 156 100, 156 108, 154 114
  C 152 110, 150 106, 148 100
  C 146 94, 142 88, 138 86
  C 138 84, 140 82, 140 82
  Z
`;

// Biceps — left
const BICEP_LEFT = `
  M 48 120 C 46 126, 42 134, 40 142
  C 38 150, 36 158, 36 166
  C 38 172, 42 176, 46 176
  C 50 174, 54 170, 56 164
  C 58 156, 58 148, 56 140
  C 54 132, 52 126, 50 120
  Z
`;

// Biceps — right
const BICEP_RIGHT = `
  M 152 120 C 154 126, 158 134, 160 142
  C 162 150, 164 158, 164 166
  C 162 172, 158 176, 154 176
  C 150 174, 146 170, 144 164
  C 142 156, 142 148, 144 140
  C 146 132, 148 126, 150 120
  Z
`;

// Forearms — left
const FOREARM_LEFT = `
  M 36 178 C 34 186, 30 196, 28 206
  C 26 216, 24 226, 24 236
  C 24 244, 26 250, 30 254
  C 34 256, 38 252, 40 246
  C 42 238, 42 228, 42 218
  C 42 208, 42 198, 42 188
  C 42 182, 40 178, 38 178
  Z
`;

// Forearms — right
const FOREARM_RIGHT = `
  M 164 178 C 166 186, 170 196, 172 206
  C 174 216, 176 226, 176 236
  C 176 244, 174 250, 170 254
  C 166 256, 162 252, 160 246
  C 158 238, 158 228, 158 218
  C 158 208, 158 198, 158 188
  C 158 182, 160 178, 162 178
  Z
`;

// Abs — upper pair
const ABS_UPPER = `
  M 88 150 L 112 150 L 112 172 L 88 172 Z
`;

// Abs — middle pair
const ABS_MID = `
  M 87 174 L 113 174 L 114 196 L 86 196 Z
`;

// Abs — lower pair
const ABS_LOWER = `
  M 86 198 L 114 198 L 116 220 L 84 220 Z
`;

// Quads — left
const QUAD_LEFT = `
  M 78 272 C 76 280, 72 292, 70 304
  C 68 316, 66 330, 66 344
  C 66 356, 68 368, 72 378
  C 76 386, 82 388, 88 386
  C 92 382, 94 374, 94 364
  C 94 352, 92 338, 90 324
  C 88 308, 86 292, 86 280
  C 84 274, 82 272, 78 272
  Z
`;

// Quads — right
const QUAD_RIGHT = `
  M 122 272 C 124 280, 128 292, 130 304
  C 132 316, 134 330, 134 344
  C 134 356, 132 368, 128 378
  C 124 386, 118 388, 112 386
  C 108 382, 106 374, 106 364
  C 106 352, 108 338, 110 324
  C 112 308, 114 292, 114 280
  C 116 274, 118 272, 122 272
  Z
`;

// ─── Body Outline (non-muscle silhouette for context) ──────────────────────

const BODY_OUTLINE = `
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
  L 142 476 L 142 480 L 118 480
  C 116 478, 115 475, 116 470
  C 117 466, 118 462, 119 458
  L 120 450
  L 80 450
  C 81 454, 82 460, 83 466
  C 84 470, 84 475, 82 480
  L 58 480 L 58 476 L 78 474
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

// ─── Muscle region definitions ──────────────────────────────────────────────

interface MuscleRegion {
  group: PrimaryMuscleGroup;
  path: string;
}

const MUSCLE_REGIONS: MuscleRegion[] = [
  { group: 'chest', path: CHEST_LEFT },
  { group: 'chest', path: CHEST_RIGHT },
  { group: 'front_delts', path: FRONT_DELT_LEFT },
  { group: 'front_delts', path: FRONT_DELT_RIGHT },
  { group: 'side_delts', path: SIDE_DELT_LEFT },
  { group: 'side_delts', path: SIDE_DELT_RIGHT },
  { group: 'biceps', path: BICEP_LEFT },
  { group: 'biceps', path: BICEP_RIGHT },
  { group: 'forearms', path: FOREARM_LEFT },
  { group: 'forearms', path: FOREARM_RIGHT },
  { group: 'abs', path: ABS_UPPER },
  { group: 'abs', path: ABS_MID },
  { group: 'abs', path: ABS_LOWER },
  { group: 'quads', path: QUAD_LEFT },
  { group: 'quads', path: QUAD_RIGHT },
];

export function MuscleMapFront({ muscleColors, onMusclePress, width, height }: MuscleMapProps) {
  const getColor = (group: PrimaryMuscleGroup) => muscleColors[group] || DEFAULT_COLOR;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {/* Head */}
      <Ellipse
        cx="100"
        cy="28"
        rx="17"
        ry="22"
        fill={colors.backgroundTertiary}
        stroke={OUTLINE_COLOR}
        strokeWidth="0.8"
      />

      {/* Body outline (under muscle regions) */}
      <Path
        d={BODY_OUTLINE}
        fill={colors.backgroundTertiary}
        stroke={OUTLINE_COLOR}
        strokeWidth="0.8"
        strokeLinejoin="round"
        opacity={0.4}
      />

      {/* Muscle regions */}
      {MUSCLE_REGIONS.map((region, index) => (
        <G
          key={`${region.group}-${index}`}
          onPress={onMusclePress ? () => onMusclePress(region.group) : undefined}
        >
          <Path
            d={region.path}
            fill={getColor(region.group)}
            stroke={OUTLINE_COLOR}
            strokeWidth="0.5"
            opacity={0.85}
          />
        </G>
      ))}
    </Svg>
  );
}

export default MuscleMapFront;
