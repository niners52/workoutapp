import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button } from '../components/common';
import { useWorkout } from '../contexts/WorkoutContext';
import { TemplatesScreen } from './TemplatesScreen';
import { ExercisesScreen } from './ExercisesScreen';
import { RoutinesScreen } from './RoutinesScreen';
import { ActiveWorkoutScreen } from './ActiveWorkoutScreen';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type TrainTab = 'templates' | 'exercises' | 'routines';

const TABS: { key: TrainTab; label: string }[] = [
  { key: 'templates', label: 'Templates' },
  { key: 'exercises', label: 'Exercises' },
  { key: 'routines', label: 'Routines' },
];

export function TrainScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { isWorkoutActive } = useWorkout();
  const [activeTab, setActiveTab] = useState<TrainTab>('templates');

  const handleStartWorkout = () => {
    navigation.navigate('StartWorkout');
  };

  // When a workout is active, show it inline in this tab
  if (isWorkoutActive) {
    return <ActiveWorkoutScreen embedded />;
  }

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      {/* Start Workout Button */}
      <View style={styles.buttonContainer}>
        <Button
          title="Start Workout"
          onPress={handleStartWorkout}
          size="large"
          fullWidth
        />
      </View>

      {/* Segment Control */}
      <View style={styles.segmentContainer}>
        <View style={styles.segmentRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.segment, activeTab === tab.key && styles.segmentActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.segmentText, activeTab === tab.key && styles.segmentTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'templates' && <TemplatesScreen embedded />}
        {activeTab === 'exercises' && <ExercisesScreen embedded />}
        {activeTab === 'routines' && <RoutinesScreen embedded />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  segmentContainer: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md - 2,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
  content: {
    flex: 1,
  },
});

export default TrainScreen;
