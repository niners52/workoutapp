import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Share,
  Platform,
  ActivityIndicator,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { colors, typography, spacing, borderRadius } from '../theme';
import {
  WorkoutSet,
  Exercise,
  MUSCLE_GROUP_DISPLAY_NAMES,
  PrimaryMuscleGroup,
  UnitSystem,
} from '../types';
import { formatWeight, weightUnit } from '../services/units';

interface MuscleGroupSetData {
  muscleGroup: string;
  sets: number;
  isSecondary: boolean;
}

interface WorkoutShareCardProps {
  workoutName: string;
  startedAt: string;
  completedAt: string;
  sets: WorkoutSet[];
  exercises: Exercise[];
  muscleGroupSets: MuscleGroupSetData[];
  units: UnitSystem;
}

interface ShareButtonProps {
  workoutName: string;
  startedAt: string;
  completedAt: string;
  sets: WorkoutSet[];
  exercises: Exercise[];
  muscleGroupSets: MuscleGroupSetData[];
  units: UnitSystem;
}

// Group sets by exercise
function groupSetsByExercise(sets: WorkoutSet[], exercises: Exercise[]) {
  const grouped = new Map<string, { exercise: Exercise | undefined; sets: WorkoutSet[] }>();

  sets.forEach(set => {
    if (!grouped.has(set.exerciseId)) {
      grouped.set(set.exerciseId, {
        exercise: exercises.find(e => e.id === set.exerciseId),
        sets: [],
      });
    }
    grouped.get(set.exerciseId)!.sets.push(set);
  });

  return Array.from(grouped.values());
}

