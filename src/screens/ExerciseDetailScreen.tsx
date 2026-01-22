import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card, ListItem } from '../components/common';
import { useData } from '../contexts/DataContext';
import { getPersonalRecords, PersonalRecord } from '../services/analytics';
import { getSetsByExerciseId } from '../services/storage';
import {
  Exercise,
  WorkoutSet,
  MUSCLE_GROUP_DISPLAY_NAMES,
  WorkoutLocation,
  CABLE_ACCESSORY_DISPLAY_NAMES,
} from '../types';
import { RootStackParamList } from '../navigation/types';
import { format } from 'date-fns';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ExerciseDetailRouteProp = RouteProp<RootStackParamList, 'ExerciseDetail'>;

const screenWidth = Dimensions.get('window').width;

interface SessionData {
  date: string;
  sets: WorkoutSet[];
  maxWeight: number;
  maxReps: number;
  totalVolume: number;
}

export function ExerciseDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ExerciseDetailRouteProp>();
  const { exerciseId } = route.params;
  const { exercises, deleteExercise, locations } = useData();

  const [personalRecord, setPersonalRecord] = useState<PersonalRecord | null>(null);
  const [allSets, setAllSets] = useState<WorkoutSet[]>([]);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const exercise = exercises.find(e => e.id === exerciseId);

  useEffect(() => {
    if (exercise) {
      getPersonalRecords(exercise.id).then(setPersonalRecord);
      getSetsByExerciseId(exercise.id).then(sets => {
        // Sort by date descending
        const sorted = sets.sort((a, b) =>
          new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
        );
        setAllSets(sorted);
      });
    }
  }, [exercise]);

  // Group sets by session (date)
  const sessions: SessionData[] = useMemo(() => {
    const sessionMap = new Map<string, WorkoutSet[]>();

    allSets.forEach(set => {
      const dateKey = format(new Date(set.loggedAt), 'yyyy-MM-dd');
      if (!sessionMap.has(dateKey)) {
        sessionMap.set(dateKey, []);
      }
      sessionMap.get(dateKey)!.push(set);
    });

    return Array.from(sessionMap.entries())
      .map(([date, sets]) => ({
        date,
        sets: sets.sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()),
        maxWeight: Math.max(...sets.map(s => s.weight)),
        maxReps: Math.max(...sets.map(s => s.reps)),
        totalVolume: sets.reduce((sum, s) => sum + s.weight * s.reps, 0),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allSets]);

  // Prepare chart data (last 12 sessions, chronological order for chart)
  const chartSessions = useMemo(() => {
    return [...sessions].reverse().slice(-12);
  }, [sessions]);

  const toggleSession = (date: string) => {
    const newExpanded = new Set(expandedSessions);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedSessions(newExpanded);
  };

  if (!exercise) {
    return (
      <SafeAreaView style={commonStyles.safeArea}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Exercise not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleEdit = () => {
    navigation.navigate('EditExercise', { exerciseId });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Exercise',
      'Are you sure you want to delete this exercise? This will not delete your logged sets.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteExercise(exerciseId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const secondaryMuscles = exercise.secondaryMuscleGroups
    .map(mg => MUSCLE_GROUP_DISPLAY_NAMES[mg])
    .join(', ');

  // Get location names for display
  const getLocationDisplay = () => {
    if (exercise.locationIds && exercise.locationIds.length > 0) {
      return exercise.locationIds
        .map(id => locations.find(l => l.id === id)?.name || id)
        .join(', ');
    }
    // Fallback to deprecated location field
    if (exercise.location === 'both') return 'Gym, Home';
    if (exercise.location === 'gym') return 'Gym';
    if (exercise.location === 'home') return 'Home';
    return 'Unknown';
  };

  // Calculate chart dimensions
  const maxWeight = chartSessions.length > 0 ? Math.max(...chartSessions.map(s => s.maxWeight)) : 100;
  const maxReps = chartSessions.length > 0 ? Math.max(...chartSessions.map(s => s.maxReps)) : 20;

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{exercise.name}</Text>
          {exercise.isCustom && (
            <Text style={styles.customBadge}>Custom Exercise</Text>
          )}
        </View>

        {/* Muscle Groups */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Muscle Groups</Text>
          <ListItem
            title="Primary"
            rightElement={
              <Text style={styles.muscleValue}>
                {MUSCLE_GROUP_DISPLAY_NAMES[exercise.primaryMuscleGroup]}
              </Text>
            }
            isFirst
            isLast={!secondaryMuscles}
          />
          {secondaryMuscles && (
            <ListItem
              title="Secondary"
              rightElement={
                <Text style={styles.muscleValue}>{secondaryMuscles}</Text>
              }
              isLast
            />
          )}
        </Card>

        {/* Details */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <ListItem
            title="Equipment"
            rightElement={
              <Text style={styles.detailValue}>{exercise.equipment}</Text>
            }
            isFirst
            isLast={!exercise.cableAccessory && !getLocationDisplay()}
          />
          {exercise.cableAccessory && (
            <ListItem
              title="Cable Accessory"
              rightElement={
                <Text style={styles.detailValue}>
                  {CABLE_ACCESSORY_DISPLAY_NAMES[exercise.cableAccessory]}
                </Text>
              }
              isLast={!getLocationDisplay()}
            />
          )}
          <ListItem
            title="Location"
            rightElement={
              <Text style={styles.detailValue}>{getLocationDisplay()}</Text>
            }
            isLast
          />
        </Card>

        {/* Personal Records */}
        {personalRecord && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Records</Text>
            <View style={styles.prGrid}>
              <View style={styles.prItem}>
                <Text style={styles.prValue}>{personalRecord.maxWeight} lbs</Text>
                <Text style={styles.prLabel}>Max Weight</Text>
              </View>
              <View style={styles.prItem}>
                <Text style={styles.prValue}>{personalRecord.maxReps}</Text>
                <Text style={styles.prLabel}>Max Reps</Text>
              </View>
              <View style={styles.prItem}>
                <Text style={styles.prValue}>{personalRecord.maxVolume}</Text>
                <Text style={styles.prLabel}>Max Volume</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Weight Progression Chart */}
        {chartSessions.length > 1 && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Weight Progression</Text>
            <View style={styles.chart}>
              <View style={styles.chartYAxis}>
                <Text style={styles.chartYLabel}>{maxWeight}</Text>
                <Text style={styles.chartYLabel}>{Math.round(maxWeight / 2)}</Text>
                <Text style={styles.chartYLabel}>0</Text>
              </View>
              <View style={styles.chartBarsContainer}>
                {chartSessions.map((session) => {
                  const chartHeight = 80; // Fixed height in pixels
                  const barHeight = Math.max((session.maxWeight / maxWeight) * chartHeight, 4);
                  return (
                    <View key={session.date} style={styles.chartBarColumn}>
                      <View style={styles.chartBarArea}>
                        <View
                          style={[
                            styles.chartBar,
                            styles.chartBarWeight,
                            { height: barHeight },
                          ]}
                        />
                      </View>
                      <Text style={styles.chartXLabel}>
                        {format(new Date(session.date), 'M/d')}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <Text style={styles.chartUnit}>lbs</Text>
          </Card>
        )}

        {/* Reps Progression Chart */}
        {chartSessions.length > 1 && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Reps Progression</Text>
            <View style={styles.chart}>
              <View style={styles.chartYAxis}>
                <Text style={styles.chartYLabel}>{maxReps}</Text>
                <Text style={styles.chartYLabel}>{Math.round(maxReps / 2)}</Text>
                <Text style={styles.chartYLabel}>0</Text>
              </View>
              <View style={styles.chartBarsContainer}>
                {chartSessions.map((session) => {
                  const chartHeight = 80; // Fixed height in pixels
                  const barHeight = Math.max((session.maxReps / maxReps) * chartHeight, 4);
                  return (
                    <View key={session.date} style={styles.chartBarColumn}>
                      <View style={styles.chartBarArea}>
                        <View
                          style={[
                            styles.chartBar,
                            styles.chartBarReps,
                            { height: barHeight },
                          ]}
                        />
                      </View>
                      <Text style={styles.chartXLabel}>
                        {format(new Date(session.date), 'M/d')}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <Text style={styles.chartUnit}>reps</Text>
          </Card>
        )}

        {/* All Sessions History */}
        {sessions.length > 0 && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>
              Session History ({sessions.length} sessions)
            </Text>
            {sessions.map((session, sessionIndex) => {
              const isExpanded = expandedSessions.has(session.date);
              const isFirst = sessionIndex === 0;

              return (
                <View key={session.date}>
                  <TouchableOpacity
                    style={[
                      styles.sessionHeader,
                      sessionIndex > 0 && styles.sessionHeaderBorder,
                    ]}
                    onPress={() => toggleSession(session.date)}
                  >
                    <View style={styles.sessionHeaderLeft}>
                      <Text style={styles.sessionDate}>
                        {format(new Date(session.date), 'MMM d, yyyy')}
                      </Text>
                      {isFirst && (
                        <Text style={styles.latestBadge}>Latest</Text>
                      )}
                    </View>
                    <View style={styles.sessionHeaderRight}>
                      <Text style={styles.sessionSummary}>
                        {session.sets.length} sets · {session.maxWeight} lbs
                      </Text>
                      <Text style={styles.expandIcon}>
                        {isExpanded ? '▼' : '▶'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.sessionSets}>
                      {session.sets.map((set, setIndex) => (
                        <View key={set.id} style={styles.setRow}>
                          <Text style={styles.setNumber}>Set {setIndex + 1}</Text>
                          <Text style={styles.setDetail}>
                            {set.weight} lbs × {set.reps} reps
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        )}

        {/* Actions - Edit available for all, Delete only for custom */}
        <View style={styles.actions}>
          <Button
            title="Edit Exercise"
            onPress={handleEdit}
            variant="secondary"
            fullWidth
          />
          {exercise.isCustom && (
            <Button
              title="Delete Exercise"
              onPress={handleDelete}
              variant="destructive"
              fullWidth
              style={styles.deleteButton}
            />
          )}
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
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  customBadge: {
    fontSize: typography.size.sm,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  muscleValue: {
    fontSize: typography.size.md,
    color: colors.text,
  },
  detailValue: {
    fontSize: typography.size.md,
    color: colors.text,
    textTransform: 'capitalize',
  },
  prGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  prItem: {
    alignItems: 'center',
  },
  prValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  prLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  // Chart styles
  chart: {
    flexDirection: 'row',
    height: 120,
  },
  chartYAxis: {
    width: 40,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: spacing.xs,
    paddingBottom: 24,
  },
  chartYLabel: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  chartBarsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  chartBarColumn: {
    flex: 1,
    alignItems: 'center',
    maxWidth: 40,
  },
  chartBarArea: {
    height: 80,
    width: 20,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBar: {
    width: 16,
    borderRadius: borderRadius.sm,
    minHeight: 4,
  },
  chartBarWeight: {
    backgroundColor: colors.primary,
  },
  chartBarReps: {
    backgroundColor: colors.success,
  },
  chartXLabel: {
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  chartUnit: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  // Session history styles
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  sessionHeaderBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  sessionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sessionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sessionDate: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  latestBadge: {
    fontSize: typography.size.xs,
    color: colors.primary,
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  sessionSummary: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  expandIcon: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  sessionSets: {
    paddingLeft: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  setNumber: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    width: 60,
  },
  setDetail: {
    fontSize: typography.size.md,
    color: colors.text,
  },
  actions: {
    marginTop: spacing.lg,
  },
  deleteButton: {
    marginTop: spacing.md,
  },
});

export default ExerciseDetailScreen;
