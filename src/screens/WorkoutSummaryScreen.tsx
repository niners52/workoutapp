import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import {
  MUSCLE_GROUP_DISPLAY_NAMES,
  PrimaryMuscleGroup,
  ANALYTICS_CATEGORIES,
} from '../types';
import { RootStackParamList } from '../navigation/types';

type WorkoutSummaryRouteProp = RouteProp<RootStackParamList, 'WorkoutSummary'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface MuscleGroupSetData {
  muscleGroup: string;
  sets: number;
  isSecondary: boolean;
}

// Group muscle groups by analytics category
function groupByCategory(muscleGroupSets: MuscleGroupSetData[]): {
  category: string;
  items: MuscleGroupSetData[];
}[] {
  const categoryGroups: { category: string; items: MuscleGroupSetData[] }[] = [];

  ANALYTICS_CATEGORIES.forEach(cat => {
    const items = muscleGroupSets.filter(mg =>
      cat.muscleGroups.includes(mg.muscleGroup as PrimaryMuscleGroup)
    );
    if (items.length > 0) {
      categoryGroups.push({
        category: cat.name,
        items: items.sort((a, b) => b.sets - a.sets),
      });
    }
  });

  return categoryGroups;
}

export function WorkoutSummaryScreen() {
  const route = useRoute<WorkoutSummaryRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { startedAt, completedAt, totalSets, muscleGroupSets } = route.params;

  const startTime = parseISO(startedAt);
  const endTime = parseISO(completedAt);
  const durationMinutes = differenceInMinutes(endTime, startTime);

  // Format duration
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const durationStr = hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes} min`;

  // Group by category
  const categoryGroups = groupByCategory(muscleGroupSets);

  // Calculate primary sets (total excluding secondary contributions)
  const primarySets = muscleGroupSets
    .filter(mg => !mg.isSecondary)
    .reduce((sum, mg) => sum + mg.sets, 0);

  const handleDone = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.title}>Workout Complete!</Text>
          <Text style={styles.subtitle}>
            {format(startTime, 'EEEE, MMM d')} at {format(startTime, 'h:mm a')}
          </Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{durationStr}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{totalSets}</Text>
            <Text style={styles.statLabel}>Total Sets</Text>
          </Card>
        </View>

        {/* Muscle Groups Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Muscles Worked</Text>

          {categoryGroups.length === 0 ? (
            <Card>
              <Text style={styles.emptyText}>No exercises logged</Text>
            </Card>
          ) : (
            categoryGroups.map(group => (
              <Card key={group.category} style={styles.categoryCard}>
                <Text style={styles.categoryTitle}>{group.category}</Text>
                {group.items.map((item, index) => (
                  <View
                    key={item.muscleGroup}
                    style={[
                      styles.muscleRow,
                      index === group.items.length - 1 && styles.muscleRowLast,
                    ]}
                  >
                    <View style={styles.muscleInfo}>
                      <Text style={[
                        styles.muscleName,
                        item.isSecondary && styles.muscleNameSecondary,
                      ]}>
                        {MUSCLE_GROUP_DISPLAY_NAMES[item.muscleGroup as PrimaryMuscleGroup]}
                      </Text>
                      {item.isSecondary && (
                        <Text style={styles.secondaryBadge}>secondary</Text>
                      )}
                    </View>
                    <Text style={[
                      styles.musclesets,
                      item.isSecondary && styles.muscleSetsSecondary,
                    ]}>
                      {item.sets} sets
                    </Text>
                  </View>
                ))}
              </Card>
            ))
          )}
        </View>
      </ScrollView>

      {/* Done Button */}
      <View style={styles.buttonContainer}>
        <Button
          title="Done"
          onPress={handleDone}
          size="large"
          fullWidth
        />
      </View>
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
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  checkmark: {
    fontSize: 48,
    color: colors.success,
    marginBottom: spacing.md,
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
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
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
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  categoryCard: {
    marginBottom: spacing.md,
  },
  categoryTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  muscleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  muscleRowLast: {
    borderBottomWidth: 0,
  },
  muscleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  muscleName: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  muscleNameSecondary: {
    color: colors.textSecondary,
  },
  secondaryBadge: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  musclesets: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.primary,
  },
  muscleSetsSecondary: {
    color: colors.textSecondary,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.base,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
});

export default WorkoutSummaryScreen;