// The shareable card view
function ShareableCard({
  workoutName,
  startedAt,
  completedAt,
  sets,
  exercises,
  muscleGroupSets,
  units,
}: WorkoutShareCardProps) {
  const startTime = parseISO(startedAt);
  const endTime = parseISO(completedAt);
  const durationMinutes = differenceInMinutes(endTime, startTime);

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;

  const exerciseGroups = groupSetsByExercise(sets, exercises);
  const totalSets = sets.length;

  // Get top muscle groups (primary only, sorted by sets)
  const topMuscleGroups = muscleGroupSets
    .filter(mg => !mg.isSecondary)
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 4);

  // Limit exercises shown
  const MAX_EXERCISES = 7;
  const displayExercises = exerciseGroups.slice(0, MAX_EXERCISES);
  const remainingCount = exerciseGroups.length - MAX_EXERCISES;

  return (
    <View style={cardStyles.container}>
      {/* Header */}
      <View style={cardStyles.header}>
        <Text style={cardStyles.appName}>WORKOUT TRACKER</Text>
        <Text style={cardStyles.workoutName}>{workoutName}</Text>
        <Text style={cardStyles.date}>
          {format(startTime, 'EEEE, MMMM d, yyyy')}
        </Text>
      </View>

      {/* Stats Row */}
      <View style={cardStyles.statsRow}>
        <View style={cardStyles.statItem}>
          <Text style={cardStyles.statValue}>{durationStr}</Text>
          <Text style={cardStyles.statLabel}>Duration</Text>
        </View>
        <View style={cardStyles.statDivider} />
        <View style={cardStyles.statItem}>
          <Text style={cardStyles.statValue}>{totalSets}</Text>
          <Text style={cardStyles.statLabel}>Sets</Text>
        </View>
        <View style={cardStyles.statDivider} />
        <View style={cardStyles.statItem}>
          <Text style={cardStyles.statValue}>{exerciseGroups.length}</Text>
          <Text style={cardStyles.statLabel}>Exercises</Text>
        </View>
      </View>

      {/* Exercises */}
      <View style={cardStyles.exercisesSection}>
        {displayExercises.map(({ exercise, sets: exerciseSets }, index) => (
          <View key={exercise?.id || index} style={cardStyles.exerciseRow}>
            <Text style={cardStyles.exerciseName} numberOfLines={1}>
              {exercise?.name || 'Unknown Exercise'}
            </Text>
            <Text style={cardStyles.exerciseSets}>
              {exerciseSets.map((set, i) =>
                `${formatWeight(set.weight, units).replace(' ' + weightUnit(units), '')}×${set.reps}`
              ).join('  ')}
            </Text>
          </View>
        ))}
        {remainingCount > 0 && (
          <Text style={cardStyles.moreExercises}>+ {remainingCount} more exercises</Text>
        )}
      </View>

      {/* Muscle Groups */}
      {topMuscleGroups.length > 0 && (
        <View style={cardStyles.muscleGroupsSection}>
          <Text style={cardStyles.sectionTitle}>MUSCLES WORKED</Text>
          <View style={cardStyles.muscleGroupsRow}>
            {topMuscleGroups.map(mg => (
              <View key={mg.muscleGroup} style={cardStyles.muscleGroupItem}>
                <Text style={cardStyles.muscleGroupSets}>{mg.sets}</Text>
                <Text style={cardStyles.muscleGroupName}>
                  {MUSCLE_GROUP_DISPLAY_NAMES[mg.muscleGroup as PrimaryMuscleGroup] || mg.muscleGroup}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Footer */}
      <View style={cardStyles.footer}>
        <Text style={cardStyles.footerText}>Powered by Workout Tracker</Text>
      </View>
    </View>
  );
}

// Share button component that renders the modal and handles sharing
export function WorkoutShareButton({
  workoutName,
  startedAt,
  completedAt,
  sets,
  exercises,
  muscleGroupSets,
  units,
}: ShareButtonProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    setModalVisible(true);
    setIsSharing(true);

    // Small delay to ensure the view is rendered
    setTimeout(async () => {
      try {
        if (viewShotRef.current?.capture) {
          const uri = await viewShotRef.current.capture();

          setModalVisible(false);
          setIsSharing(false);

          // Share the image
          if (Platform.OS === 'ios') {
            await Share.share({
              url: uri,
              message: `Just finished my ${workoutName} workout!`,
            });
          } else {
            await Share.share({
              message: `Just finished my ${workoutName} workout!`,
              // On Android, we need to use a different approach for images
              // The uri should work with Share.share on newer versions
            });
          }
        }
      } catch (error) {
        console.error('Error sharing workout:', error);
        setModalVisible(false);
        setIsSharing(false);
      }
    }, 500);
  };

  return (
    <>
      <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
        <Text style={styles.shareButtonText}>Share Workout</Text>
      </TouchableOpacity>

      {/* Hidden modal for capturing the shareable card */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          {isSharing && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Generating share image...</Text>
            </View>
          )}
          <ViewShot
            ref={viewShotRef}
            options={{
              format: 'png',
              quality: 1.0,
              result: 'tmpfile',
            }}
            style={styles.viewShot}
          >
            <ShareableCard
              workoutName={workoutName}
              startedAt={startedAt}
              completedAt={completedAt}
              sets={sets}
              exercises={exercises}
              muscleGroupSets={muscleGroupSets}
              units={units}
            />
          </ViewShot>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  shareButton: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  shareButtonText: {
    color: colors.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewShot: {
    // Instagram story aspect ratio approximately
    width: 360,
    minHeight: 640,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: colors.text,
    marginTop: spacing.md,
    fontSize: typography.size.md,
  },
});

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: spacing.xl,
    width: 360,
    minHeight: 640,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingTop: spacing.lg,
  },
  appName: {
    fontSize: typography.size.xs,
    color: colors.primary,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  workoutName: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  date: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.xl,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.separator,
  },
  statValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },
  exercisesSection: {
    marginBottom: spacing.xl,
  },
  exerciseRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  exerciseName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
    marginBottom: 4,
  },
  exerciseSets: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  moreExercises: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  muscleGroupsSection: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  muscleGroupsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  muscleGroupItem: {
    alignItems: 'center',
    minWidth: 70,
    marginBottom: spacing.sm,
  },
  muscleGroupSets: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  muscleGroupName: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  footerText: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
});

export default WorkoutShareButton;
