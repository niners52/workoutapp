import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, borderRadius } from '../../theme';

interface ProgressBarProps {
  progress: number; // 0-100
  color?: string;
  backgroundColor?: string;
  height?: number;
  style?: ViewStyle;
  showOverflow?: boolean; // Show if progress > 100%
}

export function ProgressBar({
  progress,
  color = colors.primary,
  backgroundColor = colors.backgroundTertiary,
  height = 8,
  style,
  showOverflow = false,
}: ProgressBarProps) {
  // Cap at 100% unless showOverflow is true
  const displayProgress = showOverflow ? progress : Math.min(progress, 100);
  const isOverflow = progress > 100;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor, height, borderRadius: height / 2 },
        style,
      ]}
    >
      <View
        style={[
          styles.progress,
          {
            width: `${Math.min(displayProgress, 100)}%`,
            backgroundColor: isOverflow && !showOverflow ? colors.success : color,
            height,
            borderRadius: height / 2,
          },
        ]}
      />
      {showOverflow && isOverflow && (
        <View
          style={[
            styles.overflow,
            {
              width: `${Math.min(displayProgress - 100, 100)}%`,
              backgroundColor: colors.success,
              height,
              borderTopRightRadius: height / 2,
              borderBottomRightRadius: height / 2,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  progress: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  overflow: {
    position: 'absolute',
    left: '100%',
    top: 0,
  },
});

export default ProgressBar;
