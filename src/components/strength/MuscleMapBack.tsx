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

// ─── Back Body Muscle Region Paths ──────────────────────────────────────────
// ViewBox: 200×500, 8-head athletic male proportions (rear view)

// Traps — left
const TRAP_LEFT = `
  M 90 66 C 86 68, 80 72, 74 78
  C 68 84, 64 88, 62 92
  C 66 90, 72 86, 80 82
  C 86 78, 92 74, 96 70
  C 94 68, 92 66, 90 66
  Z
`;

// Traps — right
const TRAP_RIGHT = `
  M 110 66 C 114 68, 120 72, 126 78
  C 132 84, 136 88, 138 92
  C 134 90, 128 86, 120 82
  C 114 78, 108 74, 104 70
  C 106 68, 108 66, 110 66
  Z
`;

// Rear delts — left
const REAR_DELT_LEFT = `
  M 58 86 C 52 90, 48 96, 46 102
  C 44 108, 46 114, 50 118
  C 54 114, 56 108, 58 102
  C 60 96, 62 92, 62 88
  C 60 86, 58 86, 58 86
  Z
`;

// Rear delts — right
const REAR_DELT_RIGHT = `
  M 142 86 C 148 90, 152 96, 154 102
  C 156 108, 154 114, 150 118
  C 146 114, 144 108, 142 102
  C 140 96, 138 92, 138 88
  C 140 86, 142 86, 142 86
  Z
`;

// Lats — left (large V-shaped)
const LAT_LEFT = `
  M 68 96 C 66 104, 64 112, 64 120
  C 64 132, 66 144, 70 154
  C 74 164, 78 172, 82 178
  C 86 184, 90 188, 94 190
  C 96 192, 98 190, 100 186
  C 100 178, 98 168, 94 158
  C 90 148, 86 136, 84 124
  C 82 114, 78 106, 74 100
  C 72 96, 70 96, 68 96
  Z
`;

// Lats — right
const LAT_RIGHT = `
  M 132 96 C 134 104, 136 112, 136 120
  C 136 132, 134 144, 130 154
  C 126 164, 122 172, 118 178
  C 114 184, 110 188, 106 190
  C 104 192, 102 190, 100 186
  C 100 178, 102 168, 106 158
  C 110 148, 114 136, 116 124
  C 118 114, 122 106, 126 100
  C 128 96, 130 96, 132 96
  Z
`;

// Upper back — left (between traps and lats)
const UPPER_BACK_LEFT = `
  M 74 80 C 70 86, 66 94, 66 102
  C 66 108, 68 112, 72 114
  C 78 116, 84 114, 88 110
  C 92 106, 96 100, 98 94
  C 96 90, 92 86, 88 82
  C 84 80, 78 78, 74 80
  Z
`;

// Upper back — right
const UPPER_BACK_RIGHT = `
  M 126 80 C 130 86, 134 94, 134 102
  C 134 108, 132 112, 128 114
  C 122 116, 116 114, 112 110
  C 108 106, 104 100, 102 94
  C 104 90, 108 86, 112 82
  C 116 80, 122 78, 126 80
  Z
`;

// Lower back (erectors)
const LOWER_BACK = `
  M 88 192 C 86 200, 84 210, 84 220
  C 84 230, 86 240, 90 248
  C 94 254, 98 256, 100 256
  C 102 256, 106 254, 110 248
  C 114 240, 116 230, 116 220
  C 116 210, 114 200, 112 192
  C 108 188, 104 186, 100 186
  C 96 186, 92 188, 88 192
  Z
`;

// Glutes — left
const GLUTE_LEFT = `
  M 82 254 C 78 260, 74 268, 72 276
  C 70 284, 70 292, 74 298
  C 78 304, 84 306, 90 304
  C 96 300, 98 294, 100 288
  C 100 280, 98 272, 96 264
  C 94 258, 90 254, 86 254
  Z
`;

// Glutes — right
const GLUTE_RIGHT = `
  M 118 254 C 122 260, 126 268, 128 276
  C 130 284, 130 292, 126 298
  C 122 304, 116 306, 110 304
  C 104 300, 102 294, 100 288
  C 100 280, 102 272, 104 264
  C 106 258, 110 254, 114 254
  Z
`;

// Hamstrings — left
const HAMSTRING_LEFT = `
  M 72 306 C 70 316, 68 328, 66 340
  C 64 354, 64 366, 66 378
  C 68 386, 72 390, 78 392
  C 84 392, 88 388, 90 382
  C 92 374, 92 364, 92 352
  C 92 338, 90 324, 88 312
  C 86 306, 80 304, 76 306
  Z
`;

// Hamstrings — right
const HAMSTRING_RIGHT = `
  M 128 306 C 130 316, 132 328, 134 340
  C 136 354, 136 366, 134 378
  C 132 386, 128 390, 122 392
  C 116 392, 112 388, 110 382
  C 108 374, 108 364, 108 352
  C 108 338, 110 324, 112 312
  C 114 306, 120 304, 124 306
  Z
`;

// Calves — left (rear view)
const CALF_LEFT = `
  M 66 394 C 64 402, 62 412, 62 422
  C 62 432, 64 440, 68 446
  C 72 450, 76 450, 80 448
  C 84 444, 86 438, 86 430
  C 86 420, 84 410, 82 400
  C 80 394, 74 392, 70 394
  Z
`;

// Calves — right
const CALF_RIGHT = `
  M 134 394 C 136 402, 138 412, 138 422
  C 138 432, 136 440, 132 446
  C 128 450, 124 450, 120 448
  C 116 444, 114 438, 114 430
  C 114 420, 116 410, 118 400
  C 120 394, 126 392, 130 394
  Z
`;

// ─── Body Outline (rear view) ──────────────────────────────────────────────

const BODY_OUTLINE_BACK = `
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
  { group: 'traps', path: TRAP_LEFT },
  { group: 'traps', path: TRAP_RIGHT },
  { group: 'rear_delts', path: REAR_DELT_LEFT },
  { group: 'rear_delts', path: REAR_DELT_RIGHT },
  { group: 'upper_back', path: UPPER_BACK_LEFT },
  { group: 'upper_back', path: UPPER_BACK_RIGHT },
  { group: 'lats', path: LAT_LEFT },
  { group: 'lats', path: LAT_RIGHT },
  { group: 'lower_back', path: LOWER_BACK },
  { group: 'glutes', path: GLUTE_LEFT },
  { group: 'glutes', path: GLUTE_RIGHT },
  { group: 'hamstrings', path: HAMSTRING_LEFT },
  { group: 'hamstrings', path: HAMSTRING_RIGHT },
  { group: 'calves', path: CALF_LEFT },
  { group: 'calves', path: CALF_RIGHT },
];

export function MuscleMapBack({ muscleColors, onMusclePress, width, height }: MuscleMapProps) {
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
        d={BODY_OUTLINE_BACK}
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

export default MuscleMapBack;
