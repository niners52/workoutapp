/**
 * Home -> Goals: progress toward each goal in the goals table. Weight band
 * from the 7-day morning average, tape goals from the latest measurement,
 * lift goals from the best set of the last 12 weeks. Hidden with no goals.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { Card } from '../common';
import { useData } from '../../contexts/DataContext';
import { goalProgress } from '../../services/goals';
import { getCachedGoals, loadGoals } from '../../services/goalsStore';
import type { Goal } from '../../types';

const GROUPS: Array<{ type: Goal['type']; title: string }> = [
  { type: 'weight_band', title: 'Body weight' },
  { type: 'measurement', title: 'Measurements' },
  { type: 'lift', title: 'Lifts' },
];

export function GoalsCard() {
  const { bodyMeasurements, sets, exercises } = useData();
  const [goals, setGoals] = useState<Goal[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getCachedGoals().then(cached => live && cached.length > 0 && setGoals(prev => prev ?? cached));
      loadGoals().then(fresh => live && setGoals(fresh));
      return () => {
        live = false;
      };
    }, []),
  );

  const progress = useMemo(
    () => (goals ?? []).map(g => goalProgress(g, { measurements: bodyMeasurements, sets, exercises })),
    [goals, bodyMeasurements, sets, exercises],
  );

  if (!goals || goals.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Goals</Text>
      <Card>
        {GROUPS.map(group => {
          const rows = progress.filter(p => p.goal.type === group.type);
          if (rows.length === 0) return null;
          return (
            <View key={group.type} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              {rows.map(p => (
                <View key={p.goal.id} style={styles.row} testID={`goal-${p.goal.id}`}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.label}>{p.goal.label}</Text>
                    <Text style={[styles.current, p.met && styles.met]}>{p.current ?? '—'}</Text>
                  </View>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${Math.round((p.fraction ?? 0) * 100)}%` },
                        p.met ? styles.fillMet : null,
                      ]}
                    />
                  </View>
                  {p.detail ? <Text style={styles.detail}>{p.met ? `✓ ${p.detail}` : p.detail}</Text> : null}
                </View>
              ))}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  title: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text, marginBottom: spacing.sm },
  group: { marginBottom: spacing.sm },
  groupTitle: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  row: { paddingVertical: spacing.xs },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: typography.size.md, color: colors.text, flex: 1 },
  current: { fontSize: typography.size.sm, color: colors.text, fontWeight: typography.weight.semibold },
  met: { color: colors.healthGood },
  track: {
    height: 6,
    borderRadius: borderRadius.full ?? 3,
    backgroundColor: colors.backgroundTertiary,
    overflow: 'hidden',
    marginTop: 4,
  },
  fill: { height: 6, backgroundColor: colors.primary },
  fillMet: { backgroundColor: colors.healthGood },
  detail: { fontSize: typography.size.xs, color: colors.textSecondary, marginTop: 2 },
});
