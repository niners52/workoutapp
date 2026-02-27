import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { Card } from '../common';
import { useData } from '../../contexts/DataContext';
import { PrimaryMuscleGroup } from '../../types';
import { MuscleMapFront } from './MuscleMapFront';
import { MuscleMapBack } from './MuscleMapBack';
import { MuscleDetailModal } from './MuscleDetailModal';
import {
  calculateAllMuscleStrengthLevels,
  getStartSnapshotCutoff,
  MuscleStrengthResult,
  STRENGTH_LEVEL_COLORS,
  STRENGTH_LEVEL_LABELS,
  StrengthLevel,
} from '../../services/strengthStandards';

type ViewMode = 'front' | 'back';
type Snapshot = 'now' | 'start';

const MAP_WIDTH = Dimensions.get('window').width - spacing.base * 6;
const MAP_HEIGHT = MAP_WIDTH * 2.2; // Maintain ~200:440 aspect ratio

const LEGEND_LEVELS: StrengthLevel[] = ['beginner', 'novice', 'intermediate', 'advanced', 'elite'];

export function StrengthMapCard() {
  const { exercises, sets, workouts, getLatestBodyMeasurement, userSettings } = useData();

  const [view, setView] = useState<ViewMode>('front');
  const [snapshot, setSnapshot] = useState<Snapshot>('now');
  const [selectedMuscle, setSelectedMuscle] = useState<PrimaryMuscleGroup | null>(null);

  const bodyWeight = getLatestBodyMeasurement()?.weight;

  // Calculate current strength levels
  const currentLevels = useMemo(() => {
    if (!bodyWeight || bodyWeight <= 0) return new Map<PrimaryMuscleGroup, MuscleStrengthResult>();
    return calculateAllMuscleStrengthLevels(exercises, sets, workouts, bodyWeight);
  }, [exercises, sets, workouts, bodyWeight]);

  // Calculate start snapshot levels
  const startCutoff = useMemo(() => getStartSnapshotCutoff(workouts), [workouts]);

  const startLevels = useMemo(() => {
    if (!bodyWeight || bodyWeight <= 0 || !startCutoff) {
      return new Map<PrimaryMuscleGroup, MuscleStrengthResult>();
    }
    return calculateAllMuscleStrengthLevels(exercises, sets, workouts, bodyWeight, {
      beforeDate: startCutoff,
    });
  }, [exercises, sets, workouts, bodyWeight, startCutoff]);

  // Pick the active dataset
  const activeLevels = snapshot === 'now' ? currentLevels : startLevels;

  // Map levels to colors
  const muscleColors = useMemo(() => {
    const colorMap: Partial<Record<PrimaryMuscleGroup, string>> = {};
    for (const [mg, result] of activeLevels) {
      colorMap[mg] = STRENGTH_LEVEL_COLORS[result.level];
    }
    return colorMap;
  }, [activeLevels]);

  const handleMusclePress = (mg: PrimaryMuscleGroup) => {
    setSelectedMuscle(mg);
  };

  // No body weight — show prompt
  if (!bodyWeight || bodyWeight <= 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Strength Map</Text>
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>Log your body weight to see strength levels</Text>
          <Text style={styles.emptySubtext}>
            Body weight is needed to calculate strength ratios
          </Text>
        </Card>
      </View>
    );
  }

  const hasStartData = startLevels.size > 0 && startCutoff !== null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Strength Map</Text>
      <Card style={styles.card}>
        {/* Toggle Row */}
        <View style={styles.toggleRow}>
          {/* Front/Back */}
          <View style={styles.toggleGroup}>
            <TouchableOpacity
              style={[styles.toggleButton, view === 'front' && styles.toggleButtonActive]}
              onPress={() => setView('front')}
            >
              <Text style={[styles.toggleText, view === 'front' && styles.toggleTextActive]}>
                Front
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, view === 'back' && styles.toggleButtonActive]}
              onPress={() => setView('back')}
            >
              <Text style={[styles.toggleText, view === 'back' && styles.toggleTextActive]}>
                Back
              </Text>
            </TouchableOpacity>
          </View>

          {/* Now/Start */}
          {hasStartData && (
            <View style={styles.toggleGroup}>
              <TouchableOpacity
                style={[styles.toggleButton, snapshot === 'now' && styles.toggleButtonActive]}
                onPress={() => setSnapshot('now')}
              >
                <Text style={[styles.toggleText, snapshot === 'now' && styles.toggleTextActive]}>
                  Now
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, snapshot === 'start' && styles.toggleButtonActive]}
                onPress={() => setSnapshot('start')}
              >
                <Text
                  style={[styles.toggleText, snapshot === 'start' && styles.toggleTextActive]}
                >
                  Start
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Muscle Map */}
        <View style={styles.mapContainer}>
          {view === 'front' ? (
            <MuscleMapFront
              muscleColors={muscleColors}
              onMusclePress={handleMusclePress}
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
            />
          ) : (
            <MuscleMapBack
              muscleColors={muscleColors}
              onMusclePress={handleMusclePress}
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
            />
          )}
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          {LEGEND_LEVELS.map(level => (
            <View key={level} style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: STRENGTH_LEVEL_COLORS[level] }]}
              />
              <Text style={styles.legendLabel}>
                {STRENGTH_LEVEL_LABELS[level].slice(0, 3)}
              </Text>
            </View>
          ))}
        </View>

        {/* Tap hint */}
        {activeLevels.size > 0 && (
          <Text style={styles.tapHint}>Tap a muscle for details</Text>
        )}
      </Card>

      {/* Detail Modal */}
      <MuscleDetailModal
        visible={selectedMuscle !== null}
        onClose={() => setSelectedMuscle(null)}
        muscleGroup={selectedMuscle}
        currentResult={selectedMuscle ? currentLevels.get(selectedMuscle) || null : null}
        startResult={selectedMuscle ? startLevels.get(selectedMuscle) || null : null}
        units={userSettings.units}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  card: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  emptyCard: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  emptySubtext: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.sm,
    padding: 2,
  },
  toggleButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.sm - 1,
  },
  toggleButtonActive: {
    backgroundColor: colors.backgroundSecondary,
  },
  toggleText: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    fontWeight: typography.weight.medium,
  },
  toggleTextActive: {
    color: colors.text,
  },
  mapContainer: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  tapHint: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});

export default StrengthMapCard;
