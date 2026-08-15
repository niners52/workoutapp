import React from 'react';
import { StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

interface FavoriteStarProps {
  isFavorite: boolean;
  /** Omit to render a non-interactive indicator (list rows). */
  onToggle?: () => void;
  size?: number;
  style?: ViewStyle;
  /** Accessible name of the exercise, so the label reads as an action. */
  exerciseName?: string;
}

/**
 * Star indicator for favorited exercises. With `onToggle` it's a tap target;
 * without one it's a plain indicator for dense list rows.
 */
export function FavoriteStar({
  isFavorite,
  onToggle,
  size = 20,
  style,
  exerciseName,
}: FavoriteStarProps) {
  const icon = (
    <Ionicons
      name={isFavorite ? 'star' : 'star-outline'}
      size={size}
      color={isFavorite ? colors.primary : colors.textTertiary}
    />
  );

  if (!onToggle) {
    return <View style={[styles.indicator, style]}>{icon}</View>;
  }

  const subject = exerciseName ? ` ${exerciseName}` : '';
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[styles.button, style]}
      activeOpacity={0.7}
      // Small glyph, so widen the touch target rather than the visual.
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityState={{ selected: isFavorite }}
      accessibilityLabel={
        isFavorite ? `Remove${subject} from favorites` : `Add${subject} to favorites`
      }
    >
      {icon}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: spacing.xs,
  },
  indicator: {
    marginLeft: spacing.xs,
  },
});

export default FavoriteStar;
