import React from 'react';
import Svg, { Path, G, Ellipse } from 'react-native-svg';
import { PrimaryMuscleGroup } from '../../types';
import { colors } from '../../theme';
import { STRENGTH_LEVEL_COLORS } from '../../services/strengthStandards';
import { BODY_SILHOUETTE, FRONT_REGIONS } from './mapPaths';

interface MuscleMapProps {
  muscleColors: Partial<Record<PrimaryMuscleGroup, string>>;
  onMusclePress?: (muscleGroup: PrimaryMuscleGroup) => void;
  width: number;
  height: number;
}

const VB_W = 200;
const VB_H = 460;

const BODY_FILL = '#16304F';
const BODY_STROKE = '#3D5A80';
// Elite fill sits close to advanced in a single-hue ramp, so the top step
// carries a bright ring as a second cue.
const ELITE_RING = '#FFF6D6';

export function MuscleMapFront({ muscleColors, onMusclePress, width, height }: MuscleMapProps) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <Ellipse cx="100" cy="27.5" rx="19.5" ry="21.5" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1" />
      <Path
        d={BODY_SILHOUETTE}
        fill={BODY_FILL}
        stroke={BODY_STROKE}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {FRONT_REGIONS.map(([group, d], index) => {
        const fill = muscleColors[group as PrimaryMuscleGroup] || BODY_FILL;
        return (
          <G
            key={`${group}-${index}`}
            onPress={onMusclePress ? () => onMusclePress(group as PrimaryMuscleGroup) : undefined}
          >
            <Path
              d={d}
              fill={fill}
              stroke={fill === STRENGTH_LEVEL_COLORS.elite ? ELITE_RING : colors.background}
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </G>
        );
      })}
    </Svg>
  );
}

export default MuscleMapFront;
