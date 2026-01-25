import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card, Button } from '../components/common';
import { ProgressBar } from '../components/common/ProgressBar';
import { useData } from '../contexts/DataContext';
import { RootStackParamList } from '../navigation/types';
import {
  DAY_NAMES,
  MUSCLE_GROUP_DISPLAY_NAMES,
} from '../types';
import { calculateProjectedVolumeForRoutine, aggregateIntoCategories } from '../services/analytics';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutineDetailRouteProp = RouteProp<RootStackParamList, 'RoutineDetail'>;

export function RoutineDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutineDetailRouteProp>();
  const { routineId } = route.params;

  const {
    routines,
    templates,
    exercises,
    userSettings,
    setActiveRoutine,
    deleteRoutine,
  } = useData();

  const routine = routines.find(r => r.id === routineId);

  if (!routine) {
    return (
      <SafeAreaView style={commonStyles.safeArea}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Routine not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Calculate projected volume
  const projectedVolume = useMemo(() => {
    return calculateProjectedVolumeForRoutine(
      routine,
      templates,
      exercises,
      userSettings.muscleGroupTargets
    );
  }, [routine, templates, exercises, userSettings.muscleGroupTargets]);

  const categoryVolumes = useMemo(() => {
    return aggregateIntoCategories(projectedVolume);
  }, [projectedVolume]);

  const getTemplatesForDay = (day: number) => {
    const schedule = routine.daySchedule.find(d => d.day === day);
    if (!schedule?.templateIds || schedule.templateIds.length === 0) return [];
    return schedule.templateIds
      .map(id => templates.find(t => t.id === id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
  };

  const workoutDayCount = routine.daySchedule.filter(d => d.templateIds && d.templateIds.length > 0).length;

  const handleSetActive = async () => {
    await setActiveRoutine(routine.id);
    Alert.alert('Routine Activated', `"${routine.name}" is now your active routine.`);
  };

  const handleDeactivate = async () => {
    await setActiveRoutine(null);
  };

  const handleEdit = () => {
    navigation.navigate('EditRoutine', { routineId: routine.id });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Routine',
      `Are you sure you want to delete "${routine.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRoutine(routineId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>{'‹ Back'}</Text>
          </TouchableOpacity>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{routine.name}</Text>
            {routine.isActive && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            )}
          </View>
          <Text style={styles.subtitle}>
            {workoutDayCount} workout day{workoutDayCount !== 1 ? 's' : ''} per week
          </Text>
        </View>

        {/* Set Active Button */}
        {!routine.isActive && (
          <Button
            title="Set as Active Routine"
            onPress={handleSetActive}
            fullWidth
            size="large"
          />
        )}

        {/* Weekly Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Schedule</Text>
          <Card padding="none">
            {DAY_NAMES.map((dayName, dayIndex) => {
              const dayTemplates = getTemplatesForDay(dayIndex);
              const isRestDay = dayTemplates.length === 0;

              return (
                <View
                  key={dayIndex}
                  style={[
                    styles.dayRow,
                    dayIndex === 0 && styles.dayRowFirst,
                    dayIndex === 6 && styles.dayRowLast,
                    dayIndex < 6 && styles.dayRowBorder,
                  ]}
                >
                  <Text style={styles.dayName}>{dayName}</Text>
                  <View style={styles.dayTemplates}>
                    {isRestDay ? (
                      <Text style={[styles.templateName, styles.restDay]}>Rest</Text>
                    ) : dayTemplates.length === 1 ? (
                      <Text style={styles.templateName}>{dayTemplates[0].name}</Text>
                    ) : (
                      <View style={styles.multipleTemplates}>
                        {dayTemplates.map((t, idx) => (
                          <Text key={t.id} style={styles.templateName}>
                            {t.name}{idx < dayTemplates.length - 1 ? ', ' : ''}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
        </View>

        {/* Projected Volume */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Projected Weekly Volume</Text>
          <Card>
            {categoryVolumes
              .filter(cat => cat.totalTarget > 0)
              .map(category => {
                const progress = category.totalTarget > 0
                  ? (category.totalSets / category.totalTarget) * 100
                  : 0;
                const progressColor = progress >= 100
                  ? colors.success
                  : progress >= 75
                  ? colors.warning
                  : colors.primary;
                const percentText = Math.round(progress);

                return (
                  <View key={category.category} style={styles.volumeRow}>
                    <View style={styles.volumeHeader}>
                      <Text style={styles.volumeLabel}>{category.name}</Text>
                      <Text style={styles.volumeSets}>
                        {category.totalSets}/{category.totalTarget} sets ({percentText}%)
                      </Text>
                    </View>
                    <ProgressBar
                      progress={Math.min(progress, 100)}
                      color={progressColor}
                      height={8}
                    />
                    {/* Individual muscle groups */}
                    {category.muscleGroups
                      .filter(mg => mg.target > 0 || mg.sets > 0)
                      .map(mg => {
                        const mgProgress = mg.target > 0
                          ? Math.round((mg.sets / mg.target) * 100)
                          : 0;

                        return (
                          <View key={mg.muscleGroup} style={styles.subVolumeRow}>
                            <Text style={styles.subVolumeLabel}>
                              {MUSCLE_GROUP_DISPLAY_NAMES[mg.muscleGroup]}
                            </Text>
                            <Text style={styles.subVolumeSets}>
                              {mg.sets}/{mg.target} ({mgProgress}%)
                            </Text>
                          </View>
                        );
                      })}
                  </View>
                );
              })}
          </Card>
          <Text style={styles.hint}>
            Projections based on 3 sets per exercise
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Edit Routine"
            onPress={handleEdit}
            variant="secondary"
            fullWidth
          />
          {routine.isActive && (
            <Button
              title="Deactivate Routine"
              onPress={handleDeactivate}
              variant="secondary"
              fullWidth
              style={styles.actionButton}
            />
          )}
          <Button
            title="Delete Routine"
            onPress={handleDelete}
            variant="destructive"
            fullWidth
            style={styles.actionButton}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.size.lg,
    color: colors.textSecondary,
  },
  header: {
    marginBottom: spacing.lg,
  },
  backButton: {
    fontSize: typography.size.md,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  activeBadge: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  activeBadgeText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.success,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  dayRowFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  dayRowLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  dayRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  dayName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
    width: 100,
  },
  dayTemplates: {
    flex: 1,
    alignItems: 'flex-end',
  },
  multipleTemplates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  templateName: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  restDay: {
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  volumeRow: {
    marginBottom: spacing.lg,
  },
  volumeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  volumeLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  volumeSets: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  subVolumeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: spacing.md,
    marginTop: spacing.xs,
  },
  subVolumeLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  subVolumeSets: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  hint: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  actions: {
    marginTop: spacing.xl,
  },
  actionButton: {
    marginTop: spacing.md,
  },
});

export default RoutineDetailScreen;
