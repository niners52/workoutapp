import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, typography, spacing } from '../../theme';

interface ProgressRingProps {
  progress: number; // 0-100 (can exceed 100)
  size?: number;
  strokeWidth?: number;
  label: string;
  value?: string; // e.g., "6.5/7" or checkmark
  isBoolean?: boolean; // If true, show checkmark when progress >= 100
  color?: string;
  trackColor?: string;
}

export function ProgressRing({
  progress,
  size = 70,
  strokeWidth = 6,
  label,
  value,
  isBoolean = false,
  color = colors.primary,
  trackColor = colors.backgroundTertiary,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const cappedProgress = Math.min(progress, 100);
  const strokeDashoffset = circumference - (cappedProgress / 100) * circumference;

  const isComplete = progress >= 100;

  return (
    <View style={styles.container}>
      <View style={[styles.ringContainer, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            {/* Background track */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={trackColor}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Progress arc */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={isComplete ? colors.success : color}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </G>
        </Svg>
        {/* Center content */}
        <View style={[styles.centerContent, { width: size, height: size }]}>
          {isBoolean ? (
            <Text style={[styles.checkmark, isComplete && styles.checkmarkComplete]}>
              {isComplete ? '✓' : '○'}
            </Text>
          ) : (
            <Text style={styles.valueText} numberOfLines={1}>
              {value}
            </Text>
          )}
        </View>
        {/* Glow effect when complete */}
        {isComplete && (
          <View
            style={[
              styles.glowEffect,
              {
                width: size + 8,
                height: size + 8,
                borderRadius: (size + 8) / 2,
                borderColor: colors.success,
              },
            ]}
          />
        )}
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  ringContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  checkmark: {
    fontSize: typography.size.lg,
    color: colors.textTertiary,
  },
  checkmarkComplete: {
    color: colors.success,
    fontWeight: typography.weight.bold,
  },
  label: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  glowEffect: {
    position: 'absolute',
    borderWidth: 1,
    opacity: 0.3,
  },
});

export default ProgressRing;
