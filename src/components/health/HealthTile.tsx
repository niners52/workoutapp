import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';
import type { Tone } from '../../services/healthDashboard';

export function toneColor(tone: Tone): string {
  switch (tone) {
    case 'good':
      return colors.healthGood;
    case 'warning':
      return colors.warning;
    case 'danger':
      return colors.error;
    case 'muted':
      return colors.textTertiary;
    default:
      return colors.text;
  }
}

interface HealthTileProps {
  label: string;
  onPress?: () => void;
  testID?: string;
  /** warning/danger outline the tile; other tones leave it plain. */
  accent?: Tone;
  /** Half-width tile in a two-up row. */
  half?: boolean;
  children: React.ReactNode;
}

/** Dashboard tile: a label, a glanceable body, and a link out to detail. */
export function HealthTile({ label, onPress, testID, accent, half = false, children }: HealthTileProps) {
  const outline = accent === 'warning' || accent === 'danger' ? { borderColor: toneColor(accent) } : null;
  const body = (
    <View style={[styles.tile, outline]} testID={testID}>
      <View style={styles.labelRow}>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        {onPress && <Text style={styles.chevron}>›</Text>}
      </View>
      {children}
    </View>
  );
  if (!onPress) return <View style={half && styles.half}>{body}</View>;
  return (
    <TouchableOpacity style={half && styles.half} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  half: {
    flex: 1,
  },
  tile: {
    flexGrow: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  label: {
    flex: 1,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chevron: {
    fontSize: typography.size.md,
    color: colors.textTertiary,
    marginLeft: spacing.xs,
    lineHeight: typography.size.md,
  },
});

export default HealthTile;
