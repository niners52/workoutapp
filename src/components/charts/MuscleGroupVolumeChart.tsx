import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MuscleGroupVolume, MUSCLE_GROUP_DISPLAY_NAMES, ANALYTICS_CATEGORIES } from '../../types';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { ProgressBar } from '../common/ProgressBar';

interface MuscleGroupVolumeChartProps {
  volumes: MuscleGroupVolume[];
  onMuscleGroupPress?: (muscleGroup: string) => void;
  showZeroTargets?: boolean;
}

export function MuscleGroupVolumeChart({
  volumes,
  onMuscleGroupPress,
  showZeroTargets = false,
}: MuscleGroupVolumeChartProps) {
  // Filter out zero-target muscle groups unless specified
  const displayVolumes = showZeroTargets
    ? volumes
    : volumes.filter(v => v.target > 0);

  // Group by parent muscle group for display
  const groupedVolumes = organizeByParentGroup(displayVolumes);

  return (
    <View style={styles.container}>
      {groupedVolumes.map((group, index) => (
        <View key={index} style={styles.groupContainer}>
          {group.isParentHeader && (
            <Text style={styles.parentHeader}>{group.parentName}</Text>
          )}
          {group.items.map((volume) => (
            <TouchableOpacity
              key={volume.muscleGroup}
              style={styles.muscleRow}
              onPress={() => onMuscleGroupPress?.(volume.muscleGroup)}
              disabled={!onMuscleGroupPress}
              activeOpacity={0.7}
            >
              <View style={styles.labelRow}>
                <Text style={styles.muscleLabel}>
                  {MUSCLE_GROUP_DISPLAY_NAMES[volume.muscleGroup]}
                </Text>
                <Text style={styles.setsText}>
                  {volume.sets}/{volume.target} sets
                </Text>
              </View>
              <ProgressBar
                progress={(volume.sets / volume.target) * 100}
                color={getColorForMuscleGroup(volume.muscleGroup)}
                height={6}
              />
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

interface GroupedVolume {
  parentName?: string;
  isParentHeader: boolean;
  items: MuscleGroupVolume[];
}

function organizeByParentGroup(volumes: MuscleGroupVolume[]): GroupedVolume[] {
  const groups: GroupedVolume[] = [];

  // Use ANALYTICS_CATEGORIES to organize muscle groups
  for (const category of ANALYTICS_CATEGORIES) {
    const categoryVolumes = volumes.filter(v =>
      category.muscleGroups.includes(v.muscleGroup)
    );

    if (categoryVolumes.length > 0) {
      groups.push({
        parentName: category.name,
        isParentHeader: true,
        items: categoryVolumes,
      });
    }
  }

  return groups;
}

function getColorForMuscleGroup(muscleGroup: string): string {
  const muscleColors = colors.muscleColors as Record<string, string>;
  return muscleColors[muscleGroup] || colors.primary;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  groupContainer: {
    marginBottom: spacing.md,
  },
  parentHeader: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  muscleRow: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  muscleLabel: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  setsText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
});

export default MuscleGroupVolumeChart;
