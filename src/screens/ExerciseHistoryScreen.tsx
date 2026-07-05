import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import { getExerciseHistory, getMaxWeightForExercise, WorkoutSessionSets } from '../services/workoutService';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ExerciseHistory'>;

export function ExerciseHistoryScreen() {
  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const { exerciseId } = route.params as { exerciseId: string };
  const { exercises } = useData();

  const [history, setHistory] = useState<WorkoutSessionSets[]>([]);
  const [maxWeight, setMaxWeight] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const exercise = exercises.find(e => e.id === exerciseId);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      try {
        const [exerciseHistory, max] = await Promise.all([
          getExerciseHistory(exerciseId),
          getMaxWeightForExercise(exerciseId),
        ]);
        setHistory(exerciseHistory);
        setMaxWeight(max);
      } catch (error) {
        console.error('Failed to load exercise history:', error);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [exerciseId]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: exercise?.name || 'Exercise History',
    });
  }, [navigation, exercise]);

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!exercise) {
    return (
      <SafeAreaView style={commonStyles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.emptyText}>Exercise not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* Stats Summary */}
        {history.length > 0 && (
          <Card style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{history.length}</Text>
                <Text style={styles.statLabel}>Workouts</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{maxWeight}</Text>
                <Text style={styles.statLabel}>Max Weight (lbs)</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {history.reduce((sum, session) => sum + session.sets.length, 0)}
                </Text>
                <Text style={styles.statLabel}>Total Sets</Text>
              </View>
            </View>
          </Card>
        )}

        {/* History List */}
        {history.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>No workout history for this exercise</Text>
          </Card>
        ) : (
          <View style={styles.historyList}>
            <Text style={styles.sectionTitle}>Workout History</Text>
            {history.map((session, index) => (
              <Card
                key={session.workoutId}
                style={index < history.length - 1 ? styles.sessionCard : undefined}
              >
                <View style={styles.sessionHeader}>
                  <Text style={styles.sessionDate}>
                    {format(new Date(session.date), 'EEEE, MMMM d, yyyy')}
                    {session.locationId === 'travel' ? '  ✈️ Travel' : ''}
                  </Text>
                  <Text style={styles.sessionTime}>
                    {format(new Date(session.date), 'h:mm a')}
                  </Text>
                </View>
                <View style={styles.setsGrid}>
                  {session.sets.map((set, setIndex) => (
                    <View key={set.id} style={styles.setRow}>
                      <Text style={styles.setNumber}>Set {setIndex + 1}</Text>
                      <Text style={styles.setValue}>
                        {set.weight} lbs × {set.reps} reps
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            ))}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsCard: {
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  historyList: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sessionCard: {
    marginBottom: spacing.md,
  },
  sessionHeader: {
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  sessionDate: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  sessionTime: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  setsGrid: {
    gap: spacing.sm,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  setNumber: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  setValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default ExerciseHistoryScreen;
