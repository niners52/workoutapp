import { StyleSheet } from 'react-native';

// Color palette - Milwaukee Brewers theme
export const colors = {
  // Primary colors (Gold)
  primary: '#B6922E', // Gold - buttons, progress bars, active states, accents
  primaryLight: '#D4A843', // Lighter gold for highlights
  primaryDark: '#8A6F23', // Darker gold - pressed states
  primaryDim: 'rgba(182, 146, 46, 0.15)', // Dimmed gold for badges

  // Background colors (Navy)
  background: '#0A1628', // Near-black with navy tint (main app background)
  backgroundSecondary: '#12284B', // Navy (cards, modals, input backgrounds)
  backgroundTertiary: '#1A3A5C', // Lighter navy (hover states, borders, dividers)
  backgroundElevated: '#234875', // Even lighter navy for elevated elements

  // Text colors
  text: '#FFFFFF', // White (headings, primary text)
  textSecondary: '#A0A0A0', // Gray (secondary text, labels)
  textTertiary: '#6B7280', // Darker gray (placeholders, disabled text)
  textOnPrimary: '#0A1628', // Dark text on gold buttons

  // Status colors
  success: '#B6922E', // Gold (completed workouts, goals met)
  warning: '#D97706', // Amber (approaching limits)
  error: '#DC2626', // Red (errors, delete actions)

  // Chart colors (Gold-accented)
  chartTraining: '#B6922E', // Gold for training
  chartProtein: '#D4A843', // Lighter gold for protein
  chartSleep: '#8A6F23', // Darker gold for sleep

  // Muscle group colors (Gold/Navy variations with complementary colors)
  muscleColors: {
    chest: '#B6922E', // Gold
    lats: '#4A7C9B', // Steel blue
    upper_back: '#5B8BA8', // Light steel blue
    front_delts: '#D4A843', // Light gold
    side_delts: '#E8C35A', // Bright gold
    rear_delts: '#9B7A2F', // Muted gold
    triceps: '#6B9AB8', // Soft blue
    biceps: '#C9A227', // Medium gold
    quads: '#3D6B8C', // Navy blue
    hamstrings: '#7BACC4', // Light blue
    glutes: '#A68523', // Dark gold
    calves: '#4E8FAB', // Teal blue
    abs: '#DDB640', // Bright gold
    forearms: '#5C95B0', // Medium blue
    lower_back: '#8B7322', // Bronze
    miscellaneous: '#708090', // Slate gray
  },

  // Border and separator
  border: '#1A3A5C', // Lighter navy
  separator: '#1A3A5C',

  // Overlay
  overlay: 'rgba(10, 22, 40, 0.7)',
};

// Typography
export const typography = {
  // Font sizes
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    xxl: 28,
    xxxl: 34,
  },

  // Font weights
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
};

// Spacing
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// Border radius
export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

// Common styles
export const commonStyles = StyleSheet.create({
  // Containers
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenPadding: {
    paddingHorizontal: spacing.base,
  },

  // Cards
  card: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  cardElevated: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },

  // Lists
  listItem: {
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  listItemFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  listItemLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
    borderBottomWidth: 0,
  },

  // Text
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  bodyText: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  secondaryText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  // Buttons - Gold with dark text for primary actions
  buttonPrimary: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  buttonPrimaryText: {
    color: colors.textOnPrimary, // Dark text on gold
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  buttonSecondary: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  buttonSecondaryText: {
    color: colors.primary, // Gold text
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  buttonDestructive: {
    backgroundColor: colors.error,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // Inputs - Navy background with gold focus
  input: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    fontSize: typography.size.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Rows
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  rowBetween: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },

  // Misc
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginVertical: spacing.md,
  },
});

export default {
  colors,
  typography,
  spacing,
  borderRadius,
  commonStyles,
};
