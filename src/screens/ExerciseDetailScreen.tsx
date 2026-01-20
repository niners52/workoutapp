import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card, ListItem } from '../components/common';
import { useData } from '../contexts/DataContext';
import { getPersonalRecords, PersonalRecord } from '../services/analytics';
import { getLastSetsForExercise } from '../services/storage';
import {
  Exercise,
  WorkoutSet,
  MUSCLE_GROUP_DISPLAY_NAMES,
} from '../types';
import { RootStackParamList } from '../navigation/types';
import { format } from 'date-fns';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ExerciseDetailRouteProp = RouteProp<RootStackParamList, 'ExerciseDetail'>;

export function ExerciseDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ExerciseDetailRouteProp>();
  const { exerciseId } = route.params;
  const { exercises, deleteExercise } = useData();

  const [personalRecord, setPersonalRecord] = useState<PersonalRecord | null>(null);
  const [lastSets, setLastSets] = useState<WorkoutSet[]>([]);

  const exercise = exercises.find(e => e.id === exerciseId);

  useEffect(() => {
    if (exercise) {
      getPersonalRecords(exercise.id).then(setPersonalRecord);
      getLastSetsForExercise(exercise.id, 10).then(setLastSets);
    }
  }, [exercise]);

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
          />
          <ListItem
            title="Location"
            rightElement={
              <Text style={styles.detailValue}>
                {exercise.location === 'both' ? 'Gym & Home' : exercise.location}
              </Text>
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

        {/* Last Session */}
        {lastSets.length > 0 && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Last Session</Text>
            <Text style={styles.lastDate}>
              {format(new Date(lastSets[0].loggedAt), 'EEEE, MMM d, yyyy')}
            </Text>
            {lastSets.map((set, index) => (
              <View key={set.id} style={styles.setRow}>
                <Text style={styles.setNumber}>Set {index + 1}</Text>
                <Text style={styles.setDetail}>
                  {set.weight} lbs × {set.reps} reps
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Actions */}
        {exercise.isCustom && (
          <View style={styles.actions}>
            <Button
              title="Edit Exercise"
              onPress={handleEdit}
              variant="secondary"
              fullWidth
            />
            <Button
              title="Delete Exercise"
              onPress={handleDelete}
              variant="destructive"
              fullWidth
              style={styles.deleteButton}
            />
          </View>
        )}
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
  lastDate: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
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
