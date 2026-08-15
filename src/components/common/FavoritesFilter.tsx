import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../theme';

interface FavoritesFilterProps {
  showFavoritesOnly: boolean;
  onChange: (showFavoritesOnly: boolean) => void;
  /** Number of favorites available in the current list; hides the control at 0. */
  favoriteCount: number;
  /**
   * Keep the control visible at 0 favorites. Used on the library screen, where
   * rows have tappable stars — the filter doubles as a running count while
   * mass-favoriting, so hiding it there would be confusing rather than tidy.
   */
  showWhenEmpty?: boolean;
  style?: ViewStyle;
}

/**
 * All / Favorites toggle. Rendered in every exercise picker so the control sits
 * in the same place whether the user is browsing the library, swapping an
 * exercise, or building a routine.
 *
 * Hidden entirely when the user has no favorites — an empty filter is a dead end.
 */
export function FavoritesFilter({
  showFavoritesOnly,
  onChange,
  favoriteCount,
  showWhenEmpty = false,
  style,
}: FavoritesFilterProps) {
  if (favoriteCount === 0 && !showWhenEmpty) return null;

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        style={[styles.chip, !showFavoritesOnly && styles.chipSelected]}
        onPress={() => onChange(false)}
        accessibilityRole="button"
        accessibilityState={{ selected: !showFavoritesOnly }}
      >
        <Text style={[styles.chipText, !showFavoritesOnly && styles.chipTextSelected]}>
          All
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.chip, showFavoritesOnly && styles.chipSelected]}
        onPress={() => onChange(true)}
        accessibilityRole="button"
        accessibilityState={{ selected: showFavoritesOnly }}
      >
        <Ionicons
          name="star"
          size={12}
          color={showFavoritesOnly ? colors.textOnPrimary : colors.primary}
          style={styles.chipIcon}
        />
        <Text style={[styles.chipText, showFavoritesOnly && styles.chipTextSelected]}>
          Favorites ({favoriteCount})
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundTertiary,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  chipIcon: {
    marginRight: spacing.xs,
  },
  chipText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
});

export default FavoritesFilter;
