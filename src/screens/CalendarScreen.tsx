import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, isSameDay, startOfMonth, endOfMonth } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { CalendarView } from '../components/calendar';
import { useData } from '../contexts/DataContext';
import { getWorkoutDatesInMonth } from '../services/storage';
import { Workout } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function CalendarScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { workouts, templates, userSettings, refreshWorkouts } = useData();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [workoutDates, setWorkoutDates] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadWorkoutDates = useCallback(async () => {
    const dates = await getWorkoutDatesInMonth(
      currentMonth.getFullYear(),
      currentMonth.getMonth()
    );
    setWorkoutDates(dates);
  }, [currentMonth]);

  useFocusEffect(
    useCallback(() => {
      refreshWorkouts();
      loadWorkoutDates();
    }, [loadWorkoutDates, refreshWorkouts])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshWorkouts();
    await loadWorkoutDates();
    setRefreshing(false);
  }, [refreshWorkouts, loadWorkoutDates]);

  const handleMonthChange = useCallback((date: Date) => {
    setCurrentMonth(date);
    setSelectedDate(null);
  }, []);

  // When month changes, reload workout dates
  useFocusEffect(
    useCallback(() => {
      loadWorkoutDates();
    }, [loadWorkoutDates])
  );

  const handleDayPress = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  const handleWorkoutPress = (workoutId: string) => {
    navigation.navigate('WorkoutDetail', { workoutId });
  };

  // Get workouts for selected date
  const selectedDateWorkouts = useMemo(() => {
    if (!selectedDate) return [];

    return workouts.filter(w => {
      if (!w.completedAt) return false;
      return isSameDay(new Date(w.startedAt), selectedDate);
    });
  }, [workouts, selectedDate]);

  const getTemplateName = (workout: Workout): string => {
    if (!workout.templateId) return 'Custom Workout';
    const template = templates.find(t => t.id === workout.templateId);
    return template?.name || 'Custom Workout';
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
      >
        <Text style={styles.title}>Calendar</Text>

        {/* Calendar */}
        <CalendarView
          currentMonth={currentMonth}
          onMonthChange={handleMonthChange}
          workoutDates={workoutDates}
          onDayPress={handleDayPress}
          weekStartDay={userSettings.weekStartDay}
        />

        {/* Selected Date Workouts */}
        {selectedDate && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </Text>
            {selectedDateWorkouts.length === 0 ? (
              <Card>
                <Text style={styles.emptyText}>No workouts on this day</Text>
              </Card>
            ) : (
              <Card padding="none">
                {selectedDateWorkouts.map((workout, index) => (
                  <TouchableOpacity
                    key={workout.id}
                    style={[
                      styles.workoutItem,
                      index === 0 && styles.workoutItemFirst,
                      index === selectedDateWorkouts.length - 1 && styles.workoutItemLast,
                      index < selectedDateWorkouts.length - 1 && styles.workoutItemBorder,
                    ]}
                    onPress={() => handleWorkoutPress(workout.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.workoutInfo}>
                      <Text style={styles.workoutTitle}>
                        {getTemplateName(workout)}
                      </Text>
                      <Text style={styles.workoutTime}>
                        {format(new Date(workout.startedAt), 'h:mm a')}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </Card>
            )}
          </View>
        )}

        {/* Workout Stats for Month */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {format(currentMonth, 'MMMM')} Summary
          </Text>
          <Card>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{workoutDates.length}</Text>
                <Text style={styles.statLabel}>Workout Days</Text>
              </View>
            </View>
          </Card>
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
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  workoutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  workoutItemFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  workoutItemLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  workoutItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  workoutInfo: {
    flex: 1,
  },
  workoutTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  workoutTime: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
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
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});

export default CalendarScreen;
