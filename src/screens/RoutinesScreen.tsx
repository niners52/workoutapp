import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card, Button } from '../components/common';
import { useData } from '../contexts/DataContext';
import { RootStackParamList } from '../navigation/types';
import { DAY_NAMES_SHORT } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function RoutinesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { routines, templates, getActiveRoutine } = useData();

  const activeRoutine = getActiveRoutine();

  const getTemplateNamesForRoutine = (routineId: string) => {
    const routine = routines.find(r => r.id === routineId);
    if (!routine) return '';

    const workoutDays = routine.daySchedule
      .filter(d => d.templateIds && d.templateIds.length > 0)
      .length;

    return `${workoutDays} workout days`;
  };

  const getScheduleSummary = (routineId: string) => {
    const routine = routines.find(r => r.id === routineId);
    if (!routine) return '';

    return routine.daySchedule
      .map((d) => {
        if (!d.templateIds || d.templateIds.length === 0) return null;
        const templateNames = d.templateIds
          .map(id => templates.find(t => t.id === id)?.name)
          .filter(Boolean);
        if (templateNames.length === 0) return null;
        return `${DAY_NAMES_SHORT[d.day]}: ${templateNames.join(' + ')}`;
      })
      .filter(Boolean)
      .join(', ');
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>{'‹ Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Routines</Text>
        </View>

        {/* Create Button */}
        <Button
          title="Create New Routine"
          onPress={() => navigation.navigate('CreateRoutine')}
          fullWidth
          size="large"
        />

        {/* Active Routine */}
        {activeRoutine && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Routine</Text>
            <Card padding="none">
              <TouchableOpacity
                style={styles.routineItem}
                onPress={() => navigation.navigate('RoutineDetail', { routineId: activeRoutine.id })}
                activeOpacity={0.7}
              >
                <View style={styles.routineInfo}>
                  <View style={styles.routineNameRow}>
                    <Text style={styles.routineName}>{activeRoutine.name}</Text>
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>Active</Text>
                    </View>
                  </View>
                  <Text style={styles.routineSubtitle}>
                    {getTemplateNamesForRoutine(activeRoutine.id)}
                  </Text>
                  <Text style={styles.schedulePreview} numberOfLines={2}>
                    {getScheduleSummary(activeRoutine.id)}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            </Card>
          </View>
        )}

        {/* Other Routines */}
        {routines.filter(r => !r.isActive).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {activeRoutine ? 'Other Routines' : 'Your Routines'}
            </Text>
            <Card padding="none">
              {routines
                .filter(r => !r.isActive)
                .map((routine, index, arr) => (
                  <TouchableOpacity
                    key={routine.id}
                    style={[
                      styles.routineItem,
                      index === 0 && styles.routineItemFirst,
                      index === arr.length - 1 && styles.routineItemLast,
                      index < arr.length - 1 && styles.routineItemBorder,
                    ]}
                    onPress={() => navigation.navigate('RoutineDetail', { routineId: routine.id })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.routineInfo}>
                      <Text style={styles.routineName}>{routine.name}</Text>
                      <Text style={styles.routineSubtitle}>
                        {getTemplateNamesForRoutine(routine.id)}
                      </Text>
                      <Text style={styles.schedulePreview} numberOfLines={2}>
                        {getScheduleSummary(routine.id)}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
            </Card>
          </View>
        )}

        {/* Empty State */}
        {routines.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Routines Yet</Text>
            <Text style={styles.emptyText}>
              Create a routine to plan your weekly workouts and see projected volume toward your goals.
            </Text>
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
  header: {
    marginBottom: spacing.lg,
  },
  backButton: {
    fontSize: typography.size.md,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
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
  routineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  routineItemFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  routineItemLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  routineItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  routineInfo: {
    flex: 1,
  },
  routineNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  routineName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  routineSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  schedulePreview: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 4,
  },
  activeBadge: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  activeBadgeText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    color: colors.success,
  },
  chevron: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default RoutinesScreen;
