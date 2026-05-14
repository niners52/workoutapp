import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { format, startOfWeek, subWeeks, addDays, parseISO, isAfter } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../theme';
import { Card } from '../components/common';
import { WeeklySummaryModal } from '../components/WeeklySummaryModal';
import { useData } from '../contexts/DataContext';
import { formatVolume } from '../services/units';

const WEEKS_TO_SHOW = 12;

interface WeekStat {
  weekStart: Date;
  weekEnd: Date;
  workouts: number;
  sets: number;
  volume: number;
}

/**
 * Past Weeks list. Each row summarizes one week (workouts / sets / volume),
 * tapping opens the detailed `WeeklySummaryModal` for that week.
 *
 * Trends are shown inline as ↑/↓ deltas vs. the prior week so users can
 * scroll the list and see momentum without a separate chart screen.
 */
export function WeeklyHistoryScreen({ embedded }: { embedded?: boolean } = {}) {
  const { workouts, sets, userSettings } = useData();
  const units = userSettings?.units || 'imperial';
  const weekStartsOn = userSettings?.weekStartDay === 'monday' ? 1 : 0;

  const [modalWeekStart, setModalWeekStart] = useState<Date | null>(null);

  const weeks = useMemo<WeekStat[]>(() => {
    const today = new Date();
    const thisWeekStart = startOfWeek(today, { weekStartsOn });
    const result: WeekStat[] = [];

    for (let i = 0; i < WEEKS_TO_SHOW; i++) {
      const weekStart = subWeeks(thisWeekStart, i);
      const weekEnd = addDays(weekStart, 7);
      const weekWorkouts = workouts.filter(w => {
        if (!w.completedAt) return false;
        const d = parseISO(w.startedAt);
        return d >= weekStart && d < weekEnd;
      });
      const deloadIds = new Set(weekWorkouts.filter(w => w.isDeload).map(w => w.id));
      const weekSets = sets.filter(s => {
        const d = parseISO(s.loggedAt);
        return d >= weekStart && d < weekEnd && !deloadIds.has(s.workoutId);
      });
      const volume = weekSets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
      result.push({
        weekStart,
        weekEnd: addDays(weekStart, 6),
        workouts: weekWorkouts.length,
        sets: weekSets.length,
        volume,
      });
    }
    return result;
  }, [workouts, sets, weekStartsOn]);

  const renderTrend = (current: number, previous: number | undefined) => {
    if (previous === undefined || previous === 0) return null;
    const diff = current - previous;
    if (diff === 0) return <Text style={[styles.trendBadge, styles.trendFlat]}>—</Text>;
    const pct = Math.round((diff / previous) * 100);
    const up = diff > 0;
    return (
      <Text style={[styles.trendBadge, up ? styles.trendUp : styles.trendDown]}>
        {up ? '↑' : '↓'} {Math.abs(pct)}%
      </Text>
    );
  };

  const today = new Date();

  const content = (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Weekly History</Text>
      <Text style={styles.subtitle}>Last {WEEKS_TO_SHOW} weeks. Tap a week for the full summary.</Text>

      {weeks.map((week, i) => {
        const isCurrent = i === 0;
        const previous = weeks[i + 1];
        const isFuture = isAfter(week.weekStart, today);
        if (isFuture) return null;

        return (
          <TouchableOpacity
            key={week.weekStart.toISOString()}
            activeOpacity={0.7}
            onPress={() => setModalWeekStart(week.weekStart)}
          >
            <Card style={styles.weekCard}>
              <View style={styles.weekHeader}>
                <View style={styles.weekHeaderLeft}>
                  <Text style={styles.weekDate}>
                    {format(week.weekStart, 'MMM d')} – {format(week.weekEnd, 'MMM d')}
                  </Text>
                  {isCurrent && <Text style={styles.thisWeekBadge}>This week</Text>}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statColumn}>
                  <Text style={styles.statValue}>{week.workouts}</Text>
                  <Text style={styles.statLabel}>Workouts</Text>
                  {renderTrend(week.workouts, previous?.workouts)}
                </View>
                <View style={styles.statColumn}>
                  <Text style={styles.statValue}>{week.sets}</Text>
                  <Text style={styles.statLabel}>Sets</Text>
                  {renderTrend(week.sets, previous?.sets)}
                </View>
                <View style={styles.statColumn}>
                  <Text style={styles.statValue}>
                    {week.volume > 0 ? formatVolume(week.volume, units) : '—'}
                  </Text>
                  <Text style={styles.statLabel}>Volume</Text>
                  {renderTrend(week.volume, previous?.volume)}
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <>
      {content}
      {modalWeekStart && (
        <WeeklySummaryModal
          visible={!!modalWeekStart}
          onDismiss={() => setModalWeekStart(null)}
          weekStart={modalWeekStart}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.base,
  },
  weekCard: {
    marginBottom: spacing.sm,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  weekHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  weekDate: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  thisWeekBadge: {
    fontSize: typography.size.xs,
    color: colors.textOnPrimary,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    fontWeight: typography.weight.semibold,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  trendBadge: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    marginTop: 4,
  },
  trendUp: {
    color: colors.success,
  },
  trendDown: {
    color: colors.error,
  },
  trendFlat: {
    color: colors.textTertiary,
  },
});

export default WeeklyHistoryScreen;
