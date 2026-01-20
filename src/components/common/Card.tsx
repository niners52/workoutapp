import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  padding?: 'none' | 'small' | 'medium' | 'large';
}

export function Card({
  children,
  style,
  elevated = false,
  padding = 'medium',
}: CardProps) {
  return (
    <View
      style={[
        styles.card,
        elevated && styles.elevated,
        styles[padding],
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
  },
  elevated: {
    backgroundColor: colors.backgroundTertiary,
  },
  none: {
    padding: 0,
  },
  small: {
    padding: spacing.sm,
  },
  medium: {
    padding: spacing.base,
  },
  large: {
    padding: spacing.lg,
  },
});

export default Card;
